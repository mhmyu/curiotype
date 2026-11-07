/**
 * Size classes of the typing box for each `fontSize` setting. The text box is exactly four lines
 * high: line-height is 1.6, so 4 x 1.6 x font size gives the height for each size. The loading
 * placeholder on the home page uses the same heights, so the box does not change size when the
 * first sentences arrive.
 */
export const TYPING_SIZE_CLASS = {
  sm: { text: 'text-typing-sm', height: 'h-[6.4rem]' },
  md: { text: 'text-typing-md', height: 'h-32' },
  lg: { text: 'text-typing-lg', height: 'h-[9.6rem]' },
} as const;
