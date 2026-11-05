import type { Sentence } from '@/lib/types';

/**
 * Pure state of one relaxed session: one sentence at a time, a card after each finished sentence,
 * and a summary when the session ends. No DOM and no storage; `RelaxedSession.svelte` drives it.
 *
 * - `typing`: the user types `current`.
 * - `card`: `current` was finished and its explanation is shown; "Continue" or "Finish" comes next.
 * - `summary`: the session ended.
 */
export type RelaxedPhase = 'typing' | 'card' | 'summary';

export interface RelaxedSession {
  readonly phase: RelaxedPhase;
  /** The sentence being typed, or the one just finished while the card is shown. */
  readonly current: Sentence;
  /** Sentences typed to the last character, in order. The same sentence can appear twice. */
  readonly completed: readonly Sentence[];
}

export function startSession(first: Sentence): RelaxedSession {
  return { phase: 'typing', current: first, completed: [] };
}

/** The current sentence was typed to its last character. Only valid while typing. */
export function completeSentence(session: RelaxedSession): RelaxedSession {
  if (session.phase !== 'typing') return session;
  return { ...session, phase: 'card', completed: [...session.completed, session.current] };
}

/** "Continue": shows `next` for typing. Only valid while the card is shown. */
export function advance(session: RelaxedSession, next: Sentence): RelaxedSession {
  if (session.phase !== 'card') return session;
  return { ...session, phase: 'typing', current: next };
}

/**
 * "Finish": ends the session. A sentence that was only started is not counted (it is not in
 * `completed`), so finishing in the middle of a sentence loses nothing that was already learned.
 */
export function finishSession(session: RelaxedSession): RelaxedSession {
  if (session.phase === 'summary') return session;
  return { ...session, phase: 'summary' };
}

/** Number of sentences finished in the session (repeats count: each one was typed). */
export function countCompleted(session: RelaxedSession): number {
  return session.completed.length;
}

/** The finished sentences for the summary list: each sentence once, in the order first finished. */
export function getLearnedSentences(session: RelaxedSession): Sentence[] {
  const seen = new Set<string>();
  const learned: Sentence[] = [];
  for (const sentence of session.completed) {
    if (seen.has(sentence.id)) continue;
    seen.add(sentence.id);
    learned.push(sentence);
  }
  return learned;
}
