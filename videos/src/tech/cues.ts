/** Technical film grid: 160 BPM, 1.5 s bars, 30 bars = 45 s. Plain bars, no shift. */
export const BEAT = 0.375;
export const BAR = 1.5;
export const DURATION = 45;
export const tb = (bar: number, beat = 1, fraction = 0) => (bar - 1) * BAR + (beat - 1 + fraction) * BEAT;

export const T = {
  scale: tb(1),
  connect: tb(4),
  cache: tb(8),
  decide: tb(11),
  gate: tb(15),
  pipe: tb(17),
  fan: tb(21),
  recap: tb(24),
  end: tb(27),
} as const;
