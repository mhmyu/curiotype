/**
 * Typing sound: one short click per typed character, made with WebAudio (no audio files, no
 * network). Off by default; the volume comes from the settings (0 to 1).
 *
 * Browsers only let an AudioContext start after a user gesture, so the context is created on
 * the first click that is actually played (a key press), never while the page loads.
 */

/** Length of one click. */
export const CLICK_DURATION_S = 0.03;
/** The click starts at this pitch and falls to `CLICK_END_HZ`, which sounds like a short tick. */
export const CLICK_START_HZ = 2000;
export const CLICK_END_HZ = 500;
/** Gain at full volume. A typing click is meant to stay quiet, so the slider never reaches 1. */
export const MAX_CLICK_GAIN = 0.25;
/** The decay ends here (an exponential ramp cannot reach exactly 0). */
const SILENCE = 0.0001;

/** Gain for a volume setting; anything outside 0 to 1 (or not a number) is clamped. */
export function getClickGain(volume: number): number {
  if (!Number.isFinite(volume)) return 0;
  return Math.min(1, Math.max(0, volume)) * MAX_CLICK_GAIN;
}

export interface TypingSound {
  /** Plays one click at `volume` (0 to 1). Does nothing at volume 0 or when WebAudio is missing. */
  play(volume: number): void;
}

function createBrowserContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Constructor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Constructor) return null;
  try {
    return new Constructor();
  } catch {
    return null;
  }
}

/**
 * `createContext` is a parameter so tests can pass a fake. It is called at most once, and only
 * when a click is really played; `null` means WebAudio is not available (the sound is then a
 * silent no-op, never an error).
 */
export function createTypingSound(
  createContext: () => AudioContext | null = createBrowserContext,
): TypingSound {
  // undefined = not tried yet; null = tried and unavailable.
  let context: AudioContext | null | undefined;

  return {
    play(volume) {
      const gain = getClickGain(volume);
      if (gain === 0) return;

      if (context === undefined) context = createContext();
      if (!context) return;

      try {
        if (context.state === 'suspended') void context.resume();
        const start = context.currentTime;
        const end = start + CLICK_DURATION_S;

        const oscillator = context.createOscillator();
        oscillator.type = 'triangle';
        oscillator.frequency.setValueAtTime(CLICK_START_HZ, start);
        oscillator.frequency.exponentialRampToValueAtTime(CLICK_END_HZ, end);

        const amplifier = context.createGain();
        amplifier.gain.setValueAtTime(gain, start);
        amplifier.gain.exponentialRampToValueAtTime(SILENCE, end);

        oscillator.connect(amplifier);
        amplifier.connect(context.destination);
        oscillator.start(start);
        oscillator.stop(end);
      } catch {
        // The sound is a nicety: a failing audio device must never get in the way of typing.
      }
    },
  };
}
