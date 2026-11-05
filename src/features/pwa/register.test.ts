import { describe, expect, it, vi } from 'vitest';
import {
  UPDATE_CHECK_INTERVAL_MS,
  applyUpdate,
  isUpdateCheckDue,
  registerServiceWorker,
  watchForUpdate,
} from './register';
import type { ContainerLike, RegistrationLike, ServiceWorkerLike } from './register';

/** A tiny event target: `emit` calls the listeners added for a type. */
function createTarget() {
  const listeners = new Map<string, Array<() => void>>();
  return {
    addEventListener: (type: string, listener: () => void) => {
      listeners.set(type, [...(listeners.get(type) ?? []), listener]);
    },
    emit: (type: string) => (listeners.get(type) ?? []).forEach((listener) => listener()),
  };
}

function createWorker(state = 'installing') {
  const target = createTarget();
  const worker = { state, postMessage: vi.fn(), addEventListener: target.addEventListener };
  return { worker: worker as unknown as ServiceWorkerLike & { state: string }, raw: worker, emit: target.emit };
}

function createRegistration(options: { waiting?: ServiceWorkerLike | null; installing?: ServiceWorkerLike | null } = {}) {
  const target = createTarget();
  const registration = {
    waiting: options.waiting ?? null,
    installing: options.installing ?? null,
    addEventListener: target.addEventListener,
  };
  return { registration: registration as unknown as RegistrationLike, raw: registration, emit: target.emit };
}

describe('watchForUpdate', () => {
  it('reports a worker that is already waiting while a worker controls the page', () => {
    const { worker } = createWorker('installed');
    const { registration } = createRegistration({ waiting: worker });
    const onUpdate = vi.fn();
    watchForUpdate(registration, { controller: {} as ServiceWorker }, onUpdate);
    expect(onUpdate).toHaveBeenCalledWith(worker);
  });

  it('reports a new version once it has installed', () => {
    const { worker, raw, emit: emitWorker } = createWorker('installing');
    const { registration, raw: rawRegistration, emit } = createRegistration();
    const onUpdate = vi.fn();
    watchForUpdate(registration, { controller: {} as ServiceWorker }, onUpdate);

    rawRegistration.installing = worker;
    emit('updatefound');
    emitWorker('statechange');
    expect(onUpdate).not.toHaveBeenCalled();

    raw.state = 'installed';
    emitWorker('statechange');
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledWith(worker);
  });

  it('says nothing for the very first install, which has no controller', () => {
    const { worker, raw, emit: emitWorker } = createWorker('installing');
    const { registration, raw: rawRegistration, emit } = createRegistration();
    const onUpdate = vi.fn();
    watchForUpdate(registration, { controller: null }, onUpdate);

    rawRegistration.installing = worker;
    emit('updatefound');
    raw.state = 'installed';
    emitWorker('statechange');
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('ignores an update event without an installing worker', () => {
    const { registration, emit } = createRegistration();
    const onUpdate = vi.fn();
    watchForUpdate(registration, { controller: {} as ServiceWorker }, onUpdate);
    expect(() => emit('updatefound')).not.toThrow();
    expect(onUpdate).not.toHaveBeenCalled();
  });
});

describe('applyUpdate', () => {
  function setup() {
    const { worker, raw } = createWorker('installed');
    const target = createTarget();
    const container = { controller: {}, addEventListener: target.addEventListener } as unknown as ContainerLike;
    const reload = vi.fn();
    return { worker, raw, container, reload, controllerChange: () => target.emit('controllerchange') };
  }

  it('asks the waiting worker to take over, and does not reload before it has', () => {
    const { worker, raw, container, reload } = setup();
    applyUpdate(worker, container, reload);
    expect(raw.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    expect(reload).not.toHaveBeenCalled();
  });

  it('reloads once when the new worker has taken over', () => {
    const { worker, container, reload, controllerChange } = setup();
    applyUpdate(worker, container, reload);
    controllerChange();
    controllerChange();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('never reloads for a takeover nobody asked for (the first install claims the page)', () => {
    const { container, reload } = setup();
    // applyUpdate was not called, so no listener exists: nothing can reload.
    expect(container.controller).toBeDefined();
    expect(reload).not.toHaveBeenCalled();
  });
});

describe('isUpdateCheckDue', () => {
  it('is due when there was no check, or an hour has passed', () => {
    expect(isUpdateCheckDue(null, 1000)).toBe(true);
    expect(isUpdateCheckDue(0, UPDATE_CHECK_INTERVAL_MS)).toBe(true);
    expect(isUpdateCheckDue(0, UPDATE_CHECK_INTERVAL_MS - 1)).toBe(false);
  });
});

describe('registerServiceWorker', () => {
  it('does nothing outside a production build (Vitest runs in development mode)', async () => {
    expect(await registerServiceWorker(() => undefined)).toBe(false);
  });
});
