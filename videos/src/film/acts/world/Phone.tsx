import { Img, staticFile } from "remotion";
import type { CSSProperties, ReactNode } from "react";

import { C, R, SHADOW, STATUS, mix } from "../../../tokens";
import { Avatar, Badge, Card, Gauge, Icon, QR, Stepper, StatusBadge, Toast } from "../../../ui/arc";
import { count, ease, inOut, rise, swap, tween } from "../../anim";
import { b } from "../../cues";
import { mascotSrc } from "../../mascot";
import { PHONE, W } from "./layout";

const SW = 438; // screen width
const SH = 928;
const PAD = 22;

const layer = (r: ReturnType<typeof rise>, extra?: CSSProperties): CSSProperties => ({ position: "absolute", inset: 0, opacity: r.opacity, translate: r.translate, filter: r.filter, ...extra });

function StatusBar() {
  return (
    <div style={{ position: "absolute", left: 34, right: 30, top: 16, display: "flex", justifyContent: "space-between", fontSize: 20, fontWeight: 600, color: C.fg }}>
      <span>14:05</span>
      <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <span style={{ width: 22, height: 12, borderRadius: 4, border: `2px solid ${C.fg}`, display: "inline-block" }} />
      </span>
    </div>
  );
}

function AppHeader() {
  return (
    <div style={{ position: "absolute", left: PAD, right: PAD, top: 58, height: 60, display: "flex", alignItems: "center", gap: 14 }}>
      <Img src={staticFile("segue-logo.svg")} style={{ width: 50, height: 50, borderRadius: 14 }} />
      <span style={{ fontSize: 30, fontWeight: 600, color: C.fg, flex: 1, letterSpacing: "-0.02em" }}>Segue</span>
      <Avatar initials="PS" size={50} />
    </div>
  );
}

/* 01 Scan: the boarding pass, a scan beam over the QR, then "Scanned". */
function Scan({ t }: { t: number }) {
  const r = rise(t, W.scan + 0.1, W.card - 0.05);
  if (!r.visible) return null;
  const beam = tween(t, [[0, 0], [W.scan + 0.45, 1], [W.scanned - 0.3, 0]], 0.5, inOut);
  const ok = ease(t, W.scanned, 0.3);
  return (
    <div style={layer(r)}>
      <Card shadow="raised" radius={R.panel} style={{ position: "absolute", left: PAD, top: 140, width: SW - PAD * 2, padding: "26px 26px 30px", display: "grid", gap: 10 }}>
        <span style={{ fontSize: 19, color: C.text3, fontWeight: 500 }}>Boarding pass</span>
        <span style={{ fontSize: 31, fontWeight: 600 }}>Priya Sharma</span>
        <span style={{ fontSize: 34, fontWeight: 600, letterSpacing: "-0.02em", color: C.ocean }}>DEL → DXB → LHR</span>
        <span style={{ fontSize: 21, color: C.text2 }}>EK 512 · Seat 12A · then BA 108</span>
        <div style={{ position: "relative", justifySelf: "center", marginTop: 14, padding: 16, borderRadius: R.control, border: `1.5px solid ${mix(STATUS.safe.color, C.border, ok)}` }}>
          <QR size={230} />
          <div style={{ position: "absolute", left: 8, right: 8, top: 16 + beam * 230 - 3, height: 6, borderRadius: 3, background: C.ocean, opacity: 1 - ok }} />
          <div style={{ position: "absolute", left: 8, right: 8, top: 16 + beam * 230 - 46, height: 46, background: `linear-gradient(to bottom, transparent, ${mix(C.sky, C.surface, 0.35)})`, opacity: (1 - ok) * 0.9 }} />
        </div>
      </Card>
      <div style={{ position: "absolute", left: 0, right: 0, top: 690, display: "flex", justifyContent: "center", opacity: ok, scale: String(0.9 + 0.1 * ok) }}>
        <Badge status="safe" label="Scanned" s={1.1} />
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 690, display: "flex", justifyContent: "center", gap: 10, alignItems: "center", color: C.text3, fontSize: 21, opacity: 1 - ok }}>
        <Icon name="scan" size={24} /> Point at your boarding pass
      </div>
    </div>
  );
}

