import { describe, expect, it } from 'vitest';
import { createMemoryStorage } from './memory-adapter';

describe('createMemoryStorage', () => {
  it('returns null for a missing key', async () => {
    expect(await createMemoryStorage().get('missing')).toBeNull();
  });

  it('stores and reads back a value', async () => {
    const storage = createMemoryStorage();
    await storage.set('key', { a: 1, list: [1, 2] });
    expect(await storage.get('key')).toEqual({ a: 1, list: [1, 2] });
  });

  it('stores JSON strings and does not share object references', async () => {
    const storage = createMemoryStorage();
    const value = { n: 1 };
    await storage.set('key', value);
    value.n = 2;
    expect(await storage.get('key')).toEqual({ n: 1 });
    expect(storage.data.get('key')).toBe('{"n":1}');
  });

  it('removes a key', async () => {
    const storage = createMemoryStorage();
    await storage.set('key', 1);
    await storage.remove('key');
    expect(await storage.get('key')).toBeNull();
  });

  it('treats corrupt stored text as missing', async () => {
    const storage = createMemoryStorage(new Map([['key', '{not json']]));
    expect(await storage.get('key')).toBeNull();
  });
});
