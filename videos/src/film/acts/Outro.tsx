import { Img, staticFile } from "remotion";

import { Punchlines, type Card as PunchCard } from "../../kit/punchlines";
import { C, FONT, R, SHADOW, alpha } from "../../tokens";
import { Badge, Icon } from "../../ui/arc";
import { ease, inOut, kick, pop, rise } from "../anim";
import { b, BEAT, DURATION } from "../cues";
import { Handheld } from "../Handheld";
import { Mascot, POSES } from "../mascot";

/* Impact (bars 19–20) */
function Side({ t, x, at, kicker, icon, lines, chips, pose, phase }: { t: number; x: number; at: number; kicker: string; icon: string; lines: string[]; chips: string[]; pose: "happy" | "code"; phase: number }) {
  const p = pop(t, at - 0.15);
  const out = rise(t, -10, b(21, 1) - 0.12);
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: 270,
        width: 760,
        height: 540,
        padding: "44px 48px",
        borderRadius: R.surface,
        border: `1.5px solid ${C.border}`,
        background: C.surface,
        boxShadow: SHADOW.floating,
        display: "grid",
        alignContent: "start",
        gap: 18,
        opacity: Math.min(1, p * 1.5) * (out.opacity as number),
        filter: out.filter,
        translate: `0 ${(1 - p) * 120}px`,
        rotate: `${(1 - p) * (phase ? 3 : -3)}deg`,
      }}
    >
      <Mascot t={t} poses={[[0, pose]]} x={640} y={40} size={190} phase={phase} rot={Math.sin(t * 0.6 + phase) * 3} />
      <span style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 28, color: C.text3, fontWeight: 500 }}>
        <Icon name={icon} size={30} color={C.ocean} /> {kicker}
      </span>
      <div style={{ display: "grid", gap: 4, marginTop: 8 }}>
        {lines.map((line, i) => {
          const r = rise(t, at + i * BEAT, Infinity, 32, 14);
          return (
            <span key={line} style={{ fontSize: 62, fontWeight: 600, letterSpacing: "-0.03em", lineHeight: 1.08, opacity: r.opacity, translate: r.translate, filter: r.filter, color: i === 0 ? C.fg : C.ocean }}>
              {line}
            </span>
          );
        })}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 26 }}>
        {chips.map((chip, i) => {
          const r = rise(t, b(20, 1, i * 0.75 + phase * 0.35), Infinity, 18, 8);
          return (
            <span key={chip} style={{ opacity: r.opacity, translate: r.translate, filter: r.filter }}>
              <Badge status="info" icon="check" label={chip} s={1.15} />
            </span>
          );
        })}
      </div>
    </div>
  );
}

function Impact({ t }: { t: number }) {
  if (t < b(19, 1) - 0.3 || t > b(21, 1) + 0.2) return null;
  return (
    <Handheld t={t} start={b(19, 1)} end={b(21, 1)} zoomFrom={0.98} zoomTo={1.05}>
      <Side t={t} x={170} at={b(19, 1, 0.5)} kicker="For passengers" icon="users" lines={["Less stress.", "A clear path."]} chips={["Clear route", "Own language", "No app needed"]} pose="happy" phase={0} />
      <Side t={t} x={990} at={b(19, 3)} kicker="For airlines" icon="plane" lines={["Fewer misses.", "Lower rebooking costs."]} chips={["Fewer rebookings", "Faster decisions", "Fewer knock-on delays"]} pose="code" phase={1} />
    </Handheld>
  );
}

/* Tagline (bars 21–23): the product's own line. */
function Tagline({ t }: { t: number }) {
  if (t < b(21, 1) - 0.1 || t > b(24, 1) + 0.2) return null;
  const out = b(24, 1) - 0.14;
  const line1: PunchCard[] = [{ lines: [[{ text: "Flight", at: b(21, 1) }, { text: "trackers", at: b(21, 2) }, { text: "watch", at: b(21, 3) }, { text: "planes.", at: b(21, 4) }]], out, y: 430, size: 104 }];
  const logo = <Img src={staticFile("segue-logo.svg")} style={{ width: "100%", height: "100%", borderRadius: "0.22em" }} />;
  const line2: PunchCard[] = [{ lines: [[{ text: "Segue", at: b(22, 1), logo }, { text: "watches", at: b(22, 2) }, { text: "your", at: b(22, 3), accent: true }, { text: "connection.", at: b(22, 4), accent: true }]], out, y: 600, size: 104 }];
  return (
    <Handheld t={t} start={b(21, 1)} end={b(24, 1)} zoomFrom={1} zoomTo={1.08} >
      <Punchlines t={t} cards={line1} theme={{ font: FONT, color: C.text2, accent: C.ocean, weight: 600 }} />
      <Punchlines t={t} cards={line2} theme={{ font: FONT, color: C.fg, accent: C.ocean, weight: 600 }} />
      <div style={{ position: "absolute", inset: 0, opacity: ease(t, b(21, 1), 0.4) * (1 - ease(t, out, 0.2)) }}>
        <Mascot t={t} poses={[[0, "calm"], [b(22, 4), "wink"]]} x={1660} y={210} size={190} rot={Math.sin(t * 0.5) * 3} live={0.6} />
        <Mascot t={t} poses={[[0, "sleepy"], [b(22, 1), "happy"]]} x={250} y={860} size={160} rot={Math.sin(t * 0.5 + 2) * 3} live={0.6} phase={3} />
      </div>
    </Handheld>
  );
}

