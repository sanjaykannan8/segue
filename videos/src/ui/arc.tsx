/**
 * Frame-driven twins of Arc components (uiarc.dev, @uiarc registry).
 * The originals animate with motion/react on their own clock; these keep Arc's
 * structure and tokens (radius, 1px borders, tints at 10%/25%, blur-swap text)
 * and take every animated value as a prop computed from t. Scaled ~1.7x for 1080p.
 */
import type { CSSProperties, ReactNode } from "react";

import { C, D, FONT, R, SHADOW, STATUS, mix, alpha, type Status } from "../tokens";

/* ---------- Icons (lucide-style 2px strokes, like Arc's own) ---------- */
const ICONS: Record<string, string> = {
  check: "M20 6 9 17l-5-5",
  x: "M18 6 6 18M6 6l12 12",
  alert: "M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01",
  clock: "M12 2a10 10 0 1 0 0 20 10 10 0 1 0 0-20M12 6v6l4 2",
  plane: "M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z",
  bag: "M5 7h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2zM8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M8 11v5M16 11v5",
  shield: "M20 13c0 5-3.5 7.5-7.7 9a1 1 0 0 1-.6 0C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.2-2.7a1.2 1.2 0 0 1 1.6 0C14.5 3.8 17 5 19 5a1 1 0 0 1 1 1zM9 12l2 2 4-4",
  pin: "M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0ZM12 7a3 3 0 1 0 0 6 3 3 0 1 0 0-6",
  scan: "M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 12h10",
  arrow: "M5 12h14M12 5l7 7-7 7",
  zap: "M13 2 3 14h9l-1 8 10-12h-9l1-8z",
  users: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 3a4 4 0 1 0 0 8 4 4 0 1 0 0-8M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8",
  wallet: "M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4",
  globe: "M12 2a10 10 0 1 0 0 20 10 10 0 1 0 0-20M2 12h20M12 2a15 15 0 0 1 4 10 15 15 0 0 1-4 10 15 15 0 0 1-4-10 15 15 0 0 1 4-10z",
  chart: "M3 3v18h18M18 17V9M13 17V5M8 17v-3",
  wheel: "M12 2a10 10 0 1 0 0 20 10 10 0 1 0 0-20M12 8a4 4 0 1 0 0 8 4 4 0 1 0 0-8",
  refresh: "M3 12a9 9 0 0 1 9-9 9.8 9.8 0 0 1 6.7 2.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-9 9 9.8 9.8 0 0 1-6.7-2.7L3 16M8 16H3v5",
  door: "M13 4h3a2 2 0 0 1 2 2v14M2 20h3M13 20h9M10 12v.01M13 4.6v16.2a1 1 0 0 1-1.2 1l-5-1.1A1 1 0 0 1 6 19.7V5.6a1 1 0 0 1 .8-1l5-1.1a1 1 0 0 1 1.2 1z",
  brain: "M12 5a3 3 0 1 0-6 .1 4 4 0 0 0-2.5 5.8 4 4 0 0 0 .5 6.6A4 4 0 1 0 12 18zM12 5a3 3 0 1 1 6 .1 4 4 0 0 1 2.5 5.8 4 4 0 0 1-.5 6.6A4 4 0 1 1 12 18zM12 5v13",
};

export function Icon({ name, size = 24, color = "currentColor", stroke = 2, style }: { name: keyof typeof ICONS | string; size?: number; color?: string; stroke?: number; style?: CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" style={{ flex: "none", display: "block", ...style }}>
      <path d={ICONS[name]} />
    </svg>
  );
}

const statusIcon: Record<Status, string> = { safe: "check", tight: "clock", risk: "alert", lost: "x", info: "zap" };

/* ---------- Badge (Arc badge: pill, 1px tinted border, 10% tint, status ink) ---------- */
function badgeColors(status: Status, dark: boolean) {
  const s = STATUS[status];
  const surface = dark ? D.surface : C.surface;
  const ink = dark ? s.dark : s.ink;
  const color = dark ? s.dark : s.color;
  return { bg: mix(color, surface, dark ? 0.16 : 0.1), border: mix(color, dark ? D.border : C.border, dark ? 0.4 : 0.25), ink, color };
}

/**
 * A status badge whose status swaps over time: colors blend, the label blur-swaps
 * (Arc's textOut up, textIn from below). Fixed width so it never re-centers.
 */
