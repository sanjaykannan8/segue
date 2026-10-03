import type { CSSProperties, ReactNode } from "react";
import { Img, staticFile } from "remotion";

import { Punchlines, type Card as PunchCard } from "../../kit/punchlines";
import { C, FONT, R, SHADOW, STATUS, mix } from "../../tokens";
import { Card, Icon, StatusBadge } from "../../ui/arc";
import { ease, inOut, pop, rise, swap, tween } from "../anim";
import { b } from "../cues";
import { Handheld } from "../Handheld";
import { Mascot, leapAt } from "../mascot";

/*
 * Hook (0–4.5 s) and Meet (story bar 3), on the film's own light palette.
 * The pain point reads as three plain statements, one visual each:
 *   0.0  Priya lands 25 min late.          (EK 512: Landed +25)
 *   1.5  Her next flight closes in 50 min. (BA 108 + a countdown that runs out)
 *   3.0  She misses her connection.        (Gate closed)
 */
const S2 = 1.5;
const S3 = 3.0;
const MEET = b(3, 1); // 4.5 s
const EXIT = b(4, 1); // 6.0 s

const LINES: { at: number; out: number; content: ReactNode }[] = [
  { at: -0.3, out: S2 - 0.2, content: <>Priya lands <span style={{ color: STATUS.tight.ink }}>25 min late.</span></> },
  { at: S2, out: S3 - 0.2, content: <>Her next flight closes in <span style={{ color: C.ocean }}>50 min.</span></> },
  { at: S3, out: MEET - 0.25, content: <>She misses her <span style={{ color: STATUS.lost.ink }}>connection.</span></> },
];

function Headline({ t }: { t: number }) {
  return (
    <>
      {LINES.map((line, i) => {
        const r = rise(t, line.at, line.out, 30, 14);
        if (!r.visible) return null;
        return (
          <div key={i} style={{ position: "absolute", left: 0, right: 0, top: 150, textAlign: "center", fontSize: 84, fontWeight: 600, letterSpacing: "-0.035em", color: C.fg, opacity: r.opacity, translate: r.translate, filter: r.filter, whiteSpace: "nowrap" }}>
            {line.content}
          </div>
        );
      })}
    </>
  );
}

function FlightRow({ flight, route, badge, style }: { flight: string; route: string; badge: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 24, padding: "24px 36px", borderTop: `1.5px solid ${C.border}`, ...style }}>
      <div style={{ width: 60, height: 60, borderRadius: R.pill, display: "grid", placeItems: "center", background: C.surfaceMuted, border: `1.5px solid ${C.border}`, color: C.text2, flex: "none" }}>
        <Icon name="plane" size={30} />
      </div>
      <div style={{ display: "grid", gap: 2, flex: 1 }}>
        <span style={{ fontSize: 38, fontWeight: 600 }}>{flight}</span>
        <span style={{ fontSize: 25, color: C.text2 }}>{route}</span>
      </div>
      {badge}
    </div>
  );
}

