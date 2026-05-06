/**
 * Filesystem-backed fixture loader. Reads `tests/fixtures/<resource>/<name>.json`
 * relative to the test directory regardless of the test's location.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(HERE, '..', 'fixtures');

export function loadFixture<T = unknown>(relativePath: string): T {
  const full = join(FIXTURES_DIR, `${relativePath}.json`);
  const raw = readFileSync(full, 'utf-8');
  return JSON.parse(raw) as T;
}
