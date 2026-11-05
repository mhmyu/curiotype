import type { StorageAdapter } from '@/lib/storage/types';
import { HISTORY_KEY } from '@/features/history/history';
import { getDataKind, mergeValue, validateValue } from './data-schema';

/** Marker and version of the export file. Bump the version when the file shape changes. */
export const EXPORT_APP = 'typing';
export const EXPORT_VERSION = 1;
/** Largest file the import accepts (1 MB; a full export is a few tens of KB at most). */
export const MAX_IMPORT_BYTES = 1_000_000;

export interface ExportFile {
  app: typeof EXPORT_APP;
  version: typeof EXPORT_VERSION;
  /** ISO 8601 date and time of the export. */
  exportedAt: string;
  /** Storage keys (relative to the adapter, e.g. `history:v1`) mapped to their values. */
  data: Record<string, unknown>;
}

/** `typing-data-YYYY-MM-DD.json`, with the date in the user's local time zone. */
export function exportFileName(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `typing-data-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`;
}

/**
 * Collects everything the app stores. Only values that the import would accept are written,
 * so exporting and importing again always works (a damaged stored value is left out).
 */
export async function buildExport(
  storage: StorageAdapter,
  now: Date = new Date(),
): Promise<ExportFile> {
  const data: Record<string, unknown> = {};
  for (const key of await storage.keys()) {
    const kind = getDataKind(key);
    if (!kind) continue;
    const stored = await storage.get<unknown>(key);
    if (stored === null) continue;
    const checked = validateValue(kind, stored);
    if (checked.valid) data[key] = checked.value;
  }
  return { app: EXPORT_APP, version: EXPORT_VERSION, exportedAt: now.toISOString(), data };
}

export type ImportErrorCode =
  | 'too-large'
  | 'not-json'
  | 'wrong-shape'
  | 'wrong-app'
  | 'unsupported-version'
  | 'empty'
  | 'unknown-key'
  | 'invalid-value';

export type ImportParse =
  | {
      ok: true;
      /** Every value has been checked and normalized; safe to write. */
      data: Record<string, unknown>;
      exportedAt: string | null;
    }
  | {
      ok: false;
      error: ImportErrorCode;
      /** The storage key that caused `unknown-key` or `invalid-value`. */
      key?: string;
    };

/** True when a file of this many bytes may be read at all (check before reading a big file). */
export function isImportSizeAllowed(bytes: number): boolean {
  return bytes <= MAX_IMPORT_BYTES;
}

function fail(error: ImportErrorCode, key?: string): ImportParse {
  return key === undefined ? { ok: false, error } : { ok: false, error, key };
}

/**
 * Checks the text of an import file without touching any storage: size, JSON, shape, `app`,
 * `version`, and every key with its own validator. Any problem rejects the whole file.
 */
export function parseImport(text: string): ImportParse {
  if (!isImportSizeAllowed(new TextEncoder().encode(text).length)) return fail('too-large');

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return fail('not-json');
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return fail('wrong-shape');
  }
  const file = parsed as Record<string, unknown>;
  if (typeof file.data !== 'object' || file.data === null || Array.isArray(file.data)) {
    return fail('wrong-shape');
  }
  if (file.app !== EXPORT_APP) return fail('wrong-app');
  if (file.version !== EXPORT_VERSION) return fail('unsupported-version');

  const entries = Object.entries(file.data);
  if (entries.length === 0) return fail('empty');

  const data: Record<string, unknown> = {};
  for (const [key, raw] of entries) {
    const kind = getDataKind(key);
    if (!kind) return fail('unknown-key', key);
    const checked = validateValue(kind, raw);
    if (!checked.valid) return fail('invalid-value', key);
    data[key] = checked.value;
  }

  return {
    ok: true,
    data,
    exportedAt: typeof file.exportedAt === 'string' ? file.exportedAt : null,
  };
}

/** What a checked import contains, for the "ready to import" message. */
export function summarizeImport(data: Record<string, unknown>): { tests: number } {
  const history = data[HISTORY_KEY];
  return { tests: Array.isArray(history) ? history.length : 0 };
}

async function readEverything(storage: StorageAdapter): Promise<Record<string, unknown>> {
  const snapshot: Record<string, unknown> = {};
  for (const key of await storage.keys()) {
    const value = await storage.get<unknown>(key);
    if (value !== null) snapshot[key] = value;
  }
  return snapshot;
}

export type ImportMode = 'merge' | 'overwrite';

/**
 * Writes checked import data. "overwrite" replaces everything the app stores; "merge" combines
 * each value with the stored one (rules in `mergeValue`). If a write fails halfway, the data
 * that was stored before is put back and the error is thrown, so the result is all or nothing.
 */
export async function applyImport(
  storage: StorageAdapter,
  data: Record<string, unknown>,
  mode: ImportMode,
): Promise<void> {
  const snapshot = await readEverything(storage);
  try {
    if (mode === 'overwrite') await storage.clear();
    for (const [key, value] of Object.entries(data)) {
      const kind = getDataKind(key);
      if (!kind) continue; // parseImport already rejected unknown keys
      if (mode === 'overwrite') {
        await storage.set(key, value);
      } else {
        await storage.set(key, mergeValue(kind, snapshot[key] ?? null, value));
      }
    }
  } catch (error) {
    try {
      await storage.clear();
      for (const [key, value] of Object.entries(snapshot)) await storage.set(key, value);
    } catch {
      // Nothing more can be done; report the original failure.
    }
    throw error;
  }
}

/** Removes everything the app stores in this browser. */
export async function clearAllData(storage: StorageAdapter): Promise<void> {
  await storage.clear();
}
