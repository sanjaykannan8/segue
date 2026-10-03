import type { ReactNode } from "react";

import { camera, type CameraKey } from "../../kit/camera";
import { cursorAt, UserCursor, type CursorKey } from "../../kit/cursor";
import type { SpringConfig } from "../../kit/spring";
import { C, FONT, R, alpha } from "../../tokens";
import { ease, inOut, rise } from "../anim";
import { b } from "../cues";
import { leapAt, Mascot } from "../mascot";
import { Bags } from "./world/Bags";
import { Crew } from "./world/Crew";
import { Features } from "./world/Features";
import { BAGS, CREW, OPS } from "./world/layout";
import { Ops } from "./world/Ops";
import { Phone } from "./world/Phone";

const START = b(4, 1);
const END = b(19, 1);

/** A soft, well-damped camera: glides between scenes and settles without overshoot. */
const camSpring: SpringConfig = { stiffness: 95, damping: 21, mass: 1 };

/** The feature strip: one continuous, eased dolly instead of spring steps. */
const DOLLY_FROM = b(17, 1) - 0.5;
const DOLLY_TO = b(19, 1) - 0.1;
const DOLLY: CameraKey[] = [[b(17, 1) - 0.6, -500, 3100, 1.0]];

const CAM: CameraKey[] = [
  [0, -260, 0, 0.45],
  [START - 0.25, -260, 0, 1.0],
  [b(5, 2) - 0.1, -300, 30, 1.08],
  [b(6, 1) - 0.1, -330, -40, 1.12],
  [b(7, 3) - 0.2, -140, 1450, 0.95],
  [b(9, 1) - 0.45, -260, 0, 1.0],
  [b(10, 1) - 0.1, -300, 110, 1.12],
  [b(11, 1) - 0.6, OPS.x, 45, 0.97],
  [b(12, 1) - 0.15, 2640, 260, 1.3],
  [b(12, 3, 0.4), OPS.x, 45, 0.97],
  [b(13, 1) - 0.5, 2300, 1400, 0.97],
  [b(14, 1), 2300, 1430, 1.03],
  [b(15, 1) - 0.35, 1000, 800, 0.4],
  [b(15, 3) - 0.3, -260, 0, 1.0],
  [b(16, 2), -240, 10, 1.05],
  ...DOLLY,
  [END - 0.12, -500, 3100, 0.8],
];

type Caption = { n?: string; title: string; sub?: string; x: number; y: number; at: number; out: number; size?: number; width?: number };
const CAPTIONS: Caption[] = [
  { n: "01", title: "Scan the boarding pass.", sub: "Segue builds the connection.", x: -1080, y: -230, at: START + 0.25, out: b(6, 1) - 0.15 },
  { n: "02", title: "Spot the risk early.", sub: "Live flight data meets learned connection times.", x: -1080, y: -230, at: b(6, 1), out: b(7, 3) },
  { n: "03", title: "Crew calls her off first.", sub: "A priority list, before the doors open.", x: CREW.x - CREW.w / 2 + 10, y: 985, at: b(7, 4) + 0.1, out: b(9, 1) - 0.25, width: 1200 },
  { n: "04", title: "Guide her to the gate.", sub: "WhatsApp, SMS or web. Works offline.", x: -1080, y: -230, at: b(9, 1), out: b(11, 1) - 0.35 },
  { n: "05", title: "Ops holds the flight 8 minutes.", sub: "One approval saves 14 connections.", x: OPS.x - OPS.w / 2 + 6, y: -478, at: b(11, 1) - 0.1, out: b(13, 1) - 0.35, size: 58, width: 1400 },
  { n: "06", title: "Bags and borders, handled ahead.", sub: "Hot-transfer tag. Fast-track lane requested.", x: BAGS.left + 6, y: 925, at: b(13, 1) - 0.15, out: b(15, 1) - 0.1, size: 58, width: 1400 },
  { title: "Priya made it.", sub: "So did her bag.", x: -1080, y: -150, at: b(15, 4), out: b(17, 1) - 0.25, size: 104 },
];

