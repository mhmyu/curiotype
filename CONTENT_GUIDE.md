# Sentence writing guide

How to write the sentences in `src/content/sentences/`. The goal: every sentence is a **true, useful fact** that is **pleasant to type**, so people learn while they practise.

File format and build-time checks are described in `README.md` ("Content format"). This guide covers what goes inside the fields.

## 1. Template

One file per language and category: `src/content/sentences/<lang>/<category>.json`.

```json
{
  "lang": "id",
  "category": "science",
  "items": [
    {
      "id": "id-science-006",
      "difficulty": "easy",
      "text": "One complete sentence the user will type.",
      "explanation": "One or two sentences of extra context shown after the test.",
      "source": { "title": "Publisher: Page title", "url": "https://example.org/page" }
    }
  ]
}
```

- `id`: `<lang>-<category>-<number>`, three digits, unique across all files. Continue from the highest number in the file and never reuse an id after deleting a sentence.
- `source.url` is required and must be an `https://` link (see section 4).

## 2. The sentence (`text`)

**Content**
- One sentence, one fact. No lists, no two-part claims where one half could be wrong.
- Self-contained: understandable without the title, an image or the previous sentence (sentences are shuffled and joined in time mode).
- Timeless. Avoid "currently", "the latest", "this year", records that change, prices, rankings and populations. If a number is unavoidable, use a well-established one with "about" or "around".
- Neutral and uncontested. Skip politics, religion, and disputed history or science. Health sentences state general facts only: no advice, doses, treatments or diagnoses.
- Write it in your own words. Facts are free to use; copied wording is not.

**Typing comfort**
- Only characters on a standard keyboard of the sentence language. For `id` and `en` that means printable ASCII (Indonesian and US layouts). A language with its own character rule (see "Adding a sentence language" in `README.md`) may also use its own letters, for example accented ones; write them as single precomposed characters (Unicode NFC), never as a letter plus a combining mark. The list of allowed characters per language is `LANGUAGE_RULES` in `src/lib/content-rules.ts`. Use straight quotes `"` `'`, a plain hyphen `-`, and three dots as `...` if ever needed.
- Avoid curly quotes, long dashes, emoji, superscripts and symbols such as `°`, `²`, `×`, `≈`, and accented letters in `id` and `en`. Write them as words: "derajat", "kuadrat", "kali", "sekitar". Foreign names with accents are fine only if you also accept typing them: prefer the common unaccented spelling.
- Exactly one space between words, no leading or trailing spaces, end with `.` (no `!` or `?`).
- Number format follows the language: `300.000` in Indonesian, Spanish, Portuguese, French and German (a dot, never a space, so no non-breaking space is needed), `300,000` in English. Prefer words for small numbers ("two", "dua") and digits for years and large values.
- Use `@`, `&`, `%` and parentheses sparingly, at most one per sentence. Each symbol adds to the difficulty score (section 3), so they push a sentence towards `hard`.

**Quality bar**: read it aloud. If it needs a second read to parse, shorten it.

### Languages with accents (`es`, `pt-br`, `fr`, `de`)

These four languages are still **drafts** (`DRAFT_LANGUAGES` in `src/config/languages.ts`): the build checks them, but visitors do not see them until the language is launched. Their accented letters are **required**: write `águila`, never `aguila`. A character that is hard to type on the normal keyboard of the language is **forbidden**: choose another word.

| Language | Letters allowed besides ASCII | Not allowed (why) |
| -------- | ----------------------------- | ----------------- |
| `es` | á é í ó ú ü ñ | `¿` `¡` (a statement ends with a full stop and needs neither) |
| `pt-br` | á à â ã ç é ê í ó ô õ ú | `ü` (no longer used in Brazilian Portuguese) |
| `fr` | à â ç é è ê ë î ï ô ù û ü | `œ` `æ` `ÿ` `«` `»` (not on the standard keyboard); a space before `:` `;` `!` `?` |
| `de` | ä ö ü ß | `ẞ` (capital sharp s; write `SS` in capitals) |

The same rules apply to all four: one apostrophe, the straight `'`; no curly quotes, long dashes or emoji; one space between words; end with a full stop. The exact lists are `LANGUAGE_RULES` in `src/lib/content-rules.ts`; if this table and the code ever differ, the code wins and this guide must be fixed.

