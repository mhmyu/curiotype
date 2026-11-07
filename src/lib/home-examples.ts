import type { Sentence } from './types';

/** How many example sentences the home page shows. */
export const HOME_EXAMPLE_COUNT = 3;

/**
 * Picks the example sentences of the home page: one per category in the given order, then a second
 * round if there are fewer categories than examples. Within a category the sentence with the lowest
 * id comes first, so the choice is fixed (it only depends on the corpus, never on the day or on
 * chance) and the static page does not change between two builds of the same content.
 */
export function pickHomeExamples(
  sentences: readonly Sentence[],
  categoryOrder: readonly string[],
  count: number = HOME_EXAMPLE_COUNT,
): Sentence[] {
  const queues = categoryOrder
    .map((category) =>
      sentences
        .filter((sentence) => sentence.category === category)
        .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
    )
    .filter((queue) => queue.length > 0);

  const picked: Sentence[] = [];
  for (let round = 0; picked.length < count; round++) {
    let added = false;
    for (const queue of queues) {
      if (picked.length >= count) break;
      const sentence = queue[round];
      if (sentence) {
        picked.push(sentence);
        added = true;
      }
    }
    if (!added) break;
  }
  return picked;
}
