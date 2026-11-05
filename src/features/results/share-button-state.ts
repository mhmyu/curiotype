/** Progress of the share image, which is drawn as soon as a result is shown (T29, T34). */
export type ShareImageStatus = 'preparing' | 'ready' | 'failed';

/** What a click on the Share button does. */
export type ShareClickAction = 'ignore' | 'redraw' | 'share';

export interface ShareButtonState {
  /** Exposed as `aria-disabled`; the button stays focusable (a native `disabled` would drop the focus). */
  ariaDisabled: boolean;
  /** `busy` = the "Preparing image..." label, `share` = the normal label. */
  label: 'share' | 'busy';
  /** A message the user needs, shown in the status line (`shareFailed`); null = none. */
  message: 'failed' | null;
  /** What the click does. Never draws the image inside the click handler that shares (iOS Safari). */
  onClick: ShareClickAction;
}

/**
 * Pure view of the Share button.
 * - `preparing`: disabled look, "Preparing image..." label, clicks ignored.
 * - `ready`: normal button; the click shares the image that is already drawn.
 * - `failed`: the failure message and an active button; a click draws the image again (it does not
 *   share in the same click) and the next click, once the image is ready, shares it.
 * - While a share or download is running (`sharing`) clicks are ignored; the label stays normal.
 */
export function getShareButtonState(status: ShareImageStatus, sharing: boolean): ShareButtonState {
  if (status === 'preparing') return { ariaDisabled: true, label: 'busy', message: null, onClick: 'ignore' };
  if (sharing) {
    return { ariaDisabled: true, label: 'share', message: status === 'failed' ? 'failed' : null, onClick: 'ignore' };
  }
  if (status === 'failed') return { ariaDisabled: false, label: 'share', message: 'failed', onClick: 'redraw' };
  return { ariaDisabled: false, label: 'share', message: null, onClick: 'share' };
}
