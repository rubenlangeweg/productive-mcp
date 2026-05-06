/**
 * Minimal JSON Schema → Zod adapter.
 *
 * The McpServer `registerTool` API only accepts Zod schemas for `inputSchema`.
 * The legacy tool registry in this repo carries hand-written JSON Schema
 * definitions; rewriting all of them as Zod is the job of the
 * m2-tool-modernize-batch* features. For the M2 bootstrap we keep tool
 * surfaces unchanged and translate the existing JSON Schema into a Zod raw
 * shape so the SDK can validate inputs and re-emit them as JSON Schema for
 * `tools/list`.
 *
 * The converter intentionally only covers the subset of JSON Schema actually
 * used by `src/tools/*.ts`. Untranslatable nodes fall back to `z.unknown()`
 * so behaviour stays permissive (we surface the legacy schema text-only via
 * `description`s; nothing here adds stricter validation than was present in
 * the dispatch-switch era).
 */
import { z, type ZodRawShape, type ZodTypeAny } from 'zod';

type JsonSchema = Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getString(node: JsonSchema, key: string): string | undefined {
  const v = node[key];
  return typeof v === 'string' ? v : undefined;
}

function getNumber(node: JsonSchema, key: string): number | undefined {
  const v = node[key];
  return typeof v === 'number' ? v : undefined;
}

function getStringArray(node: JsonSchema, key: string): string[] | undefined {
  const v = node[key];
  if (!Array.isArray(v)) return undefined;
  if (!v.every((x): x is string => typeof x === 'string')) return undefined;
  return v;
}

function applyDescription(schema: ZodTypeAny, node: JsonSchema): ZodTypeAny {
  const description = getString(node, 'description');
  return description ? schema.describe(description) : schema;
}

function applyDefault(schema: ZodTypeAny, node: JsonSchema): ZodTypeAny {
  if ('default' in node) {
    return schema.default(node['default'] as never);
  }
  return schema;
}

function convertString(node: JsonSchema): ZodTypeAny {
  const enumValues = getStringArray(node, 'enum');
  if (enumValues && enumValues.length > 0) {
    // z.enum requires a non-empty tuple of literals.
    const [head, ...tail] = enumValues as [string, ...string[]];
    return z.enum([head, ...tail]);
  }
  let s: ZodTypeAny = z.string();
  const minLength = getNumber(node, 'minLength');
  const maxLength = getNumber(node, 'maxLength');
  if (typeof minLength === 'number') s = (s as z.ZodString).min(minLength);
  if (typeof maxLength === 'number') s = (s as z.ZodString).max(maxLength);
  return s;
}

function convertNumber(node: JsonSchema, integer: boolean): ZodTypeAny {
  let n = integer ? z.number().int() : z.number();
  const minimum = getNumber(node, 'minimum');
  const maximum = getNumber(node, 'maximum');
  if (typeof minimum === 'number') n = n.min(minimum);
  if (typeof maximum === 'number') n = n.max(maximum);
  return n;
}

function convertArray(node: JsonSchema): ZodTypeAny {
  const items = node['items'];
  const itemSchema = isRecord(items) ? convertNode(items) : z.unknown();
  let arr = z.array(itemSchema);
  const minItems = getNumber(node, 'minItems');
  const maxItems = getNumber(node, 'maxItems');
  if (typeof minItems === 'number') arr = arr.min(minItems);
  if (typeof maxItems === 'number') arr = arr.max(maxItems);
  return arr;
}

function convertObject(node: JsonSchema): ZodTypeAny {
  const properties = node['properties'];
  const required = new Set(getStringArray(node, 'required') ?? []);
  if (!isRecord(properties)) {
    return z.object({}).passthrough();
  }
  const shape: ZodRawShape = {};
  for (const [key, raw] of Object.entries(properties)) {
    if (!isRecord(raw)) {
      shape[key] = z.unknown();
      continue;
    }
    let child = convertNode(raw);
    if (!required.has(key)) child = child.optional();
    shape[key] = child;
  }
  return z.object(shape);
}

function convertOneOf(options: unknown[]): ZodTypeAny {
  const schemas = options
    .filter(isRecord)
    .map((opt) => convertNode(opt));
  if (schemas.length === 0) return z.unknown();
  if (schemas.length === 1) return schemas[0]!;
  return z.union(schemas as [ZodTypeAny, ZodTypeAny, ...ZodTypeAny[]]);
}

function convertNode(node: JsonSchema): ZodTypeAny {
  // oneOf / anyOf — we treat both as a discriminated-but-permissive union.
  if (Array.isArray(node['oneOf'])) {
    return applyDescription(applyDefault(convertOneOf(node['oneOf']), node), node);
  }
  if (Array.isArray(node['anyOf'])) {
    return applyDescription(applyDefault(convertOneOf(node['anyOf']), node), node);
  }

  const type = node['type'];
  let schema: ZodTypeAny;
  switch (type) {
    case 'string':
      schema = convertString(node);
      break;
    case 'number':
      schema = convertNumber(node, false);
      break;
    case 'integer':
      schema = convertNumber(node, true);
      break;
    case 'boolean':
      schema = z.boolean();
      break;
    case 'null':
      schema = z.null();
      break;
    case 'array':
      schema = convertArray(node);
      break;
    case 'object':
      schema = convertObject(node);
      break;
    default:
      schema = z.unknown();
  }
  return applyDescription(applyDefault(schema, node), node);
}

/**
 * Convert a JSON Schema *object* (`{ type: 'object', properties: {...} }`)
 * into a Zod raw shape that `McpServer.registerTool` can accept as
 * `inputSchema`.
 *
 * Non-object inputs return an empty shape.
 */
export function jsonSchemaToZodShape(jsonSchema: unknown): ZodRawShape {
  if (!isRecord(jsonSchema)) return {};
  const properties = jsonSchema['properties'];
  const required = new Set(getStringArray(jsonSchema, 'required') ?? []);
  if (!isRecord(properties)) return {};
  const shape: ZodRawShape = {};
  for (const [key, raw] of Object.entries(properties)) {
    if (!isRecord(raw)) {
      shape[key] = required.has(key) ? z.unknown() : z.unknown().optional();
      continue;
    }
    let child = convertNode(raw);
    if (!required.has(key)) child = child.optional();
    shape[key] = child;
  }
  return shape;
}
