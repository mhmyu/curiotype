import { describe, expect, it, vi } from 'vitest';
import { shareOrDownload } from './share-result';
import type { ShareNavigator } from './share-result';

const options = { fileName: 'typing-result-40wpm.png', title: 'Site', text: '40 WPM' };
const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' });

describe('shareOrDownload', () => {
  it('shares the file when the browser can share files', async () => {
    const calls: ShareData[] = [];
    const share = async (data: ShareData) => {
      calls.push(data);
    };
    const download = vi.fn();
    const nav: ShareNavigator = { canShare: () => true, share };

    expect(await shareOrDownload(blob, options, nav, download)).toBe('shared');
    expect(download).not.toHaveBeenCalled();
    const sent = calls[0];
    expect(sent.files).toHaveLength(1);
    expect(sent.files?.[0].name).toBe('typing-result-40wpm.png');
    expect(sent.files?.[0].type).toBe('image/png');
    expect(sent.title).toBe('Site');
    expect(sent.text).toBe('40 WPM');
  });

  it('downloads when the browser cannot share files', async () => {
    const share = vi.fn(async () => {});
    const download = vi.fn();
    const nav: ShareNavigator = { canShare: () => false, share };

    expect(await shareOrDownload(blob, options, nav, download)).toBe('downloaded');
    expect(share).not.toHaveBeenCalled();
    expect(download).toHaveBeenCalledWith(blob, 'typing-result-40wpm.png');
  });

  it('downloads when there is no Web Share API at all', async () => {
    const download = vi.fn();
    expect(await shareOrDownload(blob, options, {}, download)).toBe('downloaded');
    expect(download).toHaveBeenCalledTimes(1);
  });

  it('downloads when canShare exists but share does not', async () => {
    const download = vi.fn();
    expect(await shareOrDownload(blob, options, { canShare: () => true }, download)).toBe('downloaded');
  });

  it('treats a dismissed share sheet as cancelled, without a download', async () => {
    const abort = Object.assign(new Error('dismissed'), { name: 'AbortError' });
    const download = vi.fn();
    const nav: ShareNavigator = { canShare: () => true, share: async () => { throw abort; } };

    expect(await shareOrDownload(blob, options, nav, download)).toBe('cancelled');
    expect(download).not.toHaveBeenCalled();
  });

  it('falls back to the download when sharing fails for another reason', async () => {
    const refused = Object.assign(new Error('not allowed'), { name: 'NotAllowedError' });
    const download = vi.fn();
    const nav: ShareNavigator = { canShare: () => true, share: async () => { throw refused; } };

    expect(await shareOrDownload(blob, options, nav, download)).toBe('downloaded');
    expect(download).toHaveBeenCalledWith(blob, 'typing-result-40wpm.png');
  });
});
