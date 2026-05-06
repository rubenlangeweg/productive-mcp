/**
 * Low-level HTTP client for the Productive.io REST API.
 *
 * The `Core` class is the single chokepoint every higher-level resource
 * module uses. Responsibilities:
 *
 * - Inject the `X-Auth-Token` and `X-Organization-Id` headers on every call
 * - Serialise JSON request bodies with the `application/vnd.api+json` type
 * - Map non-2xx responses to `McpError` with descriptive messages
 * - Apply retry-with-backoff (delegated to `./retry.ts`) on 429/5xx
 *
 * Note: pagination, the JSON:API `included` resolver, and per-resource
 * functions live in sibling modules. This file is intentionally small.
 */
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import type { Config } from '../config/index.js';
import { withRetry } from './retry.js';
import { isResponseLike } from './response-utils.js';

/** Minimal JSON:API resource. Higher-level modules narrow the attributes. */
export interface JsonApiResource {
  id: string;
  type: string;
  attributes?: Record<string, unknown>;
  relationships?: Record<string, unknown>;
}

export interface JsonApiList<T extends JsonApiResource = JsonApiResource> {
  data: T[];
  included?: JsonApiResource[];
  meta?: {
    current_page?: number;
    total_pages?: number;
    total_count?: number;
    page_size?: number;
    max_page_size?: number;
    [k: string]: unknown;
  };
  links?: {
    self?: string;
    first?: string;
    next?: string;
    prev?: string;
    last?: string;
    [k: string]: string | undefined;
  };
}

export interface JsonApiSingle<T extends JsonApiResource = JsonApiResource> {
  data: T;
  included?: JsonApiResource[];
  meta?: Record<string, unknown>;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  /** Pre-serialised JSON body (object). Will be JSON.stringified. */
  body?: unknown;
  /** Optional extra headers to merge in (Content-Type can be overridden). */
  headers?: Record<string, string>;
  /** Disable retries for a specific call. Used by retry tests themselves. */
  noRetry?: boolean;
}

export interface CoreOptions {
  apiToken: string;
  organizationId: string;
  baseUrl?: string;
  /** Override fetch (used by tests; defaults to globalThis.fetch). */
  fetchImpl?: typeof fetch;
}

const DEFAULT_BASE_URL = 'https://api.productive.io/api/v2/';

interface ProductiveErrorBody {
  errors?: Array<{
    status?: string;
    title?: string;
    detail?: string;
    source?: { pointer?: string; parameter?: string };
  }>;
}

/**
 * Map a non-OK Productive HTTP response to an `McpError` with an actionable
 * message. The message is composed from the API's own `errors[0].detail` (or
 * `title`) where present, falling back to a status-specific default.
 */
async function mapErrorResponse(response: Response): Promise<McpError> {
  let detail = '';
  let body: ProductiveErrorBody | undefined;
  try {
    body = (await response.json()) as ProductiveErrorBody;
    detail = body.errors?.[0]?.detail ?? body.errors?.[0]?.title ?? '';
  } catch {
    // ignore body-parse failure; we still have the status
  }

  switch (response.status) {
    case 401:
      return new McpError(
        ErrorCode.InternalError,
        `Authentication failed${detail ? `: ${detail}` : '. Check PRODUCTIVE_API_TOKEN.'}`
      );
    case 403:
      return new McpError(
        ErrorCode.InternalError,
        `Permission denied${detail ? `: ${detail}` : '. Account lacks access to this resource.'}`
      );
    case 404:
      return new McpError(
        ErrorCode.InvalidParams,
        `Not found${detail ? `: ${detail}` : '. The requested resource does not exist.'}`
      );
    case 422: {
      const allDetails =
        body?.errors
          ?.map((e) =>
            [e.detail ?? e.title, e.source?.pointer]
              .filter(Boolean)
              .join(' @ ')
          )
          .filter((s) => s.length > 0)
          .join('; ') || detail;
      return new McpError(
        ErrorCode.InvalidParams,
        `Validation failed${allDetails ? `: ${allDetails}` : '. Check the request body.'}`
      );
    }
    case 429:
      return new McpError(
        ErrorCode.InternalError,
        `Rate limited${detail ? `: ${detail}` : '. Retries exhausted.'}`
      );
    default:
      if (response.status >= 500) {
        return new McpError(
          ErrorCode.InternalError,
          `Productive API ${response.status}${detail ? `: ${detail}` : ''}`.trim()
        );
      }
      return new McpError(
        ErrorCode.InternalError,
        `API request failed (${response.status})${detail ? `: ${detail}` : ''}`.trim()
      );
  }
}

