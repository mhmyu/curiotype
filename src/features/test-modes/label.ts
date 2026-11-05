import type { Dictionary } from '@/i18n/types';
import type { ModeId } from '@/lib/types';

export interface ModeOption {
  mode: ModeId;
  durationSec: number | null;
  sentenceCount?: number | null;
  stopOnError?: boolean;
}

/**
 * Display label of a mode with its option: "Time 30s", "Count 5", or just "Sentence". A
 * stop-on-error test gets a tag, since its records are separate.
 */
export function getModeLabel(
  ui: Dictionary,
  { mode, durationSec, sentenceCount, stopOnError }: ModeOption,
): string {
  const name = ui.test.modes[mode];
  let label = name;
  if (mode === 'time' && durationSec) label = `${name} ${durationSec}${ui.test.secondsSuffix}`;
  else if (mode === 'count' && sentenceCount) label = `${name} ${sentenceCount}`;
  return stopOnError ? `${label} · ${ui.test.stopOnErrorTag}` : label;
}