function Board({ t }: { t: number }) {
  const card = rise(t, -0.3, MEET - 0.25, 40, 14);
  if (!card.visible) return null;
  const row1 = swap(t, [[0, "info"], [0.55, "tight"]] as const, 0.35);
  const row2 = swap(t, [[0, "safe"], [S3, "lost"]] as const, 0.35);
  const r2 = rise(t, S2, Infinity, 24, 10);
  const timer = rise(t, S2 + 0.15, Infinity, 24, 10);
  const minutes = Math.round(tween(t, [[0, 50], [S2 + 0.45, 0]], S3 - (S2 + 0.45), inOut));
  const late = ease(t, S2 + 0.6, S3 - (S2 + 0.6), (x) => x);
  const numColor = mix(STATUS.lost.ink, C.fg, ease(t, S3 - 0.25, 0.4));
  return (
    <div style={{ position: "absolute", left: 460, top: 330, width: 1000, opacity: card.opacity, translate: card.translate, filter: card.filter }}>
      <Card shadow="floating" style={{ width: 1000 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "24px 36px" }}>
          <span style={{ fontSize: 25, color: C.text2, fontWeight: 500 }}>Dubai DXB · Transfers</span>
          <span style={{ fontSize: 25, color: C.text3, fontVariantNumeric: "tabular-nums" }}>14:05</span>
        </div>
        <FlightRow flight="EK 512" route="Delhi → Dubai" badge={<StatusBadge from={row1.previous} to={row1.current} u={row1.u} width={240} s={1.05} labels={{ info: "Landing", tight: "Landed +25" }} />} />
        <FlightRow
          flight="BA 108"
          route="Dubai → London · Gate B14"
          style={{ opacity: r2.opacity, translate: r2.translate, filter: r2.filter }}
          badge={<StatusBadge from={row2.previous} to={row2.current} u={row2.u} width={240} s={1.05} labels={{ safe: "Boarding", lost: "Gate closed" }} />}
        />
        <div style={{ display: "grid", gap: 16, padding: "22px 36px 32px", borderTop: `1.5px solid ${C.border}`, opacity: timer.opacity, filter: timer.filter }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
            <span style={{ fontSize: 27, color: C.text2, fontWeight: 500 }}>Time to make the connection</span>
            <span style={{ display: "flex", alignItems: "baseline", gap: 10, color: numColor }}>
              <span style={{ fontSize: 76, fontWeight: 600, letterSpacing: "-0.03em", lineHeight: 1, fontVariantNumeric: "tabular-nums", minWidth: 90, textAlign: "right" }}>{minutes}</span>
              <span style={{ fontSize: 30, color: C.text2 }}>min</span>
            </span>
          </div>
          <div style={{ height: 14, borderRadius: R.pill, background: C.border, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${(minutes / 50) * 100}%`, borderRadius: R.pill, background: mix(STATUS.lost.color, STATUS.tight.color, late) }} />
          </div>
        </div>
      </Card>
    </div>
  );
}

export function Intro({ t }: { t: number }) {
  if (t > EXIT + 0.7) return null;
  // Leaving: a soft pull-through into the world, eased, no snap.
  const out = ease(t, EXIT - 0.2, 0.7, inOut);
  const m = leapAt(t, [
    [0, 1690, 1250, 230],
    [S3 - 0.1, 1690, 640, 230],
    [MEET + 0.1, 1105, 300, 170],
  ], 140);
  const tile = pop(t, MEET + 0.1);
  const meetPunch: PunchCard[] = [
    { lines: [[{ text: "Meet", at: b(3, 2) }, { text: "Segue.", at: b(3, 3), accent: true }]], out: EXIT + 2, y: 740, size: 150 },
  ];
  return (
    <div style={{ position: "absolute", inset: 0, opacity: 1 - out, filter: out > 0 ? `blur(${out * 12}px)` : undefined, scale: String(1 + out * 0.5), transformOrigin: "960px 440px", fontFamily: FONT, color: C.fg }}>
      <div style={{ position: "absolute", inset: 0, background: C.mist }} />
      <Handheld t={t} start={0} end={MEET} zoomFrom={1.0} zoomTo={1.04}>
        <Headline t={t} />
        <Board t={t} />
      </Handheld>
      {t >= MEET - 0.1 ? (
        <Handheld t={t} start={MEET} end={EXIT} zoomFrom={1} zoomTo={1.03}>
          <div style={{ position: "absolute", left: 960 - 130, top: 420 - 130, width: 260, height: 260, scale: String(0.85 + 0.15 * tile), opacity: Math.min(1, tile * 1.3), borderRadius: 58, overflow: "hidden", boxShadow: SHADOW.floating }}>
            <Img src={staticFile("segue-logo.svg")} style={{ width: "100%", height: "100%" }} />
          </div>
          <Punchlines t={t} cards={meetPunch} theme={{ font: FONT, color: C.fg, accent: C.ocean, weight: 600 }} />
        </Handheld>
      ) : null}
      <Mascot t={t} x={m.x} y={m.y} size={m.size} rot={t < MEET ? -6 : -4} poses={[[0, "dizzy_tilt"], [S3 + 0.3, "dizzy"], [MEET + 0.1, "happy"], [b(3, 3), "wink"]]} />
    </div>
  );
}