export function StatusBadge({ from, to, u = 1, dark = false, s = 1, width, labels }: { from: Status; to: Status; u?: number; dark?: boolean; s?: number; width?: number; labels?: Partial<Record<Status, string>> }) {
  const a = badgeColors(from, dark);
  const b = badgeColors(to, dark);
  const blend = (x: string, y: string) => mix(y, x, u);
  const label = (st: Status) => labels?.[st] ?? STATUS[st].label;
  const line = (st: Status, o: number, y: number) => (
    <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 7 * s, opacity: o, translate: `0 ${y}em`, filter: o < 1 ? `blur(${(1 - o) * 6}px)` : undefined }}>
      <Icon name={statusIcon[st]} size={18 * s} stroke={2.4} />
      {label(st)}
    </span>
  );
  return (
    <span
      style={{
        position: "relative",
        display: "inline-flex",
        width: width ?? 150 * s,
        height: 44 * s,
        flex: "none",
        borderRadius: R.pill,
        border: `${1.5 * s}px solid ${blend(a.border, b.border)}`,
        background: blend(a.bg, b.bg),
        color: blend(a.ink, b.ink),
        fontSize: 21 * s,
        fontWeight: 600,
        letterSpacing: "-0.01em",
        overflow: "clip",
        whiteSpace: "nowrap",
      }}
    >
      {u < 1 ? line(from, 1 - u, -0.5 * u) : null}
      {line(to, u, 0.5 * (1 - u))}
    </span>
  );
}

export function Badge({ status, label, dark = false, s = 1, icon }: { status: Status; label?: string; dark?: boolean; s?: number; icon?: string }) {
  const c = badgeColors(status, dark);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 7 * s, height: 40 * s, padding: `0 ${16 * s}px`, borderRadius: R.pill, border: `${1.5 * s}px solid ${c.border}`, background: c.bg, color: c.ink, fontSize: 20 * s, fontWeight: 600, whiteSpace: "nowrap", flex: "none" }}>
      <Icon name={icon ?? statusIcon[status]} size={17 * s} stroke={2.4} />
      {label ?? STATUS[status].label}
    </span>
  );
}

