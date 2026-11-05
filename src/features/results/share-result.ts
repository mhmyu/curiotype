/** What happened when the user pressed "Share". */
export type ShareOutcome = 'shared' | 'downloaded' | 'cancelled';

/** The part of `navigator` that sharing uses; a parameter so tests can replace it. */
export interface ShareNavigator {
  canShare?: (data: ShareData) => boolean;
  share?: (data: ShareData) => Promise<void>;
}

export interface ShareOptions {
  fileName: string;
  title: string;
  text: string;
}

/** Saves a blob as a file through a temporary link (the browser's normal download). */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.rel = 'noopener';
  document.body.append(link);
  link.click();
  link.remove();
  // Revoke later: some browsers read the URL asynchronously after the click.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function isAbort(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { name?: string }).name === 'AbortError';
}

/**
 * Shares the image with the Web Share API when the browser can share files, otherwise downloads
 * it. A dismissed share sheet is not an error. Any other share failure (for example a browser
 * that refuses because the click is too old) falls back to the download, so the user always
 * ends up with the image.
 */
export async function shareOrDownload(
  blob: Blob,
  { fileName, title, text }: ShareOptions,
  nav: ShareNavigator = navigator,
  download: (blob: Blob, fileName: string) => void = downloadBlob,
): Promise<ShareOutcome> {
  const file = new File([blob], fileName, { type: blob.type || 'image/png' });
  const data: ShareData = { files: [file], title, text };

  if (typeof nav.share === 'function' && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share(data);
      return 'shared';
    } catch (error) {
      if (isAbort(error)) return 'cancelled';
    }
  }

  download(blob, fileName);
  return 'downloaded';
}
