import { Img } from "remotion";

import { C, FONT, R, SHADOW, alpha, mix } from "../tokens";
import { Icon } from "../ui/arc";
import { ease, inOut, rise } from "../film/anim";
import { mascotSrc } from "../film/mascot";
import { T } from "./cues";
import { Chip, Disc, Headline, type Line } from "./shared";

/* Act 6 (24–34.5 s): one packet travels the pipeline, then fans out to five audiences. One smooth dolly. */

const LINES: Line[] = [
  { at: T.pipe, out: T.fan - 0.25, title: <>Events in. <span style={{ color: C.ocean }}>Decisions out.</span></> },
  { at: T.fan, out: T.recap - 0.3, title: <>One decision. <span style={{ color: C.ocean }}>Five audiences.</span></> },
];

const NODES: { title: string; sub: string; icon?: string }[] = [
  { title: "Passenger app", sub: "Itinerary scan", icon: "scan" },
  { title: "Redpanda", sub: "Flight events, in order", icon: "zap" },
  { title: "Connection engine", sub: "One score per connection", icon: "plane" },
  { title: "clef-flash", sub: "Risk and decisions" },
  { title: "Outbox", sub: "Saved and sent together", icon: "check" },
  { title: "RabbitMQ", sub: "One queue per audience", icon: "users" },
];
const STEP = 520;
const NW = 400;
const NH = 190;
/** When the packet reaches each node. */
const ARRIVE = [T.pipe + 0.6, T.pipe + 1.6, T.pipe + 2.6, T.pipe + 3.8, T.pipe + 4.9, T.fan];

const AUDIENCE: { title: string; line: string; icon: string; y: number; assist?: boolean }[] = [
  { title: "Passenger", line: "Route and alert, in her language", icon: "pin", y: -340 },
  { title: "Ops controller", line: "Hold BA 108: approve?", icon: "chart", y: -170, assist: true },
  { title: "Cabin crew", line: "Call seat 12A first", icon: "door", y: 0, assist: true },
  { title: "Ground handler", line: "Buggy to gate C22", icon: "wheel", y: 170, assist: true },
  { title: "Authority", line: "Fast-track request", icon: "shield", y: 340 },
];
const AX = 3350;
const AW = 520;
const AH = 146;
const HUB = { x: 5 * STEP + NW / 2, y: 0 };

/** Which link the packet is on (k) and how far along it (u, eased). */
function packetAt(t: number) {
  if (t <= ARRIVE[0]) return { k: 0, u: 0 };
  for (let k = 0; k < ARRIVE.length - 1; k++) {
    if (t < ARRIVE[k + 1]) return { k, u: inOut((t - ARRIVE[k]) / (ARRIVE[k + 1] - ARRIVE[k])) };
  }
  return { k: ARRIVE.length - 1, u: 0 };
}