/* 01→02 The connection card: Safe at 75 min, then the delay turns it At Risk. */
function Connection({ t }: { t: number }) {
  const r = rise(t, W.card + 0.05, W.chat - 0.12);
  if (!r.visible) return null;
  const status = swap(t, [[0, "safe"], [W.tight, "tight"], [W.risk, "risk"]] as const);
  const left = count(t, [[0, 75], [b(6, 2), 50]], 0.55);
  const score = tween(t, [[0, 0], [W.card + 0.1, 0.83], [b(6, 2), 0.55], [W.risk, 0.38]], 0.5);
  const gaugeColor = mix(STATUS[status.current].color, STATUS[status.previous].color, status.u);
  const lands = swap(t, [[0, "lands 13:40"], [b(6, 2), "lands 14:05"]] as const);
  const needs = rise(t, W.tight, Infinity, 16, 8);
  const toast = rise(t, W.delay, b(7, 3));
  const toastDrop = ease(t, W.delay, 0.4);
  return (
    <div style={layer(r)}>
      <Card shadow="raised" radius={R.panel} target="connection-card" style={{ position: "absolute", left: PAD, top: 140, width: SW - PAD * 2, padding: "24px 24px 28px", display: "grid", gap: 18 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 22, fontWeight: 600 }}>Your connection</span>
          <StatusBadge from={status.previous} to={status.current} u={status.u} width={150} s={0.95} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 10 }}>
          <div style={{ display: "grid", gap: 2 }}>
            <span style={{ fontSize: 27, fontWeight: 600 }}>EK 512</span>
            <span style={{ fontSize: 19, color: C.text2 }}>DEL → DXB</span>
            <span style={{ position: "relative", fontSize: 19, color: lands.index ? STATUS.tight.ink : C.text3, height: 24 }}>
              <span style={{ position: "absolute", whiteSpace: "nowrap", opacity: 1 - lands.u, filter: lands.u < 1 && lands.index ? `blur(${lands.u * 6}px)` : undefined }}>{lands.index ? lands.previous : ""}</span>
              <span style={{ position: "absolute", whiteSpace: "nowrap", opacity: lands.u, translate: `0 ${(1 - lands.u) * 10}px` }}>{lands.current}</span>
            </span>
          </div>
          <Icon name="arrow" size={26} color={C.text3} />
          <div style={{ display: "grid", gap: 2, justifyItems: "end" }}>
            <span style={{ fontSize: 27, fontWeight: 600 }}>BA 108</span>
            <span style={{ fontSize: 19, color: C.text2 }}>DXB → LHR</span>
            <span style={{ fontSize: 19, color: C.text3 }}>closes 14:55</span>
          </div>
        </div>
        <div style={{ display: "grid", justifyItems: "center", marginTop: 4 }}>
          <Gauge value={score} color={gaugeColor} size={230}>
            <span style={{ fontSize: 66, fontWeight: 600, letterSpacing: "-0.03em", lineHeight: 1, fontVariantNumeric: "tabular-nums", color: C.fg }}>{left}</span>
            <span style={{ fontSize: 19, color: C.text2 }}>min to connect</span>
          </Gauge>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "center", fontSize: 20, color: C.text2, opacity: needs.opacity, translate: needs.translate, filter: needs.filter, marginTop: -14, height: 28 }}>
          <Icon name="brain" size={22} color={C.ocean} />
          <span>
            Needs <b style={{ color: C.fg }}>58 min</b> · walk 9 + queue 6
          </span>
        </div>
        <Stepper s={0.7} done={0} steps={[{ label: "Land" }, { label: "Walk" }, { label: "Security" }, { label: "Gate" }]} />
      </Card>
      <div style={{ position: "absolute", left: 14, right: 14, top: 40 + toastDrop * 40, opacity: toast.opacity, filter: toast.filter }}>
        <Toast status="tight" icon="plane" title="EK 512 delayed +25 min" description="Now lands 14:05" s={0.86} />
      </div>
    </div>
  );
}

/* 04 Inform: Segue writes to her, then draws the route. */
function Bubble({ t, at, children, width }: { t: number; at: number; children: ReactNode; width?: number }) {
  const typing = t >= at - 0.32 && t < at;
  const r = rise(t, at, Infinity, 22, 10);
  if (typing) {
    return (
      <div style={{ display: "flex", gap: 7, padding: "18px 20px", width: "fit-content", borderRadius: "26px 26px 26px 8px", background: C.surface, border: `1.5px solid ${C.border}` }}>
        {[0, 1, 2].map((i) => (
          <span key={i} style={{ width: 10, height: 10, borderRadius: 5, background: C.text3, translate: `0 ${Math.sin(t * 18 - i * 0.9) * 4}px` }} />
        ))}
      </div>
    );
  }
  if (!r.visible) return <div style={{ height: 0 }} />;
  return (
    <div style={{ width: width ?? "fit-content", maxWidth: 360, padding: "16px 20px", borderRadius: "26px 26px 26px 8px", background: C.surface, border: `1.5px solid ${C.border}`, boxShadow: SHADOW.resting, fontSize: 22, lineHeight: 1.32, color: C.fg, opacity: r.opacity, translate: r.translate, filter: r.filter }}>
      {children}
    </div>
  );
}

