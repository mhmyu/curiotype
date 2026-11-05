import { describe, expect, it } from 'vitest';
import {
  RESULT_SHORTCUT_DELAY_MS,
  isInteractiveTarget,
  shouldHandleResultEnter,
  shouldHandleResultEscape,
} from './shortcuts';
import type { ResultEnterEvent, ShortcutTarget } from './shortcuts';

const body: ShortcutTarget = { tagName: 'BODY' };

function element(tagName: string, attributes: Record<string, string> = {}): ShortcutTarget {
  return { tagName, getAttribute: (name) => attributes[name] ?? null };
}

function enter(overrides: Partial<ResultEnterEvent> = {}): ResultEnterEvent {
  return {
    key: 'Enter',
    repeat: false,
    modifiers: false,
    target: body,
    dialogOpen: false,
    msSinceFinished: RESULT_SHORTCUT_DELAY_MS,
    ...overrides,
  };
}

describe('isInteractiveTarget', () => {
  it('is true for elements that handle Enter themselves', () => {
    for (const tag of ['a', 'button', 'input', 'textarea', 'select', 'summary']) {
      expect(isInteractiveTarget(element(tag)), tag).toBe(true);
    }
  });

  it('is true for role="button" and editable content', () => {
    expect(isInteractiveTarget(element('DIV', { role: 'button' }))).toBe(true);
    expect(isInteractiveTarget(element('DIV', { contenteditable: 'true' }))).toBe(true);
    expect(isInteractiveTarget(element('DIV', { contenteditable: '' }))).toBe(true);
    expect(isInteractiveTarget({ tagName: 'DIV', isContentEditable: true })).toBe(true);
  });

  it('is false for the page body, plain elements, contenteditable="false", and no target', () => {
    expect(isInteractiveTarget(body)).toBe(false);
    expect(isInteractiveTarget(element('DIV', { role: 'status' }))).toBe(false);
    expect(isInteractiveTarget(element('DIV', { contenteditable: 'false' }))).toBe(false);
    expect(isInteractiveTarget(null)).toBe(false);
    expect(isInteractiveTarget(undefined)).toBe(false);
  });
});

describe('shouldHandleResultEnter', () => {
  it('handles a plain Enter once the guard delay has passed', () => {
    expect(shouldHandleResultEnter(enter())).toBe(true);
    expect(shouldHandleResultEnter(enter({ msSinceFinished: 5000 }))).toBe(true);
  });

  it('ignores Enter during the first 600 ms', () => {
    expect(shouldHandleResultEnter(enter({ msSinceFinished: 0 }))).toBe(false);
    expect(shouldHandleResultEnter(enter({ msSinceFinished: RESULT_SHORTCUT_DELAY_MS - 1 }))).toBe(false);
  });

  it('ignores other keys', () => {
    expect(shouldHandleResultEnter(enter({ key: ' ' }))).toBe(false);
    expect(shouldHandleResultEnter(enter({ key: 'Escape' }))).toBe(false);
    expect(shouldHandleResultEnter(enter({ key: 'Tab' }))).toBe(false);
  });

  it('ignores modifiers, key repeat, composition, handled events, and open dialogs', () => {
    expect(shouldHandleResultEnter(enter({ modifiers: true }))).toBe(false);
    expect(shouldHandleResultEnter(enter({ repeat: true }))).toBe(false);
    expect(shouldHandleResultEnter(enter({ isComposing: true }))).toBe(false);
    expect(shouldHandleResultEnter(enter({ defaultPrevented: true }))).toBe(false);
    expect(shouldHandleResultEnter(enter({ dialogOpen: true }))).toBe(false);
  });

  it('ignores Enter on a focused button, link, or field (their own action wins)', () => {
    expect(shouldHandleResultEnter(enter({ target: element('BUTTON') }))).toBe(false);
    expect(shouldHandleResultEnter(enter({ target: element('A') }))).toBe(false);
    expect(shouldHandleResultEnter(enter({ target: element('TEXTAREA') }))).toBe(false);
  });
});

describe('shouldHandleResultEscape', () => {
  const escape = { key: 'Escape', repeat: false, modifiers: false, target: body, dialogOpen: false };

  it('handles a plain Escape at once (no guard delay)', () => {
    expect(shouldHandleResultEscape(escape)).toBe(true);
  });

  it('also works with a button or link focused (Escape has no action there)', () => {
    expect(shouldHandleResultEscape({ ...escape, target: element('BUTTON') })).toBe(true);
    expect(shouldHandleResultEscape({ ...escape, target: element('A') })).toBe(true);
  });

  it('ignores Escape in form fields and editable content', () => {
    for (const tag of ['INPUT', 'TEXTAREA', 'SELECT']) {
      expect(shouldHandleResultEscape({ ...escape, target: element(tag) }), tag).toBe(false);
    }
    expect(shouldHandleResultEscape({ ...escape, target: element('DIV', { contenteditable: 'true' }) })).toBe(false);
  });

  it('ignores other keys, modifiers, repeat, composition, handled events, and open dialogs', () => {
    expect(shouldHandleResultEscape({ ...escape, key: 'Enter' })).toBe(false);
    expect(shouldHandleResultEscape({ ...escape, modifiers: true })).toBe(false);
    expect(shouldHandleResultEscape({ ...escape, repeat: true })).toBe(false);
    expect(shouldHandleResultEscape({ ...escape, isComposing: true })).toBe(false);
    expect(shouldHandleResultEscape({ ...escape, defaultPrevented: true })).toBe(false);
    expect(shouldHandleResultEscape({ ...escape, dialogOpen: true })).toBe(false);
  });
});
