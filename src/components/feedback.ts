import type { Settings } from "@/game/settings";

/**
 * Sound + haptics — both opt-in (sound defaults off), both silent when unsupported.
 * No audio files: short WebAudio blips, so nothing extra is downloaded or cached.
 */
type Cue = "pick" | "win" | "best" | "tactic" | "perfect";

let ctx: AudioContext | null = null;

const TONES: Record<Cue, [number, number][]> = {
  pick: [[520, 0.05]],
  win: [[523, 0.08], [659, 0.08], [784, 0.12]],
  best: [[659, 0.08], [784, 0.08], [1047, 0.16]],
  tactic: [[660, 0.04]],
  perfect: [[523, 0.08], [659, 0.08], [784, 0.08], [1047, 0.2]],
};
// Restrained: a pick is a tick, a real tactical improvement a double tick, a record a short pattern.
const BUZZ: Record<Cue, number | number[]> = { pick: 12, win: [20, 40, 20], best: [30, 50, 30, 50, 60], tactic: [8, 60, 8], perfect: [30, 60, 30, 60, 90] };

export function feedback(cue: Cue, s: Pick<Settings, "sound" | "haptics">) {
  if (typeof window === "undefined") return;
  if (s.haptics) {
    try {
      navigator.vibrate?.(BUZZ[cue]);
    } catch {
      /* unsupported */
    }
  }
  if (s.sound) {
    try {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      ctx ??= new AC();
      let t = ctx.currentTime;
      for (const [freq, dur] of TONES[cue]) {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = "triangle";
        o.frequency.value = freq;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.12, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g).connect(ctx.destination);
        o.start(t);
        o.stop(t + dur + 0.02);
        t += dur;
      }
    } catch {
      /* audio blocked */
    }
  }
}
