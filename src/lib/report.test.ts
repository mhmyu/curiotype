import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  buildFactReportUrl,
  FACT_REPORT_TEMPLATE,
  FACT_REPORT_TITLE_PREFIX,
  SENTENCE_ID_FIELD,
} from './report';

const REPO = 'https://github.com/owner/repo';

describe('buildFactReportUrl', () => {
  it('builds the pre-filled issue form link', () => {
    const url = buildFactReportUrl(REPO, 'id-science-003');
    expect(url).toBeDefined();
    const parsed = new URL(url!);
    expect(parsed.origin + parsed.pathname).toBe(`${REPO}/issues/new`);
    expect(parsed.searchParams.get('template')).toBe('fact-report.yml');
    expect(parsed.searchParams.get('title')).toBe('[Fact] id-science-003');
    expect(parsed.searchParams.get('sentence_id')).toBe('id-science-003');
  });

  it('encodes the title so the space and brackets survive', () => {
    expect(buildFactReportUrl(REPO, 'en-health-010')).toContain('title=%5BFact%5D+en-health-010');
  });

  it('accepts ids of sentence languages with a region code', () => {
    expect(buildFactReportUrl(REPO, 'pt-br-history-001')).toBeDefined();
  });

  it('returns undefined when the repository is not configured', () => {
    expect(buildFactReportUrl(undefined, 'id-science-003')).toBeUndefined();
    expect(buildFactReportUrl('', 'id-science-003')).toBeUndefined();
  });

  it('returns undefined for an empty or unsafe id', () => {
    expect(buildFactReportUrl(REPO, '')).toBeUndefined();
    expect(buildFactReportUrl(REPO, 'id science 003')).toBeUndefined();
    expect(buildFactReportUrl(REPO, 'id-science-003&labels=x')).toBeUndefined();
    expect(buildFactReportUrl(REPO, 'ID-SCIENCE-003')).toBeUndefined();
  });
});

describe('fact-report.yml', () => {
  const template = readFileSync('.github/ISSUE_TEMPLATE/fact-report.yml', 'utf8');

  it('has the file name the link uses', () => {
    expect(FACT_REPORT_TEMPLATE).toBe('fact-report.yml');
  });

  it('declares the field the link pre-fills', () => {
    expect(template).toMatch(new RegExp(`^\\s+id: ${SENTENCE_ID_FIELD}$`, 'm'));
  });

  it('starts the title with the prefix the link uses and applies the fact-report label', () => {
    expect(template).toContain(`title: "${FACT_REPORT_TITLE_PREFIX} "`);
    expect(template).toMatch(/^labels: \["fact-report"\]$/m);
  });
});