/* CTA (bars 24–30): logo-gradient flood, the logo takes off, the line, the URL, the whole cloud crew. */
const RING: [number, number, number][] = [
  [170, 200, 170], [450, 130, 150], [760, 120, 140], [1160, 120, 140], [1470, 130, 150], [1750, 200, 170],
  [120, 560, 180], [1800, 560, 180], [150, 1040, 175], [520, 1060, 150], [1400, 1060, 150], [1770, 1040, 175],
];


const CHIPS = ["Connection score", "Priority deplaning", "Living MCT", "Live route", "Ops holds", "Bag tracking", "Transfer pass", "Pre-rebooking", "Gate-change alerts", "Wallet pass"];

/** Arc logo-marquee: a quiet, continuously moving row, here of what Segue does. */
function Marquee({ t }: { t: number }) {
  const r = rise(t, b(26, 3), Infinity, 20, 10);
  if (!r.visible) return null;
  // It travels ~1100 px before the film ends, so one row never runs out (no wrap needed).
  const offset = (t - b(26, 3)) * 140;
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top: 892, height: 60, opacity: r.opacity, filter: r.filter, overflow: "visible", maskImage: "linear-gradient(90deg, transparent, #000 15%, #000 85%, transparent)" }}>
      <div style={{ position: "absolute", top: 0, left: 120 - offset, display: "flex", gap: 18 }}>
        {[...CHIPS, ...CHIPS].map((chip, i) => (
          <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 10, height: 54, padding: "0 22px", borderRadius: R.pill, background: alpha("#FFFFFF", 0.9), border: `1.5px solid ${alpha("#FFFFFF", 0.6)}`, color: C.deep, fontSize: 24, fontWeight: 600, whiteSpace: "nowrap", flex: "none" }}>
            <Icon name="check" size={20} stroke={2.6} color={C.ocean} /> {chip}
          </span>
        ))}
      </div>
    </div>
  );
}

function Cta({ t }: { t: number }) {
  const start = b(24, 1);
  if (t < start - 0.05) return null;
  const flood = ease(t, start - 0.04, 0.5, inOut) * 2300;
  const mark = pop(t, start + 0.05, { stiffness: 170, damping: 18 });
  const word = ease(t, b(24, 2), 0.8, inOut);
  const url = pop(t, b(25, 3));
  const finalHop = (i: number) => {
    const d = t - (b(28, 1) + i * 0.05);
    return d > 0 && d < 0.9 ? Math.sin((Math.PI * d) / 0.9) * 40 : 0;
  };
  return (
    <div style={{ position: "absolute", inset: 0, fontFamily: FONT }}>
      <div style={{ position: "absolute", left: 960 - flood, top: 540 - flood, width: flood * 2, height: flood * 2, borderRadius: "50%", overflow: "hidden" }}>
        <div style={{ position: "absolute", left: flood - 960, top: flood - 540, width: 1920, height: 1080, background: `linear-gradient(39deg, ${C.gradFrom} 0%, ${C.gradTo} 46%, ${C.gradTo} 100%)` }} />
      </div>
      <Handheld t={t} start={start} end={DURATION} zoomFrom={1.02} zoomTo={1.08} >
        <div style={{ position: "absolute", left: 410, top: 268, width: 1100, height: 294, }}>
          <Img src={staticFile("segue-mark.svg")} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: Math.min(1, mark * 1.5), translate: `${(1 - mark) * -420}px ${(1 - mark) * 180}px`, rotate: `${(1 - mark) * -24}deg`, transformOrigin: "20% 50%" }} />
          <Img src={staticFile("segue-word.svg")} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", clipPath: `inset(-10% ${(1 - word) * 100}% -10% 0)` }} />
        </div>
        {[
          { text: "Flight trackers watch planes. Segue watches your connection.", r: rise(t, b(25, 1), b(27, 3), 26, 12) },
          { text: "Waze for airport connections.", r: rise(t, b(27, 3, 0.3), Infinity, 26, 12) },
        ].map(({ text, r }) =>
          r.visible ? (
            <div key={text} style={{ position: "absolute", left: 0, right: 0, top: 640, textAlign: "center", fontSize: 44, fontWeight: 500, letterSpacing: "-0.015em", color: C.deep, opacity: r.opacity, translate: r.translate, filter: r.filter }}>
              {text}
            </div>
          ) : null,
        )}
        <Marquee t={t} />
        <div style={{ position: "absolute", left: 0, right: 0, top: 760, display: "flex", justifyContent: "center" }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 18,
              height: 108,
              padding: "0 52px",
              borderRadius: R.control * 2.2,
              background: C.deep,
              color: C.mist,
              fontSize: 50,
              fontWeight: 600,
              letterSpacing: "-0.02em",
              boxShadow: `0 20px 48px ${alpha(C.deep, 0.25)}`,
              scale: String(url),
              opacity: Math.min(1, url * 1.5),
            }}
          >
            segue.app
            <Icon name="arrow" size={44} stroke={2.6} />
          </div>
        </div>
        {RING.map(([x, y, s], i) => {
          const at = b(25, 1) + i * (BEAT / 2);
          const p = pop(t, at);
          if (p <= 0) return null;
          return <Mascot key={i} t={t} poses={[[0, POSES[i]]]} x={x} y={y - finalHop(i) + (1 - Math.min(1, p)) * 80} size={s * p} rot={Math.sin(t * 0.5 + i) * 3} phase={i * 0.37} />;
        })}
      </Handheld>
    </div>
  );
}

export function Outro({ t }: { t: number }) {
  if (t < b(19, 1) - 0.4) return null;
  return (
    <div style={{ position: "absolute", inset: 0, fontFamily: FONT, color: C.fg }}>
      <div style={{ position: "absolute", inset: 0, background: C.mist }} />
      <Impact t={t} />
      <Tagline t={t} />
      <Cta t={t} />
    </div>
  );
}
