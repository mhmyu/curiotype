import { describe, expect, it } from 'vitest';
import type { Sentence } from '@/lib/types';
import {
  advance,
  completeSentence,
  countCompleted,
  finishSession,
  getLearnedSentences,
  startSession,
} from './relaxed-session';

function sentence(n: number): Sentence {
  const id = `en-science-${String(n).padStart(3, '0')}`;
  return {
    id,
    lang: 'en',
    category: 'science',
    difficulty: 'easy',
    text: `Sentence ${n}.`,
    explanation: 'Explanation.',
    source: { title: 'Publisher: Title', url: 'https://example.org' },
  };
}

describe('relaxed session', () => {
  it('starts in the typing phase with nothing completed', () => {
    const session = startSession(sentence(1));
    expect(session.phase).toBe('typing');
    expect(session.current).toEqual(sentence(1));
    expect(countCompleted(session)).toBe(0);
  });

  it('shows the card after a sentence and counts it', () => {
    const session = completeSentence(startSession(sentence(1)));
    expect(session.phase).toBe('card');
    expect(session.current).toEqual(sentence(1));
    expect(session.completed).toEqual([sentence(1)]);
  });

  it('moves to the next sentence on continue', () => {
    const session = advance(completeSentence(startSession(sentence(1))), sentence(2));
    expect(session.phase).toBe('typing');
    expect(session.current).toEqual(sentence(2));
    expect(session.completed).toEqual([sentence(1)]);
  });

  it('ignores actions in the wrong phase', () => {
    const typing = startSession(sentence(1));
    expect(advance(typing, sentence(2))).toBe(typing);
    const card = completeSentence(typing);
    expect(completeSentence(card)).toBe(card);
    const summary = finishSession(card);
    expect(completeSentence(summary)).toBe(summary);
    expect(advance(summary, sentence(2))).toBe(summary);
    expect(finishSession(summary)).toBe(summary);
  });

  it('keeps finished sentences when finishing from the card', () => {
    let session = startSession(sentence(1));
    session = completeSentence(session);
    session = advance(session, sentence(2));
    session = completeSentence(session);
    session = finishSession(session);
    expect(session.phase).toBe('summary');
    expect(countCompleted(session)).toBe(2);
    expect(getLearnedSentences(session)).toEqual([sentence(1), sentence(2)]);
  });

  it('does not count a sentence that was only started', () => {
    let session = completeSentence(startSession(sentence(1)));
    session = advance(session, sentence(2));
    session = finishSession(session);
    expect(countCompleted(session)).toBe(1);
    expect(getLearnedSentences(session)).toEqual([sentence(1)]);
  });

  it('counts a repeated sentence twice but lists it once', () => {
    let session = completeSentence(startSession(sentence(1)));
    session = completeSentence(advance(session, sentence(2)));
    session = completeSentence(advance(session, sentence(1)));
    expect(countCompleted(session)).toBe(3);
    expect(getLearnedSentences(session).map((s) => s.id)).toEqual([
      'en-science-001',
      'en-science-002',
    ]);
  });

  it('ends an empty session with zero sentences', () => {
    const session = finishSession(startSession(sentence(1)));
    expect(countCompleted(session)).toBe(0);
    expect(getLearnedSentences(session)).toEqual([]);
  });
});
