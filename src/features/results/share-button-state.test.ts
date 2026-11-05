import { describe, expect, it } from 'vitest';
import { getShareButtonState } from './share-button-state';

describe('getShareButtonState', () => {
  it('preparing: aria-disabled, busy label, clicks ignored', () => {
    expect(getShareButtonState('preparing', false)).toEqual({
      ariaDisabled: true,
      label: 'busy',
      message: null,
      onClick: 'ignore',
    });
  });

  it('preparing wins over sharing (a redraw is in progress)', () => {
    expect(getShareButtonState('preparing', true).label).toBe('busy');
  });

  it('ready: normal button that shares the finished image', () => {
    expect(getShareButtonState('ready', false)).toEqual({
      ariaDisabled: false,
      label: 'share',
      message: null,
      onClick: 'share',
    });
  });

  it('failed: shows the message, the button is active and a click redraws instead of sharing', () => {
    expect(getShareButtonState('failed', false)).toEqual({
      ariaDisabled: false,
      label: 'share',
      message: 'failed',
      onClick: 'redraw',
    });
  });

  it('while sharing, clicks are ignored and the label stays normal', () => {
    expect(getShareButtonState('ready', true)).toEqual({
      ariaDisabled: true,
      label: 'share',
      message: null,
      onClick: 'ignore',
    });
  });
});
