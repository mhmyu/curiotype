import type { ModeId, Sentence, TestSettings } from '@/lib/types';

export interface ProgressSnapshot {
  typedLength: number;
  targetLength: number;
  elapsedMs: number;
}

/**
 * Contract every test mode implements. The typing component only talks to this
 * interface, so a new mode never requires changes to the engine or the UI flow.
 */
export interface TestMode {
  readonly id: ModeId;
  /**
   * Sentences shown when a test starts. `next` returns the next sentence from the picker;
   * `settings` lets a mode read its own option (e.g. the sentence count).
   */
  initialSentences(next: () => Sentence, settings: TestSettings): Sentence[];
  /** True when more text must be appended to the target (continuous modes). */
  shouldAppend(snapshot: ProgressSnapshot): boolean;
  isFinished(snapshot: ProgressSnapshot, settings: TestSettings): boolean;
  /** Elapsed time used for scoring (e.g. time mode caps it at the duration). */
  effectiveElapsedMs(elapsedMs: number, settings: TestSettings): number;
  /**
   * False = the mode produces no WPM, accuracy, history entry or personal best (relaxed mode).
   * Optional; absent means true.
   */
  readonly scored?: boolean;
  /** False = the mode shows no timer or elapsed time. Optional; absent means true. */
  readonly showsClock?: boolean;
  /**
   * False = a scored mode whose results enter the history but never the personal bests (custom
   * text: every text is different, so its WPM is not comparable). Optional; absent means true.
   */
  readonly hasRecords?: boolean;
}
