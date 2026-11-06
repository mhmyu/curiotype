import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { CATEGORY_PATTERN } from './lib/categories';
import { CONTENT_LANG_PATTERN } from './lib/content-langs';
import { checkSentence } from './lib/content-rules';
import { DIFFICULTIES } from './lib/taxonomy';

const sentenceItem = z.object({
  /** Globally unique across all files, e.g. "en-science-001". */
  id: z.string().min(1),
  difficulty: z.enum(DIFFICULTIES),
  text: z.string().min(10),
  explanation: z.string().min(10),
  source: z.object({
    title: z.string().min(1),
    url: z.url(),
  }),
});

/**
 * Sentence corpus. One file per language and category:
 *   src/content/sentences/<lang>/<category>.json -> { lang, category, items: [...] }
 * The glob loader treats each file as one entry (entry id = "<lang>/<category>"),
 * so items are flattened by src/pages/data/[lang]/sentences.json.ts (lib/sentence-corpus.ts),
 * which also checks id and text uniqueness and that `lang`/`category` match the file path.
 * Languages are discovered from the folder names (lib/content-langs.ts): a new folder is a new language.
 * Per-sentence rules live in src/lib/content-rules.ts.
 */
const sentences = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/sentences' }),
  schema: z.object({
    // Must equal the folder name; the code format is checked here, the match in buildSentences.
    lang: z.string().regex(CONTENT_LANG_PATTERN),
    // Any well-formed name; whether it is listed in src/content/categories.json is checked when
    // the sentences are built (lib/categories.ts), which also catches a typo in the file name.
    category: z.string().regex(CATEGORY_PATTERN),
    items: z.array(sentenceItem).min(1),
  })
  // Mechanical rules from CONTENT_GUIDE.md (lengths, characters, id and source format).
  .superRefine((file, ctx) => {
    file.items.forEach((item, index) => {
      for (const message of checkSentence(file.lang, file.category, item)) {
        ctx.addIssue({ code: 'custom', message, path: ['items', index] });
      }
    });
  }),
});

export const collections = { sentences };
