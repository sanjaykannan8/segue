/** The beat grid. 160 BPM, 4/4, film starts on a downbeat. Scene code never holds a literal frame. */
export const BPM = 160;
export const BEAT = 60 / BPM; // 0.375 s
export const BAR = BEAT * 4; // 1.5 s
export const BARS = 30;
export const DURATION = BARS * BAR; // 45 s

/**
 * Story bars. The hook owns real bars 1-3 (0-4.5 s) so the pain point has time to read;
 * story bar 3 onward starts one real bar later. Story bars run 1-29 inside 30 real bars.
 */
export const b = (bar: number, beat = 1, fraction = 0) => (bar - 1 + (bar >= 3 ? 1 : 0)) * BAR + (beat - 1 + fraction) * BEAT;

export const ACT = {
  hook: [b(1), b(3)],
  meet: [b(3), b(4)],
  world: [b(4), b(19)],
  impact: [b(19), b(21)],
  tagline: [b(21), b(24)],
  cta: [b(24), DURATION],
} as const;

/** Bars where the kick plays (the audio uses the same map). */
export const kickBars = (bar: number) => (bar >= 3 && bar <= 20) || (bar >= 24 && bar <= 29);
