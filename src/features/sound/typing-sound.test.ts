import { describe, expect, it, vi } from 'vitest';
import {
  CLICK_DURATION_S,
  MAX_CLICK_GAIN,
  createTypingSound,
  getClickGain,
} from './typing-sound';

/** A fake AudioContext that records what a click builds. */
function createFakeContext(state: 'running' | 'suspended' = 'running') {
  const oscillator = {
    type: '',
    frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  };
  const amplifier = {
    gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
    connect: vi.fn(),
  };
  const context = {
    state,
    currentTime: 10,
    destination: {},
    resume: vi.fn(() => Promise.resolve()),
    createOscillator: vi.fn(() => oscillator),
    createGain: vi.fn(() => amplifier),
  };
  return { context: context as unknown as AudioContext, fake: context, oscillator, amplifier };
}

describe('getClickGain', () => {
  it('scales the volume to a quiet maximum', () => {
    expect(getClickGain(0)).toBe(0);
    expect(getClickGain(1)).toBe(MAX_CLICK_GAIN);
    expect(getClickGain(0.5)).toBeCloseTo(MAX_CLICK_GAIN / 2);
  });

  it('clamps values outside 0 to 1 and ignores values that are not numbers', () => {
    expect(getClickGain(-1)).toBe(0);
    expect(getClickGain(7)).toBe(MAX_CLICK_GAIN);
    expect(getClickGain(Number.NaN)).toBe(0);
    expect(getClickGain(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe('createTypingSound', () => {
  it('builds one short, decaying click per play', () => {
    const { context, fake, oscillator, amplifier } = createFakeContext();
    createTypingSound(() => context).play(1);

    expect(fake.createOscillator).toHaveBeenCalledTimes(1);
    expect(amplifier.gain.setValueAtTime).toHaveBeenCalledWith(MAX_CLICK_GAIN, 10);
    expect(amplifier.gain.exponentialRampToValueAtTime).toHaveBeenCalledWith(
      expect.any(Number),
      10 + CLICK_DURATION_S,
    );
    expect(oscillator.start).toHaveBeenCalledWith(10);
    expect(oscillator.stop).toHaveBeenCalledWith(10 + CLICK_DURATION_S);
    expect(oscillator.connect).toHaveBeenCalledWith(amplifier);
    expect(amplifier.connect).toHaveBeenCalledWith(fake.destination);
  });

  it('does not even create the audio context at volume 0', () => {
    const createContext = vi.fn(() => createFakeContext().context);
    createTypingSound(createContext).play(0);
    expect(createContext).not.toHaveBeenCalled();
  });

  it('creates the audio context once, on the first click, and reuses it', () => {
    const { context, fake } = createFakeContext();
    const createContext = vi.fn(() => context);
    const sound = createTypingSound(createContext);
    expect(createContext).not.toHaveBeenCalled();

    sound.play(0.5);
    sound.play(0.5);
    sound.play(0.5);
    expect(createContext).toHaveBeenCalledTimes(1);
    expect(fake.createOscillator).toHaveBeenCalledTimes(3);
  });

  it('resumes a context the browser left suspended', () => {
    const { context, fake } = createFakeContext('suspended');
    createTypingSound(() => context).play(1);
    expect(fake.resume).toHaveBeenCalledTimes(1);
  });

  it('stays silent, without errors, when WebAudio is not available', () => {
    const createContext = vi.fn(() => null);
    const sound = createTypingSound(createContext);
    expect(() => {
      sound.play(1);
      sound.play(1);
    }).not.toThrow();
    // Not tried again after the first failure.
    expect(createContext).toHaveBeenCalledTimes(1);
  });

  it('swallows an error from the audio device', () => {
    const { context, fake } = createFakeContext();
    fake.createOscillator.mockImplementation(() => {
      throw new Error('audio device lost');
    });
    expect(() => createTypingSound(() => context).play(1)).not.toThrow();
  });
});
