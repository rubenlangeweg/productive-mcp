/**
 * Resolver for JSON:API `included` resources.
 *
 * Productive sideloads related resources under the top-level `included`
 * array when the request includes `include=...`. Tools that want to display
 * resolved names instead of bare IDs need a way to look those resources up
 * by `(type, id)` pair. This class wraps the array in an indexed Map.
 */
import type { JsonApiResource } from './core.js';

export class IncludeResolver {
  private readonly index: Map<string, JsonApiResource>;

  constructor(included: ReadonlyArray<JsonApiResource> | undefined) {
    this.index = new Map();
    if (!included) return;
    for (const resource of included) {
      if (resource && typeof resource.id === 'string' && typeof resource.type === 'string') {
        this.index.set(IncludeResolver.key(resource.type, resource.id), resource);
      }
    }
  }

  /** Build a stable index key from `(type, id)`. */
  static key(type: string, id: string): string {
    return `${type}:${id}`;
  }

  /** Returns the included resource for `(type, id)`, or `undefined`. */
  resolve(type: string, id: string): JsonApiResource | undefined {
    return this.index.get(IncludeResolver.key(type, id));
  }

  /** True if the resolver knows about a resource of the given type+id. */
  has(type: string, id: string): boolean {
    return this.index.has(IncludeResolver.key(type, id));
  }

  /** Number of indexed resources. */
  get size(): number {
    return this.index.size;
  }
}
