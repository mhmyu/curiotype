import { describe, expect, it } from 'vitest';
import { LANGUAGES } from '../../i18n/config';
import { getDictionary } from '../../i18n';
import type { Dictionary } from '../../i18n/types';

/** Every string of the guide page text, in reading order (headings included). */
function allText(page: Dictionary['guide']['page']): string[] {
  const { title: _title, description: _description, ...rest } = page;
  const out: string[] = [];
  const walk = (value: unknown) => {
    if (typeof value === 'string') out.push(value);
    else if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === 'object') Object.values(value).forEach(walk);
  };
  walk(rest);
  return out;
}

const wordCount = (strings: string[]) => strings.join(' ').split(/\s+/).filter(Boolean).length;

describe.each(LANGUAGES)('guide page text (%s)', (lang) => {
  const ui = getDictionary(lang);
  const page = ui.guide.page;

  it('has a description of 140 to 155 characters', () => {
    expect(page.description.length).toBeGreaterThanOrEqual(140);
    expect(page.description.length).toBeLessThanOrEqual(155);
  });

  it('keeps the full title, with the site name, within 60 characters', () => {
    expect(`${page.title} | ${ui.meta.siteName}`.length).toBeLessThanOrEqual(60);
  });

  it('has a title, description and heading of its own, different from the home page', () => {
    expect(page.title).not.toBe(ui.meta.homeTitle);
    expect(page.description).not.toBe(ui.meta.description);
    expect(page.heading).not.toBe(ui.meta.homeHeading);
  });

  it('is a page of about 800 to 1,200 words (a loose guard against a stub or a keyword wall)', () => {
    const words = wordCount(allText(page));
    expect(words).toBeGreaterThanOrEqual(800);
    expect(words).toBeLessThanOrEqual(1300);
  });

  it('has the parts of the plan: six key groups, four steps, a few tips and questions', () => {
    expect(page.fingerGroups).toHaveLength(6);
    expect(page.plan).toHaveLength(4);
    expect(page.tips.length).toBeGreaterThanOrEqual(4);
    expect(page.faq.length).toBeGreaterThanOrEqual(3);
  });

  it('names the home row keys and the bumps in the home row text', () => {
    const text = page.homeRowBody.join(' ');
    for (const key of ['A', 'S', 'D', 'F', 'J', 'K', 'L']) expect(text).toContain(key);
  });

  it('has no empty string anywhere', () => {
    for (const text of allText(page)) expect(text.trim().length).toBeGreaterThan(0);
  });

  it('has a menu label for the guide', () => {
    expect(ui.nav.guide.length).toBeGreaterThan(0);
  });
});

describe('guide page text across languages', () => {
  it('has the same number of items in every list', () => {
    const [first, ...others] = LANGUAGES.map((lang) => getDictionary(lang).guide.page);
    for (const other of others) {
      expect(other.intro).toHaveLength(first!.intro.length);
      expect(other.whyBody).toHaveLength(first!.whyBody.length);
      expect(other.posture).toHaveLength(first!.posture.length);
      expect(other.homeRowBody).toHaveLength(first!.homeRowBody.length);
      expect(other.fingerGroups).toHaveLength(first!.fingerGroups.length);
      expect(other.plan).toHaveLength(first!.plan.length);
      expect(other.tips).toHaveLength(first!.tips.length);
      expect(other.faq).toHaveLength(first!.faq.length);
    }
  });
});

describe.each(LANGUAGES)('home page links to the guide (%s)', (lang) => {
  const { guideHint, guideCard } = getDictionary(lang).home;

  it('has a hint with exactly one {link} placeholder and a short link text', () => {
    expect(guideHint.text.split('{link}')).toHaveLength(2);
    expect(guideHint.text.replace('{link}', guideHint.link).length).toBeLessThanOrEqual(70);
    expect(guideHint.link.trim()).not.toBe('');
  });

  it('has a card with a title, a body and a link text', () => {
    expect(guideCard.title.trim()).not.toBe('');
    expect(guideCard.body.length).toBeGreaterThan(40);
    expect(guideCard.link.trim()).not.toBe('');
  });
});
