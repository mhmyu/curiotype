/**
 * Serializes read-modify-write cycles on stored data, so two tabs (or two overlapping calls in
 * one tab) cannot overwrite each other's changes.
 *
 * Every writer reads the current value again inside the lock and writes right after, so the
 * change is applied to the latest stored state instead of a copy read earlier.
 *
 * Two layers:
 * - An in-page queue per lock name: always on, orders the calls of one tab (also where the Web
 *   Locks API is missing and in unit tests).
 * - `navigator.locks` (when present): orders the calls of every tab and window of the origin.
 *
 * Limit: the lock orders the writers but cannot make a browser deliver another tab's write
 * sooner. Writers therefore also merge instead of replacing wherever the data allows it.
 */

/** Prefix of every Web Locks name, so the names never collide with other code on the origin. */
export const LOCK_PREFIX = 'typing:';

const queues = new Map<string, Promise<unknown>>();

async function runExclusive<T>(name: string, task: () => Promise<T>): Promise<T> {
  const previous = queues.get(name) ?? Promise.resolve();
  // A failed earlier task must not block the next one, so its outcome is ignored here.
  const run = previous.then(task, task);
  const tail = run.then(
    () => undefined,
    () => undefined,
  );
  queues.set(name, tail);
  try {
    return await run;
  } finally {
    // Free the entry when nothing was queued behind this task.
    if (queues.get(name) === tail) queues.delete(name);
  }
}

function getLockManager(): LockManager | null {
  try {
    return typeof navigator !== 'undefined' && navigator.locks ? navigator.locks : null;
  } catch {
    return null;
  }
}

/**
 * Runs `task` while holding the lock `name`. Never rejects because of the lock itself: when the
 * Web Locks API is missing or refuses the request, the task still runs (behind the in-page queue).
 * An error thrown by `task` is passed on to the caller.
 */
export function withStorageLock<T>(name: string, task: () => Promise<T>): Promise<T> {
  return runExclusive(name, async () => {
    const manager = getLockManager();
    if (!manager) return task();

    // `started` tells a failure of the request itself (task never ran) from one of the task.
    let started = false;
    try {
      return await manager.request(`${LOCK_PREFIX}${name}`, async () => {
        started = true;
        return task();
      });
    } catch (error) {
      if (started) throw error;
      return task();
    }
  });
}
