import { describe, expect, it } from 'vitest';
import { createMemoryStorage } from '@/lib/storage/memory-adapter';
import {
  DEFAULT_SETTINGS,
  SETTINGS_KEY,
  loadSettings,
  parseSettings,
  saveSettings,
  type Settings,
} from './settings';

const custom: Settings = {
  contentLang: 'en',
  theme: 'dark',
  fontSize: 'lg',
  dailyGoal: 3,
  sound: true,
  volume: 0.8,
  stopOnError: true,
  caretStyle: 'block',
};

describe('DEFAULT_SETTINGS', () => {
  it('is a valid Settings object (parsing it changes nothing)', () => {
    expect(parseSettings(DEFAULT_SETTINGS)).toEqual(DEFAULT_SETTINGS);
  });

  it('uses the documented defaults', () => {
    expect(DEFAULT_SETTINGS).toEqual({
      contentLang: null,
      theme: 'system',
      fontSize: 'md',
      dailyGoal: 0,
      sound: false,
      volume: 0.5,
      stopOnError: false,
      caretStyle: 'line',
    });
  });
});

describe('parseSettings', () => {
  it.each([[null], [undefined], [42], ['text'], [[]], [true]])(
    'returns the defaults for a non-object (%j)',
    (raw) => {
      expect(parseSettings(raw)).toEqual(DEFAULT_SETTINGS);
    },
  );

  it('keeps every valid value', () => {
    expect(parseSettings(custom)).toEqual(custom);
  });

  it('fills missing fields with defaults (older data without newer fields)', () => {
    expect(parseSettings({ theme: 'light' })).toEqual({ ...DEFAULT_SETTINGS, theme: 'light' });
  });

  it('drops unknown keys', () => {
    const parsed = parseSettings({ ...custom, futureField: 1 });
    expect(parsed).toEqual(custom);
    expect('futureField' in parsed).toBe(false);
  });

  it('replaces each invalid value with its own default and keeps the valid ones', () => {
    const parsed = parseSettings({
      contentLang: 'EN',
      theme: 'sepia',
      fontSize: 'xl',
      dailyGoal: 2,
      sound: 'yes',
      volume: 1.5,
      stopOnError: 1,
      caretStyle: 'dot',
    });
    expect(parsed).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings({ ...custom, theme: 'sepia' })).toEqual({ ...custom, theme: 'system' });
  });

  it.each([[-0.1], [1.01], [NaN], [Infinity], ['0.5'], [null]])(
    'rejects volume %j',
    (volume) => {
      expect(parseSettings({ volume }).volume).toBe(DEFAULT_SETTINGS.volume);
    },
  );

  it.each([[0], [0.5], [1]])('accepts volume %j', (volume) => {
    expect(parseSettings({ volume }).volume).toBe(volume);
  });

  it.each([[0], [1], [3], [5]])('accepts dailyGoal %j', (dailyGoal) => {
    expect(parseSettings({ dailyGoal }).dailyGoal).toBe(dailyGoal);
  });

  it.each([[2], ['3'], [-1], [10]])('rejects dailyGoal %j', (dailyGoal) => {
    expect(parseSettings({ dailyGoal }).dailyGoal).toBe(0);
  });

  it('does not mutate the input or share the defaults object', () => {
    const input = { theme: 'dark' };
    const parsed = parseSettings(input);
    expect(input).toEqual({ theme: 'dark' });
    expect(parsed).not.toBe(DEFAULT_SETTINGS);
  });
});

describe('contentLang', () => {
  it.each([['id'], ['en'], ['pt-br']])('accepts the language code %j', (contentLang) => {
    expect(parseSettings({ contentLang }).contentLang).toBe(contentLang);
  });

  it.each([['EN'], ['english'], [''], [5], [undefined], [{}]])(
    'rejects %j and falls back to "follow the interface language" (null)',
    (contentLang) => {
      expect(parseSettings({ contentLang }).contentLang).toBeNull();
    },
  );
});

describe('loadSettings / saveSettings', () => {
  it('returns the defaults when nothing is stored', async () => {
    expect(await loadSettings(createMemoryStorage())).toEqual(DEFAULT_SETTINGS);
  });

  it('round-trips through the storage under settings:v1', async () => {
    const storage = createMemoryStorage();
    await saveSettings(storage, custom);
    expect(storage.data.has('settings:v1')).toBe(true);
    expect(SETTINGS_KEY).toBe('settings:v1');
    expect(await loadSettings(storage)).toEqual(custom);
  });

  it('falls back to the defaults for corrupt stored text', async () => {
    const storage = createMemoryStorage(new Map([[SETTINGS_KEY, '{not json']]));
    expect(await loadSettings(storage)).toEqual(DEFAULT_SETTINGS);
  });

  it('ignores unknown keys and invalid values already in storage', async () => {
    const storage = createMemoryStorage(
      new Map([[SETTINGS_KEY, JSON.stringify({ theme: 'dark', volume: 9, extra: true })]]),
    );
    expect(await loadSettings(storage)).toEqual({ ...DEFAULT_SETTINGS, theme: 'dark' });
  });

  it('never writes invalid values or unknown keys', async () => {
    const storage = createMemoryStorage();
    await saveSettings(storage, { ...custom, theme: 'sepia', extra: 1 } as unknown as Settings);
    expect(JSON.parse(storage.data.get(SETTINGS_KEY) as string)).toEqual({ ...custom, theme: 'system' });
  });
});
