/**
 * Segue tokens. Palette from the solution doc (§8), structure from Arc's foundation.css
 * (radius, borders, shadows, easing). Everything that animates is a hex.
 */
export const C = {
  mist: "#DFF6FF",
  deep: "#06283D",
  ocean: "#1363DF",
  sky: "#47B5FF",
  gradFrom: "#9FB5D7",
  gradTo: "#46B5FD",
  surface: "#FFFFFF",
  surfaceMuted: "#F7F7F7",
  border: "#EBEBEB",
  borderStrong: "#C4C4C4",
  fg: "#06283D",
  text2: "#585858",
  text3: "#7D7D7D",
} as const;

/** Dark ops theme: Arc dark structure on Deep Ocean. */
export const D = {
  bg: "#06283D",
  surface: "#0A3350",
  raised: "#0E3B5C",
  border: "#174B70",
  fg: "#EAF6FF",
  text2: "#A6C3D6",
  text3: "#7896AB",
} as const;

export type Status = "safe" | "tight" | "risk" | "lost" | "info";

/** Status set: color (Arc accent), ink (Arc accent-strong), dark (Arc dark accent). */
export const STATUS: Record<Status, { label: string; color: string; ink: string; dark: string }> = {
  safe: { label: "Safe", color: "#0DB879", ink: "#087C54", dark: "#53DCA6" },
  tight: { label: "Tight", color: "#F3AD20", ink: "#9C6300", dark: "#FFCB62" },
  risk: { label: "At Risk", color: "#F48120", ink: "#AA4700", dark: "#FFAD5E" },
  lost: { label: "Lost", color: "#F15F55", ink: "#B92C27", dark: "#FF9386" },
  info: { label: "Info", color: "#1363DF", ink: "#0B4BB0", dark: "#7FB8FF" },
};

export const FONT = '"Instrument Sans", sans-serif';

/** Arc radii (rem → px) and the film's UI scale: Arc is sized for 14 px text, the film reads at 24 px and up. */
export const R = { control: 18, panel: 26, surface: 34, pill: 9999 } as const;

export const SHADOW = {
  resting: "0 1px 2px rgba(0,0,0,.035)",
  raised: "0 6px 18px rgba(0,0,0,.065), 0 1px 3px rgba(0,0,0,.035)",
  floating: "0 20px 48px rgba(0,0,0,.105), 0 3px 10px rgba(0,0,0,.045)",
  floatingDark: "0 22px 55px rgba(0,0,0,.34)",
} as const;

const toRgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/** color-mix(in srgb, a p, b): Arc's tints, as hex so they can animate. */
export function mix(a: string, b: string, p: number) {
  const [ar, ag, ab] = toRgb(a);
  const [br, bg, bb] = toRgb(b);
  const c = (x: number, y: number) => Math.round(x * p + y * (1 - p)).toString(16).padStart(2, "0");
  return `#${c(ar, br)}${c(ag, bg)}${c(ab, bb)}`;
}

export function alpha(hex: string, a: number) {
  const [r, g, b] = toRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}
