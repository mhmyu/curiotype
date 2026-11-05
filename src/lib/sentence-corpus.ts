import type { ContentLang } from '@/i18n/config';
import type { Category } from './taxonomy';
import type { ItemToCheck } from './content-rules';
import type { Sentence } from './types';

/** One sentence file as the content collection returns it (`id` = "<lang>/<category>"). */
export interface SentenceFile {
  id: string;
  data: { lang: ContentLang; category: Category; items: readonly ItemToCheck[] };
}

/**
 * Flattens the files of ONE language into a sorted sentence list. Throws on
 * mistakes the content schema cannot see: a file whose `lang` or `category` does
 * not match its path, and duplicate ids or texts (case-insensitive).
 */
export function buildSentences(files: readonly SentenceFile[]): Sentence[] {
  const ids = new Set<string>();
  const texts = new Set<string>();
  const sentences: Sentence[] = [];

  for (const { id: filePath, data } of files) {
    if (filePath !== `${data.lang}/${data.category}`) {
      throw new Error(
        `Sentence file "${filePath}.json" declares lang="${data.lang}" category="${data.category}". ` +
          `It must live at src/content/sentences/${data.lang}/${data.category}.json.`,
      );
    }
    for (const item of data.items) {
      if (ids.has(item.id)) throw new Error(`Duplicate sentence id: ${item.id}`);
      ids.add(item.id);
      const normalizedText = item.text.toLowerCase();
      if (texts.has(normalizedText)) {
        throw new Error(`Duplicate sentence text (${item.id}): ${item.text}`);
      }
      texts.add(normalizedText);
      sentences.push({ ...item, lang: data.lang, category: data.category });
    }
  }

  return sentences.sort((a, b) => a.id.localeCompare(b.id));
}
