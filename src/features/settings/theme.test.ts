import { describe, expect, it } from 'vitest';
import { applyTheme, THEME_INIT_SCRIPT } from './theme';
import type { ThemeRoot } from './theme';

function createRoot(initial?: string): ThemeRoot & { theme: string | undefined } {
  const root = {
    theme: initial,
    setAttribute(name: string, value: string) {
      if (name === 'data-theme') root.theme = value;
    },
    removeAttribute(name: string) {
      if (name === 'data-theme') root.theme = undefined;
    },
  };
  return root;
}

/** Runs the inline script against a fake localStorage and document. */
function runInitScript(stored: string | null | 'throws'): string | undefined {
  const root = createRoot();
  const localStorage = {
    getItem(key: string) {
      if (stored === 'throws') throw new Error('storage blocked');
      return key === 'typing:settings:v1' ? stored : null;
    },
  };
  new Function('localStorage', 'document', THEME_INIT_SCRIPT)(localStorage, { documentElement: root });
  return root.theme;
}

describe('applyTheme', () => {
  it('forces light and dark', () => {
    const root = createRoot();
    applyTheme('dark', root);
    expect(root.theme).toBe('dark');
    applyTheme('light', root);
    expect(root.theme).toBe('light');
  });

  it('removes the override for system', () => {
    const root = createRoot('dark');
    applyTheme('system', root);
    expect(root.theme).toBeUndefined();
  });
});

describe('THEME_INIT_SCRIPT', () => {
  it('applies a saved explicit theme', () => {
    expect(runInitScript(JSON.stringify({ theme: 'dark' }))).toBe('dark');
    expect(runInitScript(JSON.stringify({ theme: 'light', fontSize: 'lg' }))).toBe('light');
  });

  it('leaves the page alone for system, unknown values and missing data', () => {
    expect(runInitScript(JSON.stringify({ theme: 'system' }))).toBeUndefined();
    expect(runInitScript(JSON.stringify({ theme: 'purple' }))).toBeUndefined();
    expect(runInitScript(JSON.stringify({}))).toBeUndefined();
    expect(runInitScript(null)).toBeUndefined();
  });

  it('never throws on bad JSON, a non-object value or blocked storage', () => {
    expect(runInitScript('{not json')).toBeUndefined();
    expect(runInitScript('42')).toBeUndefined();
    expect(runInitScript('throws')).toBeUndefined();
  });

  it('reads the same key the settings store writes', () => {
    expect(THEME_INIT_SCRIPT).toContain('typing:settings:v1');
  });
});
