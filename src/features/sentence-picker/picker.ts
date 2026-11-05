import type { Sentence, TestSettings } from '@/lib/types';

export type SentenceFilter = Pick<TestSettings, 'category' | 'difficulty'>;

export function filterSentences(all: readonly Sentence[], filter: SentenceFilter): Sentence[] {
  return all.filter(
    (sentence) =>
      (filter.category === 'all' || sentence.category === filter.category) &&
      (filter.difficulty === 'all' || sentence.difficulty === filter.difficulty),
  );
}

/** Fisher-Yates shuffle on a copy. */
function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Returns a function that yields sentences in shuffled order without repeats
 * until the pool is exhausted, then reshuffles (never repeating back-to-back).
 */
export function createSentenceQueue(
  pool: readonly Sentence[],
  random: () => number = Math.random,
): () => Sentence {
  if (pool.length === 0) throw new Error('Sentence pool is empty');

  let order: Sentence[] = [];
  let last: Sentence | null = null;

  return () => {
    if (order.length === 0) {
      order = shuffle(pool, random);
      if (pool.length > 1 && order[0] === last) {
        [order[0], order[1]] = [order[1], order[0]];
      }
    }
    const next = order.shift() as Sentence;
    last = next;
    return next;
  };
}
