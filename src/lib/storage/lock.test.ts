import { afterEach, describe, expect, it, vi } from 'vitest';
import { withStorageLock } from './lock';

const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('withStorageLock (in-page queue)', () => {
  it('runs tasks with the same name one after another', async () => {
    const log: string[] = [];
    const task = (label: string, wait: number) => async () => {
      log.push(`start ${label}`);
      await tick(wait);
      log.push(`end ${label}`);
      return label;
    };

    const results = await Promise.all([
      withStorageLock('a', task('1', 10)),
      withStorageLock('a', task('2', 0)),
      withStorageLock('a', task('3', 0)),
    ]);

    expect(results).toEqual(['1', '2', '3']);
    expect(log).toEqual(['start 1', 'end 1', 'start 2', 'end 2', 'start 3', 'end 3']);
  });

  it('lets tasks with different names overlap', async () => {
    const log: string[] = [];
    const slow = withStorageLock('a', async () => {
      log.push('a start');
      await tick(10);
      log.push('a end');
    });
    const fast = withStorageLock('b', async () => {
      log.push('b start');
    });
    await Promise.all([slow, fast]);
    expect(log).toEqual(['a start', 'b start', 'a end']);
  });

  it('passes the error of a task on and still runs the next one', async () => {
    const failing = withStorageLock('a', async () => {
      throw new Error('boom');
    });
    const next = withStorageLock('a', async () => 'ok');

    await expect(failing).rejects.toThrow('boom');
    await expect(next).resolves.toBe('ok');
  });
});

describe('withStorageLock (Web Locks API)', () => {
  it('holds the lock while the task runs, under a prefixed name', async () => {
    const names: string[] = [];
    let held = false;
    vi.stubGlobal('navigator', {
      locks: {
        request: async (name: string, callback: () => Promise<unknown>) => {
          names.push(name);
          held = true;
          try {
            return await callback();
          } finally {
            held = false;
          }
        },
      },
    });

    let heldInside = false;
    const result = await withStorageLock('history', async () => {
      heldInside = held;
      return 42;
    });

    expect(result).toBe(42);
    expect(heldInside).toBe(true);
    expect(names).toEqual(['typing:history']);
  });

  it('runs the task once even when the lock request is refused', async () => {
    vi.stubGlobal('navigator', {
      locks: {
        request: async () => {
          throw new DOMException('denied', 'SecurityError');
        },
      },
    });

    const task = vi.fn(async () => 'ran');
    await expect(withStorageLock('a', task)).resolves.toBe('ran');
    expect(task).toHaveBeenCalledTimes(1);
  });

  it('does not run the task again when the task itself throws', async () => {
    vi.stubGlobal('navigator', {
      locks: { request: async (_name: string, callback: () => Promise<unknown>) => callback() },
    });

    const task = vi.fn(async () => {
      throw new Error('boom');
    });
    await expect(withStorageLock('a', task)).rejects.toThrow('boom');
    expect(task).toHaveBeenCalledTimes(1);
  });
});
