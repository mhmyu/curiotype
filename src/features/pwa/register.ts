import { SERVICE_WORKER_URL } from '@/config/pwa';

/**
 * Browser side of the service worker (T30). The worker never takes over a running page by itself:
 * a new version installs and waits, `watchForUpdate` tells the page, and only the user's tap on
 * "Reload" (`applyUpdate`) activates it and reloads. So a test in progress is never interrupted.
 */

/** The parts of the browser's service worker objects that this module uses (fakes in tests). */
export type RegistrationLike = Pick<ServiceWorkerRegistration, 'waiting' | 'installing' | 'addEventListener'>;
export type ServiceWorkerLike = Pick<ServiceWorker, 'state' | 'postMessage' | 'addEventListener'>;
export type ContainerLike = Pick<ServiceWorkerContainer, 'controller' | 'addEventListener'>;

/**
 * Calls `onUpdate` with the waiting worker when a new version is ready and a worker already
 * controls the page. The very first install has no controller yet: nothing to update then.
 */
export function watchForUpdate(
  registration: RegistrationLike,
  container: Pick<ContainerLike, 'controller'>,
  onUpdate: (worker: ServiceWorkerLike) => void,
): void {
  if (registration.waiting && container.controller) onUpdate(registration.waiting);

  registration.addEventListener('updatefound', () => {
    const worker = registration.installing;
    if (!worker) return;
    worker.addEventListener('statechange', () => {
      if (worker.state === 'installed' && container.controller) onUpdate(worker);
    });
  });
}

/**
 * Activates a waiting worker and reloads once it has taken over. The reload only happens after
 * this call (the user asked for it), never for the first install's `clients.claim()`.
 */
export function applyUpdate(
  worker: ServiceWorkerLike,
  container: ContainerLike,
  reload: () => void,
): void {
  let reloading = false;
  container.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    reload();
  });
  worker.postMessage({ type: 'SKIP_WAITING' });
}

/** Minimum time between two update checks started by the app coming back to the foreground. */
export const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

/** True when `now` is far enough after the last check (or there was none). */
export function isUpdateCheckDue(lastCheck: number | null, now: number): boolean {
  return lastCheck === null || now - lastCheck >= UPDATE_CHECK_INTERVAL_MS;
}

/**
 * Registers the worker in a production build of a browser that supports it, then starts watching
 * for updates. Returns false when nothing was registered (development, no support, blocked).
 * An installed app is rarely reloaded, so the browser's own check on navigation is not enough:
 * the check also runs when the app returns to the foreground, at most once an hour.
 */
export async function registerServiceWorker(onUpdate: (worker: ServiceWorkerLike) => void): Promise<boolean> {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return false;
  try {
    const registration = await navigator.serviceWorker.register(SERVICE_WORKER_URL, { scope: '/' });
    watchForUpdate(registration, navigator.serviceWorker, onUpdate);

    let lastCheck: number | null = Date.now();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible' || !isUpdateCheckDue(lastCheck, Date.now())) return;
      lastCheck = Date.now();
      registration.update().catch(() => undefined);
    });
    return true;
  } catch {
    // Registration can fail (private mode, blocked by the user); the site works without it.
    return false;
  }
}