**Unicode form.** Every accented letter must be **one character** (NFC), not a letter plus a combining mark. Typing on a keyboard gives NFC; text copied from a PDF, a web page or a macOS file name sometimes does not. The build rejects it and names the sentence. Retype the letter, or paste the text through a plain-text editor that normalises it.

**How to type the letters** (if your layout has no key for a letter, a *dead key* makes it: press the accent key, release, then the letter):

- **Spanish** (Spain or Latin America layout): `ñ` has its own key; an acute accent is the dead key `´` then the vowel; `ü` is Shift + the `¨` dead key then `u`. On the US-International layout: `'` then the vowel, `"` then `u`, and AltGr + `n` for `ñ`. On a Mac: Option + `e` then the vowel (acute), Option + `u` then `u` (`ü`), Option + `n` then `n` (`ñ`).
- **Portuguese (Brazil, ABNT2)**: `ç` has its own key; the acute, grave, tilde and circumflex are dead keys, pressed before the vowel (`~` then `a` gives `ã`).
- **French (AZERTY)**: `é` `è` `à` `ç` `ù` have their own keys; `â` `ê` `î` `ô` `û` come from the circumflex dead key and `ë` `ï` `ü` from the diaeresis dead key, both before the letter.
- **German (QWERTZ)**: `ä` `ö` `ü` `ß` have their own keys.

You do not need the keyboard of the language to write sentences (the US-International layout or the character map of your system is enough), but **before a language is launched, someone must type its sentences with the real layout** on a computer and on a phone (see `MAINTAINING.md`, section 10). The heat map on the statistics page draws the layout of the language: AZERTY for `fr`, QWERTZ for `de`, QWERTY for the others; accented letters have no cell there, but they are counted and listed as weak keys like any other letter.

## 3. Difficulty

There are two levels, **`easy`** and **`hard`**, and the level is **measured from the text, not chosen**. Every sentence gets a score; the build compares it with the threshold of the sentence's language and rejects a `difficulty` label that does not match.

**The score** is the length of the text in characters plus:

| Factor                                                         | Points |
| -------------------------------------------------------------- | ------ |
| each digit                                                     | +3     |
| each capital letter that is not the first character            | +2     |
| each character that is not a letter, digit or space (`,` `-` `(` `%` ...), except the final full stop | +2 |
| each word of 10 letters or more                                | +5     |

**The threshold** decides the level: `easy` below it, `hard` at or above it.

| Language | Threshold | Length range (characters) |
| -------- | --------- | ------------------------- |
| `en`     | 100       | 50-170                    |
| `id`     | 120       | 55-190                    |

Indonesian runs about 15-20% longer for the same fact, so its threshold is higher. A language without its own entry uses the `en` values. The numbers are in `src/lib/difficulty.ts` (score, thresholds) and `src/lib/content-rules.ts` (length range).

**Worked example** (illustration only: verify any fact before you use it):

- `Water boils at 100 degrees Celsius at sea level.` is 48 characters, plus 3 digits (9) and one inner capital (2): score **59**, so `easy`.
- `The Great Barrier Reef, off Queensland, is about 2,300 km long and holds 400 types of coral.` is 92 characters, plus 7 digits (21), 4 inner capitals (8), 3 commas (6) and one word of 10 letters, `Queensland` (5): score **132**, so `hard` in both languages.

**Check a label before you open a pull request:** `pnpm content:stats --scores` lists the score and the level of every sentence (lowest score first) and marks a wrong label. If you get it wrong, `pnpm build` says so:

```
"id-science-007": score 132 is hard (threshold for "id" is 120), but difficulty is "easy".
Set difficulty to "hard" or change the sentence; "pnpm content:stats --scores" lists the score of every sentence.
```

Fix it by changing `difficulty` to the level the message names, or by rewriting the sentence (shorter, fewer numbers and names) if you wanted the other level.

Rules of thumb:
- Never exceed 190 characters: it wraps to five or more lines on a phone. The build enforces the length range of the language.
- Keep both levels populated in every category, roughly 50% easy and 50% hard.
- A short sentence full of numbers and names can be `hard`; a long sentence of plain words can still be `easy` when it stays below the threshold.
- The weights and thresholds are a starting point, set from the 40 sample sentences. The owner recalibrates them when the corpus nears 100 sentences per category (`pnpm content:stats` shows the median score of each language next to its threshold); if a threshold moves, labels are updated with `--scores`.

