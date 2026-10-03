import { AbsoluteFill, Audio, Img, staticFile } from "remotion";

import { Punchlines, type Card as PunchCard } from "../kit/punchlines";
import { useTime } from "../kit/time";
import { C, FONT, R, alpha } from "../tokens";
import { Icon } from "../ui/arc";
import { ease, inOut, pop, rise } from "../film/anim";
import type { FilmProps } from "../film/Film";
import { Handheld } from "../film/Handheld";
import { Mascot, type Pose } from "../film/mascot";
import { DURATION, T, tb } from "./cues";
import { Decide } from "./Decide";
import { Pipeline } from "./Pipeline";
import { Scale } from "./Scale";

/* Recap (34.5–39 s): three short lines, one per bar. */
function Recap({ t }: { t: number }) {
  if (t < T.recap - 0.1 || t > T.end + 0.3) return null;
  const out = T.end - 0.2;
  const line = (words: [string, string], bar: number, y: number): PunchCard => ({
    lines: [[{ text: words[0], at: tb(bar, 1) }, { text: words[1], at: tb(bar, 2), accent: true }]],
    out,
    y,
    size: 124,
  });
  const cards = [line(["Scored", "once."], 24, 360), line(["Decided", "live."], 25, 520), line(["Delivered to", "everyone."], 26, 680)];
  return (
    <Handheld t={t} start={T.recap} end={T.end} zoomFrom={1} zoomTo={1.04}>
      <Punchlines t={t} cards={cards} theme={{ font: FONT, color: C.fg, accent: C.ocean, weight: 600 }} />
    </Handheld>
  );
}

/* Ending (39–45 s): the logo gradient, the line, the URL, a few calm mascots. */
const CREW: [number, number, number, Pose][] = [
  [200, 210, 170, "happy"], [1720, 210, 170, "code"], [150, 620, 160, "calm"], [1770, 620, 160, "wink"], [330, 960, 160, "mail"], [1590, 960, 160, "look_left"],
];

function End({ t }: { t: number }) {
  if (t < T.end - 0.05) return null;
  const flood = ease(t, T.end - 0.04, 0.7, inOut) * 2300;
  const mark = pop(t, T.end + 0.15, { stiffness: 120, damping: 20 });
  const word = ease(t, T.end + 0.5, 0.9, inOut);
  const line = rise(t, tb(28, 1), Infinity, 26, 12);
  const url = pop(t, tb(28, 3));
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <div style={{ position: "absolute", left: 960 - flood, top: 540 - flood, width: flood * 2, height: flood * 2, borderRadius: "50%", overflow: "hidden" }}>
        <div style={{ position: "absolute", left: flood - 960, top: flood - 540, width: 1920, height: 1080, background: `linear-gradient(39deg, ${C.gradFrom} 0%, ${C.gradTo} 46%, ${C.gradTo} 100%)` }} />
      </div>
      <Handheld t={t} start={T.end} end={DURATION} zoomFrom={1.0} zoomTo={1.04}>
        <div style={{ position: "absolute", left: 410, top: 290, width: 1100, height: 294 }}>
          <Img src={staticFile("segue-mark.svg")} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: Math.min(1, mark * 1.5), translate: `${(1 - mark) * -260}px ${(1 - mark) * 110}px`, rotate: `${(1 - mark) * -14}deg`, transformOrigin: "20% 50%" }} />
          <Img src={staticFile("segue-word.svg")} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", clipPath: `inset(-10% ${(1 - word) * 100}% -10% 0)` }} />
        </div>
        <div style={{ position: "absolute", left: 0, right: 0, top: 660, textAlign: "center", fontSize: 44, fontWeight: 500, letterSpacing: "-0.015em", color: C.deep, opacity: line.opacity, translate: line.translate, filter: line.filter }}>
          Flight trackers watch planes. Segue watches your connection.
        </div>
        <div style={{ position: "absolute", left: 0, right: 0, top: 790, display: "flex", justifyContent: "center" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 18, height: 108, padding: "0 52px", borderRadius: R.control * 2.2, background: C.deep, color: C.mist, fontSize: 50, fontWeight: 600, letterSpacing: "-0.02em", boxShadow: `0 20px 48px ${alpha(C.deep, 0.25)}`, scale: String(0.9 + 0.1 * url), opacity: Math.min(1, url * 1.5) }}>
            segue.app
            <Icon name="arrow" size={44} stroke={2.6} />
          </div>
        </div>
        {CREW.map(([x, y, s, pose], i) => {
          const p = pop(t, tb(28, 1) + i * 0.25);
          if (p <= 0) return null;
          return <Mascot key={i} t={t} poses={[[0, pose]]} x={x} y={y + (1 - Math.min(1, p)) * 60} size={s} rot={Math.sin(t * 0.5 + i) * 3} phase={i * 0.5} style={{ opacity: Math.min(1, p * 1.5) }} />;
        })}
      </Handheld>
    </div>
  );
}

export function Tech({ audio }: FilmProps) {
  const t = useTime();
  return (
    <AbsoluteFill style={{ background: C.mist, fontFamily: FONT, color: C.fg, overflow: "hidden" }}>
      <Scale t={t} />
      <Decide t={t} />
      <Pipeline t={t} />
      <Recap t={t} />
      <End t={t} />
      {audio ? <Audio src={staticFile("audio/segue-tech-mix.wav")} /> : null}
    </AbsoluteFill>
  );
}
