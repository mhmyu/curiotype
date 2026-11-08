/**
 * Attributes that ask browser extensions to leave the typing input alone. Grammar checkers add
 * their own buttons and may rewrite text, password managers offer to fill or save the field, and
 * both can change the value behind the page's back. These attributes only ask: an extension may
 * ignore them, so the input still has to cope with an unexpected change on its own.
 */
export const EXTENSION_GUARD_ATTRIBUTES = {
  // Grammarly
  'data-gramm': 'false',
  'data-gramm_editor': 'false',
  'data-enable-grammarly': 'false',
  // LastPass
  'data-lpignore': 'true',
  // 1Password
  'data-1p-ignore': 'true',
  // Dashlane and others: not a login, payment or address form
  'data-form-type': 'other',
} as const;

/**
 * Attributes that switch off the browser's own helpers (autofill, capitalization, autocorrect,
 * spell check). Kept next to the extension guards so the whole set lives in one place.
 */
export const BROWSER_GUARD_ATTRIBUTES = {
  autocomplete: 'off',
  autocapitalize: 'off',
  autocorrect: 'off',
  spellcheck: 'false',
} as const;
