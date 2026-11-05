import { describe, expect, it } from 'vitest';
import { en } from '@/i18n/ui/en';
import { id } from '@/i18n/ui/id';
import { getModeLabel } from './label';

describe('getModeLabel', () => {
  it('names the mode with its option', () => {
    expect(getModeLabel(en, { mode: 'time', durationSec: 30 })).toBe(`${en.test.modes.time} 30${en.test.secondsSuffix}`);
    expect(getModeLabel(en, { mode: 'count', durationSec: null, sentenceCount: 5 })).toBe(`${en.test.modes.count} 5`);
    expect(getModeLabel(en, { mode: 'quote', durationSec: null })).toBe(en.test.modes.quote);
  });

  it('adds a tag for a stop-on-error test, in both languages', () => {
    expect(getModeLabel(en, { mode: 'time', durationSec: 30, stopOnError: true })).toBe(
      `${en.test.modes.time} 30${en.test.secondsSuffix} · ${en.test.stopOnErrorTag}`,
    );
    expect(getModeLabel(id, { mode: 'quote', durationSec: null, stopOnError: true })).toBe(
      `${id.test.modes.quote} · ${id.test.stopOnErrorTag}`,
    );
  });

  it('adds nothing when stop-on-error is off', () => {
    expect(getModeLabel(en, { mode: 'quote', durationSec: null, stopOnError: false })).toBe(en.test.modes.quote);
  });

  it('names custom text without an option, in both languages', () => {
    expect(getModeLabel(en, { mode: 'custom', durationSec: null })).toBe(en.test.modes.custom);
    expect(getModeLabel(id, { mode: 'custom', durationSec: null })).toBe(id.test.modes.custom);
  });
});
