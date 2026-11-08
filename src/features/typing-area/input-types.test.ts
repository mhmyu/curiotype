import { describe, expect, it } from 'vitest';
import { isAllowedInputType, isCompositionInputType, shouldCancelInput } from './input-types';

describe('isAllowedInputType', () => {
  it.each(['insertText', 'deleteContentBackward', 'deleteWordBackward'])('allows %s', (type) => {
    expect(isAllowedInputType(type, false)).toBe(true);
  });

  it.each([
    'insertCompositionText',
    'deleteCompositionText',
    'insertFromComposition',
    'deleteByComposition',
  ])('allows the composition step %s', (type) => {
    expect(isAllowedInputType(type, false)).toBe(true);
  });

  it.each([
    'historyUndo',
    'historyRedo',
    'deleteByCut',
    'insertFromDrop',
    'insertFromPaste',
    'insertFromPasteAsQuotation',
    'insertFromYank',
    'insertReplacementText',
    'insertTranscription',
    'insertLink',
    'insertLineBreak',
    'insertParagraph',
    'deleteContentForward',
    'deleteWordForward',
    'deleteSoftLineBackward',
    'deleteHardLineBackward',
    'deleteSoftLineForward',
    'deleteHardLineForward',
    'deleteByDrag',
    'formatBold',
  ])('cancels %s', (type) => {
    expect(isAllowedInputType(type, false)).toBe(false);
  });

  it('cancels a kind it does not know, and an empty one (allow-list)', () => {
    expect(isAllowedInputType('insertSomethingNew', false)).toBe(false);
    expect(isAllowedInputType('', false)).toBe(false);
  });

  it('allows everything during a composition', () => {
    expect(isAllowedInputType('insertReplacementText', true)).toBe(true);
    expect(isAllowedInputType('historyUndo', true)).toBe(true);
  });
});

describe('shouldCancelInput', () => {
  it('cancels a forbidden kind that can be cancelled', () => {
    expect(shouldCancelInput({ inputType: 'historyUndo', cancelable: true }, false)).toBe(true);
  });

  it('does nothing when the browser does not allow cancelling', () => {
    expect(shouldCancelInput({ inputType: 'historyUndo', cancelable: false }, false)).toBe(false);
  });

  it('never cancels a typed character or Backspace', () => {
    expect(shouldCancelInput({ inputType: 'insertText', cancelable: true }, false)).toBe(false);
    expect(shouldCancelInput({ inputType: 'deleteContentBackward', cancelable: true }, false)).toBe(false);
  });

  it('never cancels while composing, by our flag or by the event flag', () => {
    expect(shouldCancelInput({ inputType: 'insertReplacementText', cancelable: true }, true)).toBe(false);
    expect(
      shouldCancelInput({ inputType: 'insertReplacementText', cancelable: true, isComposing: true }, false),
    ).toBe(false);
  });
});

describe('isCompositionInputType', () => {
  it('is true for the four composition kinds only', () => {
    for (const type of ['insertCompositionText', 'deleteCompositionText', 'insertFromComposition', 'deleteByComposition']) {
      expect(isCompositionInputType(type)).toBe(true);
    }
    expect(isCompositionInputType('insertText')).toBe(false);
    expect(isCompositionInputType('')).toBe(false);
  });
});
