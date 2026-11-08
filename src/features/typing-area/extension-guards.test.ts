import { describe, expect, it } from 'vitest';
import { BROWSER_GUARD_ATTRIBUTES, EXTENSION_GUARD_ATTRIBUTES } from './extension-guards';

describe('extension guard attributes', () => {
  it('asks Grammarly, LastPass, 1Password and form fillers to leave the field alone', () => {
    expect(EXTENSION_GUARD_ATTRIBUTES).toEqual({
      'data-gramm': 'false',
      'data-gramm_editor': 'false',
      'data-enable-grammarly': 'false',
      'data-lpignore': 'true',
      'data-1p-ignore': 'true',
      'data-form-type': 'other',
    });
  });

  it('keeps the browser helpers switched off', () => {
    expect(BROWSER_GUARD_ATTRIBUTES).toEqual({
      autocomplete: 'off',
      autocapitalize: 'off',
      autocorrect: 'off',
      spellcheck: 'false',
    });
  });

  it('uses valid attribute names (letters, digits, dash, underscore) and string values', () => {
    for (const [name, value] of Object.entries({ ...EXTENSION_GUARD_ATTRIBUTES, ...BROWSER_GUARD_ATTRIBUTES })) {
      expect(name).toMatch(/^[a-z][a-z0-9_-]*$/);
      expect(typeof value).toBe('string');
    }
  });
});
