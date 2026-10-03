import { Img } from "remotion";
import type { ReactNode } from "react";

import { C, R, SHADOW, alpha, type Status } from "../tokens";
import { Badge, Card, Icon, Progress } from "../ui/arc";
import { ease, inOut, rise } from "../film/anim";
import { Handheld } from "../film/Handheld";
import { mascotSrc } from "../film/mascot";
import { T, tb } from "./cues";
import { Chip, Headline, type Line } from "./shared";

/* Acts 4–5 (15–24 s): one clef-flash call answers every question; confidence decides who acts. */

const LINES: Line[] = [
  { at: T.decide, out: T.gate - 0.25, title: <>One call. <span style={{ color: C.ocean }}>Every decision.</span></>, sub: "clef-flash answers typed questions, with a probability for each." },
  { at: T.gate, out: T.pipe - 0.3, title: <>Confidence decides <span style={{ color: C.ocean }}>who acts.</span></>, sub: "Costly actions always wait for a person." },
];

const STATE: { label: string; value: ReactNode }[] = [
  { label: "Time buffer", value: <b>−8 min</b> },
  { label: "Risk", value: <Badge status="risk" s={0.95} /> },
  { label: "Seat", value: <b>12A</b> },
  { label: "Assistance", value: <b>Wheelchair</b> },
  { label: "Buggies free", value: <b>2</b> },
];

const ANSWERS: { id: string; answer: string; p: number; gate: Status; gateLabel: string }[] = [
  { id: "ops_action", answer: "hold_flight", p: 0.81, gate: "info", gateLabel: "Ops approves" },
  { id: "crew_priority_deplane", answer: "yes", p: 0.97, gate: "safe", gateLabel: "Runs itself" },
  { id: "assistance_type", answer: "buggy", p: 0.88, gate: "safe", gateLabel: "Runs itself" },
  { id: "request_fast_track", answer: "yes", p: 0.74, gate: "info", gateLabel: "Ops approves" },
  { id: "message_template", answer: "called_off_first", p: 0.92, gate: "safe", gateLabel: "Runs itself" },
];

const TOP = 300;
const H = 600;

/** A link with dashes that march toward the target: data flowing, smoothly. */
function Flow({ x1, x2, y, t, on }: { x1: number; x2: number; y: number; t: number; on: number }) {
  return (
    <svg width={x2 - x1} height={12} style={{ position: "absolute", left: x1, top: y - 6, opacity: on }}>
      <line x1={0} x2={x2 - x1} y1={6} y2={6} stroke={alpha(C.ocean, 0.55)} strokeWidth={5} strokeLinecap="round" strokeDasharray="2 18" strokeDashoffset={-t * 50} />
    </svg>
  );
}

export function Decide({ t }: { t: number }) {
  if (t < T.decide - 0.2 || t > T.pipe + 0.4) return null;
  const out = T.pipe - 0.3;
  const state = rise(t, T.decide + 0.15, out, 40, 14);
  const node = rise(t, T.decide + 0.6, out, 40, 14);
  const answers = rise(t, T.decide + 1.0, out, 40, 14);
  const never = rise(t, T.gate + 1.4, out, 20, 10);
  return (
    <Handheld t={t} start={T.decide} end={T.pipe} zoomFrom={1} zoomTo={1.035}>
      <Headline t={t} lines={LINES} />
      {/* State */}
      <div style={{ position: "absolute", left: 90, top: TOP, width: 470, opacity: state.opacity, translate: state.translate, filter: state.filter }}>
        <Card shadow="floating" style={{ width: 470, height: H }}>
          <div style={{ padding: "26px 30px 20px", fontSize: 30, fontWeight: 600 }}>State</div>
          {STATE.map((row, i) => {
            const r = rise(t, T.decide + 0.4 + i * 0.12, Infinity, 16, 8);
            return (
              <div key={row.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 98, padding: "0 30px", borderTop: `1.5px solid ${C.border}`, fontSize: 27, opacity: r.opacity, translate: r.translate }}>
                <span style={{ color: C.text2 }}>{row.label}</span>
                <span style={{ color: C.fg, fontWeight: 600 }}>{row.value}</span>
              </div>
            );
          })}
        </Card>
      </div>
      <Flow x1={575} x2={655} y={TOP + H / 2} t={t} on={node.opacity as number} />
      {/* Model */}
      <div style={{ position: "absolute", left: 670, top: TOP + H / 2 - 150, width: 300, height: 300, opacity: node.opacity, translate: node.translate, filter: node.filter }}>
        <div style={{ width: 300, height: 300, borderRadius: R.surface, border: `1.5px solid ${alpha(C.ocean, 0.25)}`, background: C.surface, boxShadow: SHADOW.floating, display: "grid", placeItems: "center", alignContent: "center", gap: 6 }}>
          <Img src={mascotSrc("code")} style={{ width: 150, height: 150 }} />
          <span style={{ fontSize: 34, fontWeight: 600, letterSpacing: "-0.02em" }}>clef-flash</span>
          <span style={{ fontSize: 21, color: C.text3 }}>open-weight · hosted locally</span>
        </div>
      </div>
      <Flow x1={985} x2={1065} y={TOP + H / 2} t={t} on={answers.opacity as number} />
      {/* Answers */}
      <div style={{ position: "absolute", left: 1080, top: TOP, width: 750, opacity: answers.opacity, translate: answers.translate, filter: answers.filter }}>
        <Card shadow="floating" style={{ width: 750, height: H }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "26px 30px 20px" }}>
            <span style={{ fontSize: 30, fontWeight: 600 }}>Answers</span>
            <span style={{ opacity: never.opacity, translate: never.translate, filter: never.filter }}>
              <Chip tone="accent" size={21}>
                <Icon name="refresh" size={20} /> Never cached
              </Chip>
            </span>
          </div>
          {ANSWERS.map((a, i) => {
            const at = tb(12, 1) + i * 0.75;
            const r = rise(t, at, Infinity, 18, 8);
            const fill = ease(t, at + 0.15, 0.7, inOut);
            const gate = ease(t, T.gate + 0.3 + i * 0.22, 0.5);
            return (
              <div key={a.id} style={{ display: "grid", gridTemplateColumns: "1fr 200px", alignItems: "center", gap: 16, height: 98, padding: "0 30px", borderTop: `1.5px solid ${C.border}`, opacity: r.opacity, translate: r.translate }}>
                <div style={{ display: "grid", gap: 3 }}>
                  <span style={{ fontSize: 21, color: C.text3 }}>{a.id}</span>
                  <span style={{ fontSize: 29, fontWeight: 600 }}>{a.answer}</span>
                </div>
                <div style={{ position: "relative", height: 50 }}>
                  <div style={{ position: "absolute", inset: 0, display: "grid", alignContent: "center", gap: 8, opacity: 1 - gate, filter: gate > 0 && gate < 1 ? `blur(${gate * 6}px)` : undefined }}>
                    <span style={{ fontSize: 25, fontWeight: 600, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{(a.p * fill).toFixed(2)}</span>
                    <Progress value={a.p * fill} height={10} />
                  </div>
                  <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "flex-end", opacity: gate, translate: `0 ${(1 - gate) * 10}px` }}>
                    <Badge status={a.gate} icon={a.gate === "safe" ? "zap" : "users"} label={a.gateLabel} s={1.0} />
                  </div>
                </div>
              </div>
            );
          })}
        </Card>
      </div>
    </Handheld>
  );
}