/* ---------- Card (Arc card / metric-card surfaces) ---------- */
export function Card({ children, style, dark = false, radius = R.surface, shadow = "raised", target }: { children?: ReactNode; style?: CSSProperties; dark?: boolean; radius?: number; shadow?: keyof typeof SHADOW | "none"; target?: string }) {
  return (
    <div
      data-target={target}
      style={{
        position: "relative",
        border: `1.5px solid ${dark ? D.border : C.border}`,
        borderRadius: radius,
        background: dark ? D.surface : C.surface,
        color: dark ? D.fg : C.fg,
        boxShadow: shadow === "none" ? undefined : dark && shadow === "floating" ? SHADOW.floatingDark : SHADOW[shadow],
        overflow: "hidden",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/* ---------- Toast (Arc toast: tinted icon disc, title + description, floating shadow) ---------- */
export function Toast({ status, title, description, icon, dark = false, s = 1, style }: { status: Status; title: string; description?: string; icon?: string; dark?: boolean; s?: number; style?: CSSProperties }) {
  const c = badgeColors(status, dark);
  const surface = dark ? D.raised : C.surface;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 16 * s,
        padding: `${16 * s}px ${20 * s}px ${16 * s}px ${18 * s}px`,
        border: `1.5px solid ${dark ? D.border : C.border}`,
        borderRadius: R.panel * s,
        background: surface,
        color: dark ? D.fg : C.fg,
        boxShadow: dark ? SHADOW.floatingDark : SHADOW.floating,
        ...style,
      }}
    >
      <div style={{ display: "grid", placeItems: "center", width: 52 * s, height: 52 * s, flex: "none", borderRadius: R.pill, border: `1.5px solid ${c.border}`, background: c.bg, color: c.color }}>
        <Icon name={icon ?? statusIcon[status]} size={24 * s} stroke={2.2} />
      </div>
      <div style={{ display: "grid", gap: 2 * s, paddingTop: 2 * s, minWidth: 0 }}>
        <div style={{ fontSize: 24 * s, fontWeight: 600, lineHeight: 1.3, whiteSpace: "nowrap" }}>{title}</div>
        {description ? <div style={{ fontSize: 21 * s, color: dark ? D.text2 : C.text2, lineHeight: 1.35, whiteSpace: "nowrap" }}>{description}</div> : null}
      </div>
    </div>
  );
}

/* ---------- Button (Arc: primary = foreground fill, secondary = surface + border) ---------- */
export function Button({ children, variant = "primary", dark = false, s = 1, press = 0, width, target, style }: { children: ReactNode; variant?: "primary" | "secondary"; dark?: boolean; s?: number; press?: number; width?: number; target?: string; style?: CSSProperties }) {
  const fg = dark ? D.fg : C.fg;
  const bg = dark ? D.surface : C.surface;
  const primary = variant === "primary";
  return (
    <div
      data-target={target}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 10 * s,
        width,
        height: 68 * s,
        padding: `0 ${30 * s}px`,
        borderRadius: R.control * 1.55 * s,
        border: `1.5px solid ${primary ? fg : dark ? D.border : C.border}`,
        background: primary ? fg : bg,
        color: primary ? (dark ? D.bg : C.surface) : fg,
        fontSize: 24 * s,
        fontWeight: 600,
        letterSpacing: "-0.01em",
        scale: String(1 - 0.04 * press),
        opacity: 1 - 0.16 * press,
        whiteSpace: "nowrap",
        flex: "none",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/* ---------- Progress (Arc progress: border-colored track, accent fill) ---------- */
export function Progress({ value, color = C.ocean, dark = false, height = 12 }: { value: number; color?: string; dark?: boolean; height?: number }) {
  return (
    <div style={{ position: "relative", height, borderRadius: R.pill, background: dark ? D.border : C.border, overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, width: `${Math.max(0, Math.min(1, value)) * 100}%`, borderRadius: R.pill, background: color }} />
    </div>
  );
}

/* ---------- Gauge (Arc gauge: activity ring, thick round-capped arc over a 13% tint) ---------- */
export function Gauge({ value, color, size = 220, children }: { value: number; color: string; size?: number; children?: ReactNode }) {
  const r = 40;
  const sweep = 270;
  const circumference = 2 * Math.PI * r;
  const arc = (circumference * sweep) / 360;
  const v = Math.max(0, Math.min(1, value));
  return (
    <div style={{ position: "relative", width: size, height: size * 0.9 }}>
      <svg width={size} height={size} viewBox="0 0 100 100" style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
        <g transform="rotate(135 50 50)">
          <circle cx={50} cy={50} r={r} fill="none" stroke={alpha(color, 0.16)} strokeWidth={9} strokeLinecap="round" strokeDasharray={`${arc} ${circumference}`} />
          <circle cx={50} cy={50} r={r} fill="none" stroke={color} strokeWidth={9} strokeLinecap="round" strokeDasharray={`${arc * v} ${circumference}`} />
        </g>
      </svg>
      <div style={{ position: "absolute", left: 0, top: 0, width: size, height: size, display: "grid", placeContent: "center", justifyItems: "center", gap: 2 }}>{children}</div>
    </div>
  );
}

/* ---------- Stepper (Arc stepper: disc markers, halo on current, accent fill on connectors) ---------- */
export type StepItem = { label: string; description?: string };

/** `done` is fractional: 2.4 = two steps complete and the third connector 40% filled. */
export function Stepper({ steps, done, accent = C.ocean, orientation = "horizontal", s = 1, dark = false, gap = 34 }: { steps: StepItem[]; done: number; accent?: string; orientation?: "horizontal" | "vertical"; s?: number; dark?: boolean; gap?: number }) {
  const marker = 44 * s;
  const vertical = orientation === "vertical";
  const fg = dark ? D.fg : C.fg;
  const surface = dark ? D.surface : C.surface;
  return (
    <div style={{ display: "grid", gridAutoFlow: vertical ? "row" : "column", gridAutoColumns: vertical ? undefined : "1fr", rowGap: vertical ? gap * s : 0 }}>
      {steps.map((item, index) => {
        const complete = done >= index + 1 - 1e-6;
        const current = !complete && done > index - 1e-6;
        const fill = Math.max(0, Math.min(1, done - index - 1 + 1));
        const connectorFill = Math.max(0, Math.min(1, done - (index + 1)));
        const disc = complete ? accent : surface;
        return (
          <div key={item.label} style={{ position: "relative", display: vertical ? "grid" : "grid", gridTemplateColumns: vertical ? `${marker}px 1fr` : undefined, columnGap: 16 * s, rowGap: 12 * s, justifyItems: vertical ? undefined : "start" }}>
            {index < steps.length - 1 ? (
              <div
                style={{
                  position: "absolute",
                  borderRadius: R.pill,
                  background: dark ? D.border : C.border,
                  overflow: "hidden",
                  ...(vertical
                    ? { left: marker / 2 - 1.5 * s, top: marker + 8 * s, width: 3 * s, height: `calc(100% + ${gap * s}px - ${marker + 16 * s}px)` }
                    : { top: marker / 2 - 1.5 * s, left: marker + 12 * s, right: 12 * s, height: 3 * s }),
                }}
              >
                <div style={{ position: "absolute", inset: 0, background: accent, transformOrigin: vertical ? "center top" : "left center", scale: vertical ? `1 ${connectorFill}` : `${connectorFill} 1` }} />
              </div>
            ) : null}
            <div style={{ position: "relative", width: marker, height: marker, display: "grid", placeItems: "center" }}>
              {current ? <div style={{ position: "absolute", inset: -6 * s, borderRadius: R.pill, background: alpha(accent, 0.16) }} /> : null}
              <div
                style={{
                  position: "relative",
                  width: marker,
                  height: marker,
                  borderRadius: R.pill,
                  display: "grid",
                  placeItems: "center",
                  background: disc,
                  boxShadow: complete ? `inset 0 0 0 ${1.5 * s}px ${accent}` : current ? `inset 0 0 0 ${2.5 * s}px ${accent}` : `inset 0 0 0 ${1.5 * s}px ${dark ? D.border : C.borderStrong}`,
                  color: complete ? "#FFFFFF" : fg,
                  fontSize: 19 * s,
                  fontWeight: 600,
                }}
              >
                {complete ? <Icon name="check" size={22 * s} stroke={3} style={{ scale: String(0.6 + 0.4 * Math.min(1, fill)) }} /> : index + 1}
              </div>
            </div>
            <div style={{ display: "grid", paddingTop: vertical ? 6 * s : 0 }}>
              <span style={{ fontSize: 22 * s, fontWeight: 600, color: complete ? (dark ? D.text2 : C.text2) : current ? fg : dark ? D.text3 : C.text3, whiteSpace: "nowrap" }}>{item.label}</span>
              {item.description ? <span style={{ fontSize: 19 * s, color: dark ? D.text3 : C.text3, whiteSpace: "nowrap", paddingTop: 2 }}>{item.description}</span> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- Avatar (Arc avatar: initials on surface-muted with a hairline border) ---------- */
export function Avatar({ initials, size = 60, dark = false, children }: { initials?: string; size?: number; dark?: boolean; children?: ReactNode }) {
  return (
    <div style={{ display: "grid", placeItems: "center", width: size, height: size, flex: "none", borderRadius: R.pill, border: `1.5px solid ${dark ? D.border : C.border}`, background: dark ? D.raised : C.surfaceMuted, color: dark ? D.fg : C.fg, fontSize: size * 0.36, fontWeight: 600, overflow: "hidden" }}>
      {children ?? initials}
    </div>
  );
}

/* ---------- A boarding-pass QR (deterministic pattern with the three finder squares) ---------- */
export function QR({ size = 200, color = C.fg, seed = 7, reveal = 1 }: { size?: number; color?: string; seed?: number; reveal?: number }) {
  const n = 25;
  const cell = size / n;
  const cells: ReactNode[] = [];
  let x = seed;
  const rand = () => ((x = (x * 1103515245 + 12345) % 2147483648) / 2147483648);
  const finder = (r: number, c: number) => {
    const inBox = (r0: number, c0: number) => r >= r0 && r < r0 + 7 && c >= c0 && c < c0 + 7;
    return inBox(0, 0) || inBox(0, n - 7) || inBox(n - 7, 0);
  };
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (finder(r, c)) continue;
      const on = rand() > 0.52;
      if (on && (r + c) / (2 * n) <= reveal) cells.push(<rect key={`${r}-${c}`} x={c * cell} y={r * cell} width={cell + 0.3} height={cell + 0.3} />);
    }
  }
  const finderAt = (r: number, c: number) => (
    <g key={`f${r}${c}`}>
      <rect x={c * cell + cell / 2} y={r * cell + cell / 2} width={cell * 6} height={cell * 6} fill="none" stroke={color} strokeWidth={cell} rx={cell * 1.2} />
      <rect x={(c + 2) * cell} y={(r + 2) * cell} width={cell * 3} height={cell * 3} rx={cell * 0.6} />
    </g>
  );
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill={color} style={{ display: "block" }}>
      {cells}
      {finderAt(0, 0)}
      {finderAt(0, n - 7)}
      {finderAt(n - 7, 0)}
    </svg>
  );
}

export const Label = ({ children, dark = false, size = 20, style }: { children: ReactNode; dark?: boolean; size?: number; style?: CSSProperties }) => (
  <span style={{ fontSize: size, color: dark ? D.text2 : C.text2, fontWeight: 500, whiteSpace: "nowrap", ...style }}>{children}</span>
);

export { FONT };