function CaptionView({ t, c }: { t: number; c: Caption }) {
  if (t < c.at - 0.05 || t > c.out + 0.3) return null;
  const words = c.title.split(" ");
  const size = c.size ?? 74;
  const chip = rise(t, c.at, c.out, 20, 10);
  const sub = rise(t, c.at + 0.12 + words.length * 0.07, c.out, 20, 10);
  return (
    <div style={{ position: "absolute", left: c.x, top: c.y, width: c.width ?? 780, display: "grid", gap: 18, justifyItems: "start" }}>
      {c.n ? (
        <span style={{ display: "inline-flex", alignItems: "center", height: 48, padding: "0 20px", borderRadius: R.pill, border: `1.5px solid ${alpha(C.ocean, 0.25)}`, background: alpha(C.ocean, 0.1), color: C.ocean, fontSize: 24, fontWeight: 600, fontVariantNumeric: "tabular-nums", opacity: chip.opacity, translate: chip.translate, filter: chip.filter }}>{c.n}</span>
      ) : null}
      <div style={{ display: "flex", flexWrap: "wrap", columnGap: "0.25em", fontSize: size, fontWeight: 600, letterSpacing: "-0.03em", lineHeight: 1.04, color: C.fg }}>
        {words.map((w, i) => {
          const r = rise(t, c.at + 0.05 + i * 0.07, c.out, 30, 14);
          return (
            <span key={i} style={{ display: "inline-block", opacity: r.opacity, translate: r.translate, filter: r.filter }}>
              {w}
            </span>
          );
        })}
      </div>
      {c.sub ? <span style={{ fontSize: size > 90 ? 64 : 30, fontWeight: size > 90 ? 600 : 500, letterSpacing: size > 90 ? "-0.03em" : "-0.01em", color: size > 90 ? C.ocean : C.text2, opacity: sub.opacity, translate: sub.translate, filter: sub.filter }}>{c.sub}</span> : null}
    </div>
  );
}

/** Flight paths between the scenes: dotted, always marching. */
function Routes({ t }: { t: number }) {
  const paths = [
    "M 330 -560 C 900 -980 1500 -820 1560 -560",
    "M -380 520 C -700 760 -760 900 -700 1020",
    "M 3080 520 C 3250 700 3200 860 3060 960",
    "M 1500 1900 C 900 2500 100 2500 -900 2720",
    "M -1250 -380 C -1500 -700 -900 -900 -400 -720",
  ];
  return (
    <svg width={8000} height={6000} viewBox="-3000 -2000 8000 6000" style={{ position: "absolute", left: -3000, top: -2000, overflow: "visible" }}>
      {paths.map((d, i) => (
        <path key={i} d={d} fill="none" stroke={alpha(C.ocean, 0.28)} strokeWidth={5} strokeLinecap="round" strokeDasharray="1 22" strokeDashoffset={-t * 40 - i * 9} />
      ))}
    </svg>
  );
}

/** Soft cloud wash in screen space with parallax against the camera: depth while the camera moves. */
function Sky({ t, cx, cy }: { t: number; cx: number; cy: number }) {
  const blobs = [
    [200, 150, 520], [900, 900, 680], [1700, 300, 600], [2300, 1200, 520], [500, 1400, 640], [1300, 1600, 560], [2500, 500, 700], [60, 800, 480],
  ];
  const W = 2800;
  const H = 1900;
  const mod = (v: number, m: number) => ((v % m) + m) % m;
  return (
    <>
      {blobs.map(([bx, by, s], i) => {
        const x = mod(bx - cx * 0.32 + t * 26, W) - 440;
        const y = mod(by - cy * 0.32 + Math.sin(t * 0.5 + i) * 20, H) - 420;
        return <div key={i} style={{ position: "absolute", left: x - s / 2, top: y - s / 2, width: s, height: s * 0.62, borderRadius: "50%", background: "radial-gradient(closest-side, rgba(255,255,255,.85), rgba(255,255,255,0))" }} />;
      })}
    </>
  );
}

