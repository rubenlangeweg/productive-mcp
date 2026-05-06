/**
 * Per-resource modules call the API through this minimal Requester
 * interface so they don't depend on the full `ProductiveAPIClient` class.
 * The client implements `Requester` by exposing `makeRequest` as a method
 * (or by passing a bound function).
 *
 * The signature mirrors `fetch` enough to be familiar but takes the
 * already-relative API path (e.g. `companies?filter[...]=...`).
 */
export type Requester = <T>(path: string, options?: RequestInit) => Promise<T>;
