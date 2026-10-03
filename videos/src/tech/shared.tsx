import type { ReactNode } from "react";

import { C, R, alpha } from "../tokens";
import { Icon } from "../ui/arc";
import { rise } from "../film/anim";

export type Line = { at: number; out: number; title: ReactNode; sub?: ReactNode };

/** The headline band: one statement at a time, blur-swapped. Fixed position, never overlaps the scene. */
export function Headline({ t, lines, top = 78 }: { t: number; lines: Line[]; top?: number }) {
  return (
    <>
      {lines.map((line, i) => {
        const r = rise(t, line.at, line.out, 26, 14);
        if (!r.visible) return null;
        const s = rise(t, line.at + 0.25, line.out, 18, 10);
        return (
          <div key={i} style={{ position: "absolute", left: 0, right: 0, top, display: "grid", justifyItems: "center", gap: 14 }}>
            <div style={{ fontSize: 76, fontWeight: 600, letterSpacing: "-0.035em", lineHeight: 1.05, color: C.fg, whiteSpace: "nowrap", opacity: r.opacity, translate: r.translate, filter: r.filter }}>{line.title}</div>
            {line.sub ? <div style={{ fontSize: 32, fontWeight: 500, color: C.text2, whiteSpace: "nowrap", opacity: s.opacity, translate: s.translate, filter: s.filter }}>{line.sub}</div> : null}
          </div>
        );
      })}
    </>
  );
}

/** Arc icon disc: accent tint, hairline border. `on` blends it to a filled accent. */
export function Disc({ icon, size = 64, on = 0 }: { icon: string; size?: number; on?: number }) {
  return (
    <div style={{ width: size, height: size, flex: "none", borderRadius: R.pill, display: "grid", placeItems: "center", background: alpha(C.ocean, 0.1 + 0.9 * on), color: on > 0.5 ? "#FFFFFF" : C.ocean, border: `1.5px solid ${alpha(C.ocean, 0.25 + 0.75 * on)}` }}>
      <Icon name={icon} size={size * 0.5} />
    </div>
  );
}

/** A neutral Arc chip (badge on the surface). */
export function Chip({ children, tone = "neutral", size = 22 }: { children: ReactNode; tone?: "neutral" | "accent"; size?: number }) {
  const accent = tone === "accent";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, height: size * 1.9, padding: `0 ${size * 0.75}px`, borderRadius: R.pill, border: `1.5px solid ${accent ? alpha(C.ocean, 0.25) : C.border}`, background: accent ? alpha(C.ocean, 0.1) : C.surfaceMuted, color: accent ? C.ocean : C.fg, fontSize: size, fontWeight: 600, whiteSpace: "nowrap", flex: "none", fontVariantNumeric: "tabular-nums" }}>
      {children}
    </span>
  );
}
