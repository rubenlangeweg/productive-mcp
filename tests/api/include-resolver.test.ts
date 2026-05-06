/**
 * Tests for `IncludeResolver`.
 *
 * Verifies VAL-FOUNDATION-009 (JSON:API included resources resolved by
 * type+id pair).
 */
import { describe, it, expect } from 'vitest';
import { IncludeResolver } from '../../src/api/include-resolver.js';

describe('IncludeResolver', () => {
  it('resolves resources by (type, id)', () => {
    const resolver = new IncludeResolver([
      {
        type: 'people',
        id: '42',
        attributes: { first_name: 'Marthin', last_name: 'Pieterse' },
      },
      {
        type: 'projects',
        id: '101',
        attributes: { name: 'Website redesign' },
      },
    ]);

    const person = resolver.resolve('people', '42');
    expect(person).toBeDefined();
    expect(person?.attributes?.first_name).toBe('Marthin');

    const project = resolver.resolve('projects', '101');
    expect(project?.attributes?.name).toBe('Website redesign');
  });

  it('returns undefined when type+id is not present', () => {
    const resolver = new IncludeResolver([
      { type: 'people', id: '42', attributes: {} },
    ]);
    expect(resolver.resolve('people', '99')).toBeUndefined();
    expect(resolver.resolve('projects', '42')).toBeUndefined();
  });

  it('handles undefined included array', () => {
    const resolver = new IncludeResolver(undefined);
    expect(resolver.resolve('people', '1')).toBeUndefined();
    expect(resolver.size).toBe(0);
  });

  it('handles empty included array', () => {
    const resolver = new IncludeResolver([]);
    expect(resolver.size).toBe(0);
  });

  it('exposes `has` for existence checks', () => {
    const resolver = new IncludeResolver([
      { type: 'tasks', id: '1', attributes: {} },
    ]);
    expect(resolver.has('tasks', '1')).toBe(true);
    expect(resolver.has('tasks', '2')).toBe(false);
  });

  it('exposes a stable key format via static helper', () => {
    expect(IncludeResolver.key('people', '42')).toBe('people:42');
  });
});
