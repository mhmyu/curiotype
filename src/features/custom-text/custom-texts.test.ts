import { describe, expect, it } from 'vitest';
import { createMemoryStorage } from '@/lib/storage/memory-adapter';
import {
  CUSTOM_TEXTS_KEY,
  MAX_CUSTOM_TEXTS,
  loadCustomTexts,
  mergeCustomTexts,
  parseCustomTexts,
  removeCustomText,
  saveCustomText,
} from './custom-texts';

const entry = (id: string, text: string, savedAt: number) => ({ id, text, savedAt });

describe('parseCustomTexts', () => {
  it('keeps valid entries, newest first', () => {
    expect(parseCustomTexts([entry('a', 'One.', 1), entry('b', 'Two.', 2)])).toEqual([
      entry('b', 'Two.', 2),
      entry('a', 'One.', 1),
    ]);
  });

  it('drops anything that is not a list and every broken entry', () => {
    expect(parseCustomTexts(null)).toEqual([]);
    expect(parseCustomTexts({})).toEqual([]);
    const good = entry('a', 'One.', 1);
    expect(
      parseCustomTexts([
        good,
        null,
        'x',
        [],
        entry('', 'No id.', 1),
        entry('c', '', 1),
        entry('d', 'Caf\u00E9.', 1),
        entry('e', ' padded', 1),
        { id: 'f', text: 'No time.' },
        { id: 'g', text: 'Bad time.', savedAt: Number.NaN },
        { id: 'h', text: 123, savedAt: 1 },
      ]),
    ).toEqual([good]);
  });

  it('drops a repeated id or a repeated text and keeps at most five', () => {
    expect(parseCustomTexts([entry('a', 'One.', 2), entry('a', 'Two.', 1)])).toHaveLength(1);
    expect(parseCustomTexts([entry('a', 'Same.', 2), entry('b', 'Same.', 1)])).toHaveLength(1);
    const many = Array.from({ length: 8 }, (_, i) => entry(`n${i}`, `Text ${i}.`, i));
    const parsed = parseCustomTexts(many);
    expect(parsed).toHaveLength(MAX_CUSTOM_TEXTS);
    expect(parsed[0].id).toBe('n7');
  });
});

describe('mergeCustomTexts', () => {
  it('unites by text, the later save wins, newest first', () => {
    const merged = mergeCustomTexts(
      [entry('a', 'Same.', 5), entry('b', 'Mine.', 4)],
      [entry('c', 'Same.', 9), entry('d', 'Theirs.', 1)],
    );
    expect(merged).toEqual([entry('c', 'Same.', 9), entry('b', 'Mine.', 4), entry('d', 'Theirs.', 1)]);
  });

  it('keeps at most five', () => {
    const current = Array.from({ length: 5 }, (_, i) => entry(`c${i}`, `Mine ${i}.`, 10 + i));
    const incoming = [entry('x', 'Old.', 1), entry('y', 'Newest.', 99)];
    const merged = mergeCustomTexts(current, incoming);
    expect(merged).toHaveLength(MAX_CUSTOM_TEXTS);
    expect(merged[0].text).toBe('Newest.');
    expect(merged.map((item) => item.text)).not.toContain('Old.');
  });
});

describe('saveCustomText', () => {
  it('saves the text as the newest one with an id', async () => {
    const storage = createMemoryStorage();
    const list = await saveCustomText(storage, 'First text.', 100);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ text: 'First text.', savedAt: 100 });
    expect(list[0].id.length).toBeGreaterThan(0);
    expect(await loadCustomTexts(storage)).toEqual(list);
  });

  it('moves a text that is already saved to the top instead of storing it twice', async () => {
    const storage = createMemoryStorage();
    const [first] = await saveCustomText(storage, 'First text.', 100);
    await saveCustomText(storage, 'Second text.', 200);
    const list = await saveCustomText(storage, 'First text.', 300);

    expect(list.map((item) => item.text)).toEqual(['First text.', 'Second text.']);
    expect(list[0]).toEqual({ id: first.id, text: 'First text.', savedAt: 300 });
  });

  it('keeps the last five texts and drops the oldest', async () => {
    const storage = createMemoryStorage();
    for (let i = 1; i <= 7; i += 1) await saveCustomText(storage, `Text ${i}.`, i);
    const list = await loadCustomTexts(storage);
    expect(list.map((item) => item.text)).toEqual(['Text 7.', 'Text 6.', 'Text 5.', 'Text 4.', 'Text 3.']);
  });

  it('refuses a text that is not normalized and changes nothing', async () => {
    const storage = createMemoryStorage();
    await saveCustomText(storage, 'Kept.', 1);
    const list = await saveCustomText(storage, 'Caf\u00E9 \u201Cquoted\u201D', 2);
    expect(list.map((item) => item.text)).toEqual(['Kept.']);
  });
});

describe('removeCustomText', () => {
  it('removes one text by id', async () => {
    const storage = createMemoryStorage();
    await saveCustomText(storage, 'First text.', 1);
    const [second] = await saveCustomText(storage, 'Second text.', 2);
    const list = await removeCustomText(storage, second.id);
    expect(list.map((item) => item.text)).toEqual(['First text.']);
    expect(await loadCustomTexts(storage)).toEqual(list);
  });

  it('writes nothing when the id is unknown', async () => {
    const storage = createMemoryStorage();
    expect(await removeCustomText(storage, 'nope')).toEqual([]);
    expect(await storage.get(CUSTOM_TEXTS_KEY)).toBeNull();
  });
});

describe('loadCustomTexts', () => {
  it('ignores damaged stored data', async () => {
    const storage = createMemoryStorage();
    await storage.set(CUSTOM_TEXTS_KEY, 'broken');
    expect(await loadCustomTexts(storage)).toEqual([]);
  });
});
