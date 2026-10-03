import { Easing } from "remotion";
import type { CSSProperties } from "react";

import { step, type SpringConfig } from "../kit/spring";
import { clamp01 } from "../kit/time";
import { BEAT, kickBars, BAR } from "./cues";

/** Arc --ease-standard. */
export const standard = Easing.bezier(0.22, 1, 0.36, 1);
export const inOut = Easing.bezier(0.65, 0, 0.35, 1);

/** Arc's spring: a gentle settle (bounce .15). */
export const arcSpring: SpringConfig = { stiffness: 260, damping: 22 };
/** Smooth: settles with almost no overshoot. */
export const popSpring: SpringConfig = { stiffness: 200, damping: 26 };

export const ease = (t: number, start: number, length: number, fn = standard) => fn(clamp01((t - start) / length));
export const lerp = (a: number, b: number, u: number) => a + (b - a) * u;

/** Blur-rise in at `at`, blur out at `out` (Arc's textIn / textOut, scaled up for 1080p). */
export function rise(t: number, at: number, out = Infinity, distance = 28, blur = 14): CSSProperties & { visible: boolean } {
  const u = ease(t, at, 0.5);
  const v = out === Infinity ? 0 : ease(t, out, 0.3);
  const o = u * (1 - v);
  return {
    opacity: o,
    translate: `0 ${(1 - u) * distance - v * distance * 0.5}px`,
    filter: o < 0.999 ? `blur(${(1 - o) * blur}px)` : undefined,
    visible: o > 0.001,
  };
}

/** A spring pop from 0 to 1 at `at`, with a soft overshoot. */
export const pop = (t: number, at: number, config = popSpring) => step(t - at, config);

/** A value stepping through keyed targets with a short eased tween between each. */
export function tween(t: number, keys: readonly (readonly [number, number])[], length = 0.35, fn = standard) {
  let value = keys[0][1];
  for (let i = 1; i < keys.length; i++) value += (keys[i][1] - keys[i - 1][1]) * fn(clamp01((t - keys[i][0]) / length));
  return value;
}

/** The current label of a keyed swap, plus the previous one and the swap progress. */
export function swap<T>(t: number, keys: readonly (readonly [number, T])[], length = 0.26) {
  let index = 0;
  for (let i = 0; i < keys.length; i++) if (t >= keys[i][0]) index = i;
  const u = index === 0 ? 1 : clamp01((t - keys[index][0]) / length);
  return { current: keys[index][1], previous: keys[Math.max(0, index - 1)][1], u: standard(u), index };
}

/** A kick envelope on every beat of bars that have drums: drives zoom pulses and mascot bounces. */
export function kick(t: number) {
  if (t < 0) return 0;
  const bar = Math.floor(t / BAR) + 1;
  if (!kickBars(bar)) return 0;
  const phase = t % BEAT;
  return Math.exp(-phase / 0.09);
}

/** Smooth noise-ish drift from a few incommensurate sines: a handheld feel. */
export const drift = (t: number, seed = 0) =>
  Math.sin(t * 0.73 + seed) * 0.55 + Math.sin(t * 1.37 + seed * 2.1) * 0.3 + Math.sin(t * 2.11 + seed * 3.7) * 0.15;

/** A decaying shake after `at`. */
export function shake(t: number, at: number, amount = 18, length = 0.45) {
  const d = t - at;
  if (d < 0 || d > length) return { x: 0, y: 0, r: 0 };
  const k = (1 - d / length) ** 2;
  return { x: Math.sin(d * 71) * amount * k, y: Math.cos(d * 53) * amount * 0.7 * k, r: Math.sin(d * 37) * 1.2 * k };
}

/** Count a number between keys with an eased tween, rounded. */
export const count = (t: number, keys: readonly (readonly [number, number])[], length = 0.5) => Math.round(tween(t, keys, length, inOut));
