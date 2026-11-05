import { getStorage } from '@/lib/storage';
import type { StorageAdapter } from '@/lib/storage/types';
import { DEFAULT_SETTINGS, loadSettings, parseSettings, saveSettings, type Settings } from './settings';

/**
 * Reactive settings shared by every island on the page (Svelte 5 runes).
 *
 * Nothing touches storage at import time, so the module is safe during server
 * rendering. Defaults are used until `init()` has loaded the saved values;
 * islands call it once after mount.
 */
export interface SettingsStore {
  /** Current values. Read it inside `$derived` or `$effect` to react to changes. */
  readonly current: Settings;
  /** True once the saved values have been loaded (or loading failed and defaults stay). */
  readonly ready: boolean;
  /** Loads the saved values. Safe to call from several islands: it only loads once. */
  init(): Promise<void>;
  /** Applies a partial change (an invalid value falls back to its default) and saves it. */
  update(patch: Partial<Settings>): Promise<void>;
  /**
   * Reads the saved values again and replaces the current ones. Used after the stored data
   * was replaced from outside the store (data import, "delete all data"). Never saves.
   */
  reload(): Promise<void>;
}

export function createSettingsStore(getAdapter: () => StorageAdapter): SettingsStore {
  let current = $state<Settings>({ ...DEFAULT_SETTINGS });
  let ready = $state(false);
  let loading: Promise<void> | null = null;
  // Changes made before the saved values arrived; they are applied on top of them.
  let pending: Partial<Settings> = {};
  // Saves run one after another so the last update always ends up in storage.
  let saving: Promise<void> = Promise.resolve();

  function persist(): Promise<void> {
    const snapshot = $state.snapshot(current) as Settings;
    saving = saving
      .then(() => saveSettings(getAdapter(), snapshot))
      .catch(() => {
        // Saving is best-effort; the in-memory value stays in effect for this session.
      });
    return saving;
  }

  function init(): Promise<void> {
    loading ??= (async () => {
      try {
        const saved = await loadSettings(getAdapter());
        current = parseSettings({ ...saved, ...pending });
      } catch {
        // Keep what we have (defaults plus pending changes): settings must never block the app.
        current = parseSettings({ ...current, ...pending });
      } finally {
        const hadPending = Object.keys(pending).length > 0;
        pending = {};
        ready = true;
        if (hadPending) void persist();
      }
    })();
    return loading;
  }

  function update(patch: Partial<Settings>): Promise<void> {
    // Merge, then normalize: an invalid field falls back to its default.
    current = parseSettings({ ...current, ...patch });
    if (!ready) {
      pending = { ...pending, ...patch };
      return init();
    }
    return persist();
  }

  async function reload(): Promise<void> {
    // Let queued saves finish first, so a late save cannot overwrite what was just stored.
    await saving;
    try {
      current = await loadSettings(getAdapter());
    } catch {
      current = { ...DEFAULT_SETTINGS };
    }
    pending = {};
    ready = true;
  }

  return {
    get current() {
      return current;
    },
    get ready() {
      return ready;
    },
    init,
    update,
    reload,
  };
}

/** The store every island uses. Tests create their own with `createSettingsStore`. */
export const settingsStore: SettingsStore = createSettingsStore(getStorage);
