# Contributing

Thank you for helping people learn while they practise typing. The most valuable contribution is **new, accurate sentences**, and you do not need to write code to add them.

Issues and pull requests can be written in **English or Indonesian**.

## Ways to contribute

| I want to...                         | Do this                                                                 |
| ------------------------------------ | ----------------------------------------------------------------------- |
| Suggest a sentence, no Git needed    | Open an issue with the **Sentence suggestion** form                     |
| Add sentences myself                 | Follow "Add sentences" below and open a pull request                    |
| Fix a wrong fact or a broken source  | Use **Report a wrong fact** under a sentence on the site (or the **Wrong fact report** form), or fix it directly in a pull request |
| Add a language or a category         | Open an issue first, since it touches UI strings and code (see `ARCHITECTURE.md`, "Extending") |
| Report a bug or fix code             | See "Code changes" below                                                |

## Add sentences

Read [`CONTENT_GUIDE.md`](CONTENT_GUIDE.md) first. It explains how the difficulty is measured, the source rules and the review checklist. Pull requests that ignore it will be sent back.

### Option A: in the browser (easiest)

1. Open the file you want to extend on GitHub, for example `src/content/sentences/id/science.json`.
2. Click the pencil icon (GitHub forks the repository for you if needed).
3. Add your items at the end of the `items` list. Mind the commas: every item except the last ends with `,`.
4. Click **Propose changes**, then **Create pull request** and fill in the checklist.

### Option B: on your computer

Requirements: Node.js >= 22.23.4 and pnpm.

```bash
git clone <your fork URL>
cd typing
git checkout -b content/id-science-astronomy
pnpm install
# edit src/content/sentences/<lang>/<category>.json
pnpm build        # fails with a clear message if something is invalid
git commit -am "Add 5 astronomy sentences (id/science)"
git push -u origin content/id-science-astronomy
```

Then open a pull request from your branch.

### Rules for a pull request

- **One language and one category per pull request**, at most **20 sentences**. Small pull requests are reviewed faster.
- Every sentence needs `id`, `difficulty`, `text`, `explanation` and a `source` with a working URL.
- Ids look like `id-science-006`: continue from the highest number in the file. If two pull requests pick the same number, the second one will show a conflict or a build error ("Duplicate sentence id"). Pull the latest `main`, renumber your items, and push again.
- Do not edit or renumber other people's sentences in a content pull request, unless you are fixing a fact (say so in the description).
- `pnpm build` must pass. The build rejects duplicate ids or texts, a `lang`/`category` that does not match the file path, text that is too short or too long, a `difficulty` that differs from the level the text's score gives (`pnpm content:stats --scores` shows it), non-keyboard characters, and a missing or non-https source URL. Error messages name the sentence and the rule.

### What will be rejected

- Wording copied from books, articles or websites. Write facts in your own words.
- Facts you cannot support with a public source, or sources that do not state the fact.
- Anything outdated, disputed or politically or religiously charged, or promotional and offensive content.
- Medical, legal or financial advice. Health sentences state general facts only, no doses or treatments.
- Text produced by an AI tool that you did not verify. If you used one to draft, check every fact against the source yourself, and say so in the pull request.

### Your contribution and its license

By submitting a sentence you confirm that the wording is your own (or that you have the right to share it) and that it is published under [CC BY-SA 4.0](LICENSE-CONTENT), the license of the sentence corpus. Code and documentation contributions are published under the [MIT License](LICENSE). Keep the facts accurate and the source honest: the source link is how readers check your work.

## Code changes

1. For anything beyond a small fix, open an issue first so the approach can be agreed.
2. Read `README.md` and `ARCHITECTURE.md`: they explain the structure, the data flow and how to extend categories, languages and modes.
3. Conventions: code, comments and documentation in English; mobile-first layout; Tailwind CSS for styling; no new dependencies without a reason in the pull request.
4. Before opening the pull request run `pnpm check`, `pnpm test:run` and `pnpm build`, and try the change in the browser at phone width.

## Review process

Every pull request runs automatic checks: the type check, the unit tests and the build (which includes the sentence rules) in one job, and the browser tests in another. A red check means something needs fixing: open the failed run and read the message, it names the sentence and the rule. Maintainers then check, in this order: the build passes, the fact is true, the source supports it, the rules in `CONTENT_GUIDE.md` are met, then tone and variety. You may be asked for changes; this is normal. Small fixes (spacing, id numbering) may be made by a maintainer when merging.

## Be kind

Be respectful in issues and reviews. Feedback is about the sentence, never the person.