function RouteMap({ t }: { t: number }) {
  const draw = ease(t, W.route + 0.2, 0.9, inOut);
  const walk = ease(t, W.route + 0.6, 1.6, (x) => x);
  const path = "M 34 170 C 90 170 110 110 160 108 S 230 60 300 40";
  // Points along the path for the walker (sampled cubic by eye, eased).
  const pts = [
    [34, 170], [70, 168], [105, 145], [140, 112], [175, 104], [215, 86], [255, 60], [300, 40],
  ];
  const f = walk * (pts.length - 1);
  const i = Math.min(pts.length - 2, Math.floor(f));
  const k = f - i;
  const wx = pts[i][0] + (pts[i + 1][0] - pts[i][0]) * k;
  const wy = pts[i][1] + (pts[i + 1][1] - pts[i][1]) * k;
  const len = 340;
  return (
    <div style={{ position: "relative", height: 200, borderRadius: R.control, background: C.surfaceMuted, border: `1.5px solid ${C.border}`, overflow: "hidden" }}>
      <svg width={350} height={200} style={{ position: "absolute", left: 0, top: 0 }}>
        {[40, 80, 120, 160].map((y) => (
          <line key={y} x1={0} x2={350} y1={y} y2={y} stroke={C.border} strokeWidth={1.5} />
        ))}
        {[70, 140, 210, 280].map((x) => (
          <line key={x} y1={0} y2={200} x1={x} x2={x} stroke={C.border} strokeWidth={1.5} />
        ))}
        <path d={path} fill="none" stroke={C.ocean} strokeWidth={6} strokeLinecap="round" strokeDasharray={`${len * draw} ${len}`} />
        <circle cx={34} cy={170} r={9} fill={C.surface} stroke={C.ocean} strokeWidth={4} />
        <circle cx={160} cy={108} r={9} fill={C.surface} stroke={STATUS.tight.color} strokeWidth={4} opacity={draw > 0.45 ? 1 : 0} />
        <circle cx={300} cy={40} r={11} fill={C.ocean} opacity={draw > 0.95 ? 1 : 0} />
        {walk > 0 ? <circle cx={wx} cy={wy} r={8} fill={C.deep} /> : null}
      </svg>
      <span style={{ position: "absolute", left: 14, top: 112, fontSize: 17, fontWeight: 600, color: C.text2 }}>C22</span>
      <span style={{ position: "absolute", left: 150, top: 120, fontSize: 17, fontWeight: 600, color: STATUS.tight.ink, opacity: draw > 0.45 ? 1 : 0 }}>Security</span>
      <span style={{ position: "absolute", right: 14, top: 58, fontSize: 17, fontWeight: 600, color: C.ocean, opacity: draw > 0.95 ? 1 : 0 }}>Gate B14</span>
    </div>
  );
}

function Chat({ t }: { t: number }) {
  const r = rise(t, W.chat - 0.05, W.boarded - 0.25);
  if (!r.visible) return null;
  const route = rise(t, W.route, Infinity, 24, 10);
  return (
    <div style={layer(r)}>
      <div style={{ position: "absolute", left: PAD, right: PAD, top: 130, display: "flex", alignItems: "center", gap: 14, paddingBottom: 14, borderBottom: `1.5px solid ${mix(C.deep, C.mist, 0.08)}` }}>
        <Avatar size={58}>
          <Img src={mascotSrc("mail")} style={{ width: "120%", height: "120%" }} />
        </Avatar>
        <div style={{ display: "grid" }}>
          <span style={{ fontSize: 25, fontWeight: 600 }}>Segue</span>
          <span style={{ fontSize: 18, color: C.text3 }}>WhatsApp · now</span>
        </div>
      </div>
      <div style={{ position: "absolute", left: PAD, right: PAD, top: 228, display: "grid", gap: 14, justifyItems: "start" }}>
        <Bubble t={t} at={b(9, 1, 0.6)}>
          Priya, your connection to London is <b style={{ color: STATUS.risk.ink }}>at risk</b>.
        </Bubble>
        <Bubble t={t} at={b(9, 3, 0.2)}>Cabin crew will call you off first. Stay in 12A.</Bubble>
        {route.visible ? (
          <div style={{ width: "100%", padding: 16, borderRadius: R.panel, background: C.surface, border: `1.5px solid ${C.border}`, boxShadow: SHADOW.raised, display: "grid", gap: 12, opacity: route.opacity, translate: route.translate, filter: route.filter }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 22, fontWeight: 600 }}>Fastest route</span>
              <span style={{ fontSize: 20, color: C.text2 }}>15 min</span>
            </div>
            <RouteMap t={t} />
            <div style={{ display: "flex", gap: 10 }}>
              <Badge status="info" icon="pin" label="Walk 9 min" s={0.82} />
              <Badge status="tight" icon="clock" label="Queue 6 min" s={0.82} />
            </div>
          </div>
        ) : null}
        <Bubble t={t} at={b(10, 4)}>Your bag is tagged for a fast transfer.</Bubble>
      </div>
    </div>
  );
}

