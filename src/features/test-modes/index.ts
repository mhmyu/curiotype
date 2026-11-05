import type { ModeId, RecordModeId, ScoredModeId } from '@/lib/types';
import { COUNT_OPTIONS, countMode } from './count-mode';
import { customMode } from './custom-mode';
import { quoteMode } from './quote-mode';
import { relaxedMode } from './relaxed-mode';
import { TIME_DURATIONS, timeMode } from './time-mode';
import type { TestMode } from './types';

export type { ProgressSnapshot, TestMode } from './types';
export { COUNT_OPTIONS, TIME_DURATIONS };

/**
 * Mode registry. To add a mode: create <name>-mode.ts, add its id to ModeId
 * (src/lib/types.ts), register it here, and add its label to both dictionaries.
 */
export const MODES: Record<ModeId, TestMode> = {
  time: timeMode,
  quote: quoteMode,
  count: countMode,
  relaxed: relaxedMode,
  custom: customMode,
};

export const MODE_IDS = Object.keys(MODES) as ModeId[];

/**
 * Modes that produce a score (all except those with `scored: false`). The history, the personal
 * bests and the statistics only know these, so a relaxed session can never end up there.
 */
export const SCORED_MODE_IDS = MODE_IDS.filter((id) => MODES[id].scored !== false) as ScoredModeId[];

/**
 * Scored modes that keep personal bests (all except those with `hasRecords: false`). The record
 * keys and the bucket types only know these.
 */
export const RECORD_MODE_IDS = SCORED_MODE_IDS.filter(
  (id) => MODES[id].hasRecords !== false,
) as RecordModeId[];