/**
 * Productive REST core client.
 *
 * `request<T>` is the universal entry point. `list<T>` and `get<T>` are
 * convenience wrappers that type the JSON:API envelope.
 */
export class Core {
  private readonly apiToken: string;
  private readonly organizationId: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: CoreOptions) {
    this.apiToken = opts.apiToken;
    this.organizationId = opts.organizationId;
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).endsWith('/')
      ? (opts.baseUrl ?? DEFAULT_BASE_URL)
      : `${opts.baseUrl ?? DEFAULT_BASE_URL}/`;
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  /** Build a Core from the validated `Config`. */
  static fromConfig(config: Config): Core {
    return new Core({
      apiToken: config.PRODUCTIVE_API_TOKEN,
      organizationId: config.PRODUCTIVE_ORG_ID,
      baseUrl: config.PRODUCTIVE_API_BASE_URL,
    });
  }

  /**
   * Issue a single request to the Productive API, applying retry-with-backoff
   * unless explicitly opted out.
   */
  async request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
    const exec = async (): Promise<T> => {
      const url = path.startsWith('http')
        ? path
        : `${this.baseUrl}${path.replace(/^\//, '')}`;
      const headers: Record<string, string> = {
        'X-Auth-Token': this.apiToken,
        'X-Organization-Id': this.organizationId,
        Accept: 'application/vnd.api+json',
        ...(opts.body !== undefined
          ? { 'Content-Type': 'application/vnd.api+json' }
          : {}),
        ...opts.headers,
      };
      const init: RequestInit = {
        method: opts.method ?? 'GET',
        headers,
      };
      if (opts.body !== undefined) {
        init.body =
          typeof opts.body === 'string'
            ? opts.body
            : JSON.stringify(opts.body);
      }
      const response = await this.fetchImpl(url, init);
      if (!response.ok) {
        // Throw a Response-shaped error so the retry layer can introspect it.
        // We delay turning it into an McpError until retries are exhausted
        // (or the status is non-retriable).
        throw response;
      }
      if (response.status === 204) {
        // No-content; cast empty object so callers using `void` shapes work.
        return undefined as unknown as T;
      }
      return (await response.json()) as T;
    };

    if (opts.noRetry) {
      try {
        return await exec();
      } catch (err) {
        if (isResponseLike(err)) {
          throw await mapErrorResponse(err);
        }
        throw err;
      }
    }

    try {
      return await withRetry(exec);
    } catch (err) {
      if (isResponseLike(err)) {
        throw await mapErrorResponse(err);
      }
      throw err;
    }
  }

  /** GET a JSON:API collection endpoint and return the typed envelope. */
  list<T extends JsonApiResource = JsonApiResource>(
    path: string,
    query?: URLSearchParams
  ): Promise<JsonApiList<T>> {
    const qs = query?.toString();
    const fullPath = qs ? `${path}${path.includes('?') ? '&' : '?'}${qs}` : path;
    return this.request<JsonApiList<T>>(fullPath);
  }

  /** GET a JSON:API single-resource endpoint. */
  get<T extends JsonApiResource = JsonApiResource>(
    path: string
  ): Promise<JsonApiSingle<T>> {
    return this.request<JsonApiSingle<T>>(path);
  }
}

// Re-export error mapper for retry/tests that need it.
export { mapErrorResponse };