/* Payoff: boarded, and the bag too. */
function Boarded({ t }: { t: number }) {
  const r = rise(t, W.boarded - 0.1);
  if (!r.visible) return null;
  const done = tween(t, [[0, 2], [b(15, 4), 3], [b(16, 1), 4]], 0.35);
  const check = ease(t, b(16, 1, 0.3), 0.3);
  const bag = rise(t, b(16, 2), Infinity, 22, 10);
  return (
    <div style={layer(r)}>
      <div style={{ position: "absolute", left: 0, right: 0, top: 150, display: "grid", justifyItems: "center", gap: 10 }}>
        <div style={{ width: 120, height: 120, borderRadius: R.pill, display: "grid", placeItems: "center", background: mix(STATUS.safe.color, C.surface, 0.1 + 0.9 * check), border: `2px solid ${mix(STATUS.safe.color, C.border, 0.3 + 0.7 * check)}`, color: check > 0.5 ? "#FFFFFF" : STATUS.safe.color, scale: String(0.85 + 0.15 * check) }}>
          <Icon name="check" size={64} stroke={3} />
        </div>
        <span style={{ fontSize: 44, fontWeight: 600, letterSpacing: "-0.02em" }}>You made it.</span>
        <span style={{ fontSize: 22, color: C.text2 }}>BA 108 · Seat 23C · Gate B14</span>
      </div>
      <Card shadow="raised" radius={R.panel} style={{ position: "absolute", left: PAD, right: PAD, top: 430, padding: "26px 26px" }}>
        <Stepper
          orientation="vertical"
          s={0.82}
          gap={26}
          accent={STATUS.safe.color}
          done={done}
          steps={[{ label: "Landed", description: "14:05 · first off" }, { label: "Walked", description: "C22 → B14" }, { label: "Security", description: "Fast track" }, { label: "Boarded", description: "14:52" }]}
        />
      </Card>
      <div style={{ position: "absolute", left: PAD, right: PAD, top: 792, opacity: bag.opacity, translate: bag.translate, filter: bag.filter }}>
        <Card shadow="raised" radius={R.panel} style={{ padding: "16px 20px", display: "flex", alignItems: "center", gap: 14 }}>
          <Icon name="bag" size={32} color={C.ocean} />
          <span style={{ fontSize: 22, fontWeight: 600, flex: 1 }}>Your bag</span>
          <Badge status="safe" label="On board" s={0.85} />
        </Card>
      </div>
    </div>
  );
}

export function Phone({ t }: { t: number }) {
  return (
    <div style={{ position: "absolute", left: PHONE.x - PHONE.w / 2, top: PHONE.y - PHONE.h / 2, width: PHONE.w, height: PHONE.h, borderRadius: 72, background: C.deep, boxShadow: "0 40px 90px rgba(6,40,61,.22), 0 8px 24px rgba(6,40,61,.12)" }}>
      <div style={{ position: "absolute", left: 16, top: 16, width: SW, height: SH, borderRadius: 58, background: C.mist, overflow: "hidden" }}>
        <StatusBar />
        <div style={{ position: "absolute", left: SW / 2 - 60, top: 12, width: 120, height: 32, borderRadius: 16, background: C.deep }} />
        <AppHeader />
        <Scan t={t} />
        <Connection t={t} />
        <Chat t={t} />
        <Boarded t={t} />
      </div>
    </div>
  );
}