function rotate(x: number, y: number, deg: number) {
  const a = (deg * Math.PI) / 180;
  return { x: x * Math.cos(a) - y * Math.sin(a), y: x * Math.sin(a) + y * Math.cos(a) };
}

export function World({ t, debug }: { t: number; debug?: boolean }) {
  if (t < START - 0.12 || t > END + 0.45) return null;
  const view = camera(t, CAM, camSpring);
  const dolly = ease(t, DOLLY_FROM, DOLLY_TO - DOLLY_FROM, inOut);
  const zoom = view.zoom;
  const x = view.x + dolly * 4350;
  const y = view.y;
  const roll = 0;
  const toScreen = (px: number, py: number) => {
    const r = rotate((px - x) * zoom, (py - y) * zoom, roll);
    return { x: 960 + r.x, y: 540 + r.y };
  };
  const enter = ease(t, START - 0.12, 0.3);
  const leave = ease(t, END - 0.1, 0.35);
  const fade = enter * (1 - leave);

  const guide = leapAt(t, [
    [START - 0.06, 345, -330, 160],
    [b(7, 3) + 0.1, 560, 1215, 180],
    [b(9, 1) - 0.1, 345, -330, 160],
    [b(11, 1) - 0.35, 3120, -400, 170],
    [b(13, 1) - 0.25, 3110, 1120, 170],
    [b(15, 3) - 0.12, 350, -340, 190],
    [b(17, 1) - 0.2, -420, 2830, 170],
  ], 240);

  const cursorKeys: CursorKey[] = [
    { t: b(11, 3), x: 3420, y: 700, world: true },
    { t: b(12, 2), x: 2958, y: 378, world: true, click: true },
    { t: b(12, 4), x: 2540, y: 470, world: true },
  ];
  const cur = cursorAt(t, cursorKeys, toScreen);
  const cursorOn = t > b(11, 3) - 0.3 && t < b(13, 1) - 0.35;

  const layer = (children: ReactNode) => (
    <div style={{ position: "absolute", left: 0, top: 0, transformOrigin: "0 0", transform: `translate(960px, 540px) rotate(${roll}deg) scale(${zoom}) translate(${-x}px, ${-y}px)` }}>{children}</div>
  );

  return (
    <div style={{ position: "absolute", inset: 0, opacity: fade, filter: fade < 1 ? `blur(${(1 - fade) * 16}px)` : undefined, fontFamily: FONT, color: C.fg, overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, background: C.mist }} />
      <Sky t={t} cx={x} cy={y} />
      {layer(
        <>
          <Routes t={t} />
          {CAPTIONS.map((c, i) => (
            <CaptionView key={i} t={t} c={c} />
          ))}
          <Phone t={t} />
          <Crew t={t} />
          <Ops t={t} />
          <Bags t={t} />
          <Features t={t} camX={x} />
          <Mascot
            t={t}
            x={guide.x}
            y={guide.y}
            size={guide.size}
            rot={Math.sin(t * 0.6) * 3}
            poses={[
              [0, "calm"],
              [b(6, 4), "alert"],
              [b(7, 3) + 0.1, "look_left"],
              [b(9, 1), "mail"],
              [b(11, 1) - 0.35, "code"],
              [b(13, 1) - 0.25, "look_left"],
              [b(14, 2), "happy"],
              [b(17, 1) - 0.2, "wink"],
            ]}
          />
        </>,
      )}
      {cursorOn ? <UserCursor x={cur.x} y={cur.y} squash={cur.squash * 1.25} /> : null}
      {debug ? <div style={{ position: "absolute", right: 12, bottom: 12, padding: 10, background: "#000", color: "#0f0", fontSize: 24, fontFamily: "monospace" }}>{`cam ${x.toFixed(0)},${y.toFixed(0)} z${zoom.toFixed(2)}`}</div> : null}
    </div>
  );
}