export function Pipeline({ t }: { t: number }) {
  if (t < T.pipe - 0.3 || t > T.recap + 0.4) return null;
  const show = rise(t, T.pipe - 0.1, T.recap - 0.3, 0, 14);
  const cam = ease(t, T.pipe + 1.0, T.fan + 0.6 - (T.pipe + 1.0), inOut);
  const cx = 520 + (2980 - 520) * cam;
  const cy = -70 - 10 * cam;
  const zoom = 1 - 0.15 * ease(t, T.fan - 1.6, 2.2, inOut);
  const pk = packetAt(t);
  const linkX = (k: number, u: number) => k * STEP + NW / 2 + (STEP - NW) * u;
  const assist = ease(t, T.fan + 2.0, 0.6);
  const note = rise(t, T.fan + 2.0, T.recap - 0.3, 20, 10);
  return (
    <div style={{ position: "absolute", inset: 0, opacity: show.opacity, filter: show.filter, fontFamily: FONT, color: C.fg }}>
      <div style={{ position: "absolute", left: 0, top: 0, transformOrigin: "0 0", transform: `translate(960px, 540px) scale(${zoom}) translate(${-cx}px, ${-cy}px)` }}>
        {/* Links */}
        <svg width={4400} height={1200} viewBox="-400 -600 4400 1200" style={{ position: "absolute", left: -400, top: -600, overflow: "visible" }}>
          {NODES.slice(0, -1).map((_, k) => {
            const x1 = k * STEP + NW / 2;
            const x2 = (k + 1) * STEP - NW / 2;
            const p = k < pk.k ? 1 : k === pk.k ? pk.u : 0;
            return (
              <g key={k}>
                <line x1={x1} x2={x2} y1={0} y2={0} stroke={C.borderStrong} strokeWidth={4} strokeLinecap="round" />
                <line x1={x1} x2={x1 + (x2 - x1) * p} y1={0} y2={0} stroke={C.ocean} strokeWidth={5} strokeLinecap="round" />
              </g>
            );
          })}
          <line x1={2 * STEP} x2={2 * STEP} y1={NH / 2} y2={190} stroke={mix(C.ocean, C.borderStrong, ease(t, ARRIVE[2] + 0.2, 0.5))} strokeWidth={4} strokeLinecap="round" />
          {AUDIENCE.map((a, i) => {
            const p = ease(t, T.fan + 0.2 + i * 0.12, 1.0, inOut);
            const x2 = AX - AW / 2;
            const d = `M ${HUB.x} 0 C ${HUB.x + 150} 0 ${x2 - 150} ${a.y} ${x2} ${a.y}`;
            const len = 420 + Math.abs(a.y) * 0.5;
            return (
              <g key={a.title}>
                <path d={d} fill="none" stroke={C.borderStrong} strokeWidth={4} strokeLinecap="round" opacity={ease(t, T.fan + i * 0.12, 0.6)} />
                <path d={d} fill="none" stroke={C.ocean} strokeWidth={5} strokeLinecap="round" strokeDasharray={`${len * p} ${len * 2}`} />
              </g>
            );
          })}
        </svg>
        {/* Nodes */}
        {NODES.map((n, k) => {
          const on = ease(t, ARRIVE[k] - 0.15, 0.5);
          return (
            <div key={n.title} style={{ position: "absolute", left: k * STEP - NW / 2, top: -NH / 2, width: NW, height: NH, borderRadius: R.surface, border: `1.5px solid ${mix(C.ocean, C.border, on * 0.6)}`, background: C.surface, boxShadow: on > 0.5 ? SHADOW.floating : SHADOW.raised, display: "flex", alignItems: "center", gap: 18, padding: "0 26px" }}>
              {n.icon ? <Disc icon={n.icon} size={70} on={on} /> : <Img src={mascotSrc("code")} style={{ width: 88, height: 88, margin: "0 -9px" }} />}
              <div style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 32, fontWeight: 600, letterSpacing: "-0.02em", whiteSpace: "nowrap" }}>{n.title}</span>
                <span style={{ fontSize: 22, color: C.text2, whiteSpace: "nowrap" }}>{n.sub}</span>
              </div>
            </div>
          );
        })}
        {/* Redis: the risk cache beside the engine */}
        <div style={{ position: "absolute", left: 2 * STEP - 170, top: 190, width: 340, height: 92, borderRadius: R.panel, border: `1.5px solid ${C.border}`, background: C.surface, boxShadow: SHADOW.raised, display: "flex", alignItems: "center", justifyContent: "center", gap: 12, fontSize: 25, fontWeight: 600 }}>
          <Icon name="refresh" size={26} color={C.ocean} /> Redis · risk cache
        </div>
        {/* Audiences */}
        {AUDIENCE.map((a, i) => {
          const r = rise(t, T.fan + 0.9 + i * 0.12, Infinity, 24, 10);
          const hot = a.assist ? assist : 0;
          return (
            <div key={a.title} style={{ position: "absolute", left: AX - AW / 2, top: a.y - AH / 2, width: AW, height: AH, borderRadius: R.panel, border: `1.5px solid ${mix(C.ocean, C.border, hot * 0.7)}`, background: C.surface, boxShadow: SHADOW.raised, display: "flex", alignItems: "center", gap: 18, padding: "0 24px", opacity: r.opacity, translate: r.translate, filter: r.filter }}>
              <Disc icon={a.icon} size={64} on={hot} />
              <div style={{ display: "grid", gap: 2 }}>
                <span style={{ fontSize: 31, fontWeight: 600, letterSpacing: "-0.02em" }}>{a.title}</span>
                <span style={{ fontSize: 24, color: C.text2, whiteSpace: "nowrap" }}>{a.line}</span>
              </div>
            </div>
          );
        })}
        {/* The packet */}
        {pk.u > 0.01 && pk.u < 0.99 ? <div style={{ position: "absolute", left: linkX(pk.k, pk.u) - 13, top: -13, width: 26, height: 26, borderRadius: 13, background: C.ocean, border: `4px solid ${C.surface}`, boxShadow: `0 2px 8px ${alpha(C.ocean, 0.35)}` }} /> : null}
      </div>
      <Headline t={t} lines={LINES} />
      <div style={{ position: "absolute", left: 0, right: 0, top: 984, display: "flex", justifyContent: "center", opacity: note.opacity, translate: note.translate, filter: note.filter }}>
        <Chip tone="accent" size={26}>
          <Icon name="shield" size={26} /> Assistance data reaches ops, crew and ground only
        </Chip>
      </div>
    </div>
  );
}
