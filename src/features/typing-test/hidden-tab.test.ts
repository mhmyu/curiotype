import { describe, expect, it } from 'vitest';
import { HIDDEN_TAB_LIMIT_MS, shouldStopForHiddenTab } from './hidden-tab';

describe('shouldStopForHiddenTab', () => {
  it('uses a limit of five seconds', () => {
    expect(HIDDEN_TAB_LIMIT_MS).toBe(5000);
  });

  it('keeps a test that was hidden for less than the limit', () => {
    expect(shouldStopForHiddenTab(true, 0)).toBe(false);
    expect(shouldStopForHiddenTab(true, 4999)).toBe(false);
  });

  it('stops a test hidden for the limit or longer', () => {
    expect(shouldStopForHiddenTab(true, 5000)).toBe(true);
    expect(shouldStopForHiddenTab(true, 60_000)).toBe(true);
  });

  it('never stops a test that is not running', () => {
    expect(shouldStopForHiddenTab(false, 60_000)).toBe(false);
  });

  it('accepts another limit', () => {
    expect(shouldStopForHiddenTab(true, 2000, 1000)).toBe(true);
    expect(shouldStopForHiddenTab(true, 500, 1000)).toBe(false);
  });
});