## 4. Sources (`source`)

- **Required**: every sentence has a `title` and a working `url`.
- **Title format**: `Publisher: Page title`, for example `NASA: Venus facts`.
- **Prefer**, in this order: standards bodies and institutions (WHO, NASA, BMKG, national archives, museums, universities), peer-reviewed or textbook references, reputable encyclopedias, quality news for events.
- **Wikipedia** is fine to start from, but confirm the fact against a second source and cite the stronger one when possible.
- **Language**: for `id` sentences, prefer an Indonesian-language source (Kemdikbud, Kemenkes, BRIN, Britannica translation, id.wikipedia.org). English sources are acceptable when no Indonesian equivalent exists.
- **Numbers and dates**: confirm with at least two independent sources, and use the more cautious value or "about".
- The URL must be stable and public: no paywalls, no search-result links, no shortened links. Check that it opens before committing.
- The source must actually state the fact in the sentence. If it only states a related fact, find a better source.

## 5. The explanation (`explanation`)

Shown after the test, so it is where the learning happens.

- One or two sentences, 40-220 characters.
- Add something the sentence did not say: the reason, a number, or an example. Never repeat the sentence.
- Same language as the sentence, plain words, no marketing tone.
- It is not typed, so it can use normal punctuation, but keep the same factual standard as `text`.

## 6. Categories

Current categories: `science`, `history`, `technology`, `health` (see `src/lib/taxonomy.ts`).

- Pick the single best fit. If a sentence could be two categories, choose the one a reader would expect.
- Spread topics inside a category: for science, mix astronomy, biology, physics, chemistry and earth science rather than five space facts.
- Indonesian and English files are **independent**. A sentence does not need a translation in the other language, and local topics (Indonesian history, geography, culture) are welcome in either.

## 7. Review checklist

Before committing a sentence, confirm all of these:

1. The fact is true and stated precisely, with no "always" or "never" unless that is literally correct.
2. A source supports exactly this fact, and the URL opens.
3. It is one sentence, within the length range of its language, and its `difficulty` is the level its score gives (`pnpm content:stats --scores`).
4. It uses only keyboard characters and single spaces.
5. It stays true next year.
6. The explanation adds new information.
7. `id` is unique and `lang`/`category` match the file path.
8. `pnpm build` passes (see "Automatic checks" below).

## 8. Common mistakes

| Avoid | Why | Better |
| ----- | --- | ------ |
| "Bitcoin is currently worth about $60,000." | Changes constantly | A durable fact about how it works |
| "Water boils at 100 °C." | `°` is hard to type | "Water boils at 100 degrees Celsius at sea level." |
| "Dinosaurs went extinct because of an asteroid." | Presented as the only cause | "An asteroid impact about 66 million years ago is widely linked to the extinction of the non-bird dinosaurs." |
| Two facts joined by "and" | One can be wrong or outdated | Split into two sentences |
| Copying a sentence from Wikipedia | Copyright and originality | Rewrite in your own words |
| Source = a search result or a homepage | Cannot be verified | Link the exact page |

## 9. Automatic checks

Two more tools help the owner, outside the build: `pnpm content:stats` shows how many sentences each language and category has and the spread of the difficulty scores and where the easy/hard mix drifts from 50/50, and `pnpm content:check-sources` (also run weekly on GitHub) tells which source links no longer open. Neither blocks a pull request.

`pnpm build` enforces the mechanical rules above and prints the sentence id with the rule it broke. The numbers are defined in `src/lib/content-rules.ts`; keep this guide in sync when you change them.

| Checked by the build                                              | Left to reviewers                          |
| ----------------------------------------------------------------- | ------------------------------------------ |
| Text length for its language; `difficulty` equals the level of the score | The fact is true and timeless       |
| Allowed characters of the language (ASCII unless it has a rule), Unicode NFC, single spaces, ends with a full stop | The source really states the fact          |
| Explanation length (40-220)                                       | The explanation adds new information       |
| Id format and uniqueness, `lang`/`category` match the file path   | Topic variety, tone, wording               |
| No duplicate text (case-insensitive)                              | Originality of the wording                 |
| Source title format and `https://` URL (not that the link opens)  | Neutrality, no advice or sensitive topics  |
