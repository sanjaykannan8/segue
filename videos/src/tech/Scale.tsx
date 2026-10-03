import { C, R, STATUS, mix, type Status } from "../tokens";
import { Badge, Card, Icon, StatusBadge, Toast } from "../ui/arc";
import { ease, inOut, rise, swap } from "../film/anim";
import { Handheld } from "../film/Handheld";
import { Mascot } from "../film/mascot";
import { T } from "./cues";
import { Chip, Disc, Headline, type Line } from "./shared";

/* Acts 1–3 (0–15 s): the scale problem, connection-level scoring, cached risk. */

const N = 96;
const CLUSTERS: { flight: string; city: string; n: number; status: Status }[] = [
  { flight: "BA 108", city: "London", n: 14, status: "tight" },
  { flight: "QF 2", city: "Sydney", n: 31, status: "tight" },
  { flight: "CX 732", city: "Hong Kong", n: 27, status: "safe" },
  { flight: "EK 201", city: "New York", n: 24, status: "safe" },
];
const CX = [330, 750, 1170, 1590];
const CLUSTER_Y = 730;
const CARD_TOP = 330;

// Deterministic jitter.
const rnd = (i: number, k: number) => {
  const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

// Ring packing inside a cluster: 1, 6, 12, 18.
const RING: [number, number][] = [[0, 0]];
for (let ring = 1; ring <= 3; ring++) for (let j = 0; j < ring * 6; j++) RING.push([Math.cos((j / (ring * 6)) * Math.PI * 2 + ring) * ring * 37, Math.sin((j / (ring * 6)) * Math.PI * 2 + ring) * ring * 37]);

type Dot = { gx: number; gy: number; cx: number; cy: number; cluster: number; col: number };
const DOTS: Dot[] = [];
{
  let cluster = 0;
  let inCluster = 0;
  for (let i = 0; i < N; i++) {
    const col = Math.floor(i / 6);
    const row = i % 6;
    if (inCluster >= CLUSTERS[cluster].n) {
      cluster++;
      inCluster = 0;
    }
    DOTS.push({
      gx: 285 + col * 90 + (rnd(i, 1) - 0.5) * 30,
      gy: 500 + row * 78 + (rnd(i, 2) - 0.5) * 26,
      cx: CX[cluster] + RING[inCluster][0],
      cy: CLUSTER_Y + RING[inCluster][1],
      cluster,
      col,
    });
    inCluster++;
  }
}

const LINES: Line[] = [
  { at: -0.3, out: 1.3, title: "One delayed flight." },
  { at: 1.5, out: 2.8, title: <><span style={{ color: STATUS.tight.ink }}>96 passengers</span> at risk.</> },
  { at: 3.0, out: T.connect - 0.2, title: <>Scoring each one <span style={{ color: STATUS.lost.ink }}>doesn't scale.</span></> },
  { at: T.connect, out: 8.1, title: <>Segue tracks the <span style={{ color: C.ocean }}>connection.</span></>, sub: "One score per flight pair, shared by everyone on it." },
  { at: 8.3, out: T.cache - 0.2, title: <>96 passengers. <span style={{ color: C.ocean }}>4 scores.</span></> },
  { at: T.cache, out: T.decide - 0.3, title: <>Risk is computed once, then <span style={{ color: C.ocean }}>cached.</span></>, sub: "A new flight event makes a new version." },
];

function Dots({ t }: { t: number }) {
  if (t < 1.2 || t > 9) return null;
  return (
    <>
      {DOTS.map((d, i) => {
        const appear = ease(t, 1.4 + d.col * 0.05, 0.5);
        if (appear <= 0) return null;
        const move = ease(t, T.connect + 0.2 + (i % 12) * 0.03, 1.2, inOut);
        const fold = ease(t, 7.5 + (i % 8) * 0.03, 0.8, inOut);
        const x = d.gx + (d.cx - d.gx) * move + (CX[d.cluster] - d.cx) * fold;
        const y = d.gy + (d.cy - d.gy) * move + (CARD_TOP + 150 - d.cy) * fold;
        const size = 30 * (0.6 + 0.4 * appear) * (1 - fold);
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x - size / 2,
              top: y - size / 2,
              width: size,
              height: size,
              borderRadius: R.pill,
              background: mix(STATUS.tight.color, C.surface, 0.22),
              border: `2px solid ${mix(STATUS.tight.color, C.border, 0.6)}`,
              opacity: appear * (1 - fold),
            }}
          />
        );
      })}
    </>
  );
}

function FlightChip({ t }: { t: number }) {
  const r = rise(t, -0.3, T.connect - 0.2, 30, 12);
  if (!r.visible) return null;
  const s = swap(t, [[0, "info"], [0.55, "tight"]] as const, 0.35);
  const calls = rise(t, 3.2, T.connect - 0.2, 20, 10);
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top: 260, display: "flex", justifyContent: "center", alignItems: "center", gap: 24, opacity: r.opacity, translate: r.translate, filter: r.filter }}>
      <Card shadow="raised" radius={R.panel} style={{ display: "flex", alignItems: "center", gap: 22, padding: "20px 28px" }}>
        <Disc icon="plane" size={60} />
        <div style={{ display: "grid" }}>
          <span style={{ fontSize: 36, fontWeight: 600 }}>EK 512</span>
          <span style={{ fontSize: 24, color: C.text2 }}>Delhi → Dubai</span>
        </div>
        <StatusBadge from={s.previous} to={s.current} u={s.u} width={240} s={1.05} labels={{ info: "Landing", tight: "Landed +25" }} />
      </Card>
      <span style={{ opacity: calls.opacity, translate: calls.translate, filter: calls.filter }}>
        <Badge status="lost" icon="brain" label="96 model calls" s={1.25} />
      </span>
    </div>
  );
}

function ClusterCards({ t }: { t: number }) {
  if (t < T.connect + 0.8 || t > T.cache + 0.4) return null;
  return (
    <>
      {CLUSTERS.map((c, k) => {
        const r = rise(t, T.connect + 1.1 + k * 0.15, T.cache - 0.2, 26, 10);
        const badge = ease(t, 8.1 + k * 0.15, 0.45);
        return (
          <div key={c.flight} style={{ position: "absolute", left: CX[k] - 180, top: CARD_TOP, width: 360, opacity: r.opacity, translate: r.translate, filter: r.filter }}>
            <Card shadow="raised" radius={R.panel} style={{ padding: "22px 24px", display: "grid", gap: 10, height: 236 }}>
              <span style={{ fontSize: 22, color: C.text3, fontWeight: 500 }}>EK 512 →</span>
              <span style={{ fontSize: 40, fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1 }}>{c.flight}</span>
              <span style={{ fontSize: 24, color: C.text2 }}>
                {c.city} · {c.n} passengers
              </span>
              <div style={{ marginTop: 8, opacity: badge, scale: String(0.9 + 0.1 * badge), transformOrigin: "0 50%" }}>
                <Badge status={c.status} s={1.1} />
              </div>
            </Card>
          </div>
        );
      })}
    </>
  );
}

function CacheCard({ t }: { t: number }) {
  const r = rise(t, T.cache + 0.1, T.decide - 0.3, 40, 14);
  if (!r.visible) return null;
  const EVENT = T.cache + 1.9;
  const status = swap(t, [[0, "tight"], [EVENT, "risk"]] as const, 0.4);
  const version = swap(t, [[0, "v7"], [EVENT, "v8"]] as const, 0.4);
  const note = swap(t, [[0, "Served from cache to all 14"], [EVENT, "New version: recomputed once"]] as const, 0.4);
  const toast = rise(t, T.cache + 1.5, T.decide - 0.3, 24, 10);
  const slide = ease(t, T.cache + 1.5, 0.6);
  const swapText = (s: { current: string; previous: string; u: number; index: number }) => (
    <span style={{ position: "relative", display: "inline-block" }}>
      <span style={{ visibility: "hidden" }}>{s.current.length > s.previous.length ? s.current : s.previous}</span>
      {s.index && s.u < 1 ? <span style={{ position: "absolute", left: 0, top: 0, whiteSpace: "nowrap", opacity: 1 - s.u, translate: `0 ${-s.u * 10}px`, filter: `blur(${s.u * 6}px)` }}>{s.previous}</span> : null}
      <span style={{ position: "absolute", left: 0, top: 0, whiteSpace: "nowrap", opacity: s.u, translate: `0 ${(1 - s.u) * 10}px` }}>{s.current}</span>
    </span>
  );
  return (
    <>
      <div style={{ position: "absolute", left: 510, top: 360, width: 900, opacity: r.opacity, translate: r.translate, filter: r.filter }}>
        <Card shadow="floating" style={{ width: 900 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 22, padding: "30px 36px" }}>
            <Disc icon="plane" size={68} />
            <div style={{ display: "grid", flex: 1 }}>
              <span style={{ fontSize: 44, fontWeight: 600, letterSpacing: "-0.02em" }}>EK 512 → BA 108</span>
              <span style={{ fontSize: 25, color: C.text2 }}>One connection · 14 passengers</span>
            </div>
            <StatusBadge from={status.previous} to={status.current} u={status.u} width={170} s={1.15} />
          </div>
          <div style={{ display: "grid", gap: 14, padding: "26px 36px", borderTop: `1.5px solid ${C.border}` }}>
            <span style={{ fontSize: 23, color: C.text3, fontWeight: 500 }}>Cache key</span>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <Chip size={25}>EK 512 · 3 Oct</Chip>
              <Chip size={25}>BA 108 · 3 Oct</Chip>
              <Chip size={25} tone="accent">
                {swapText(version)}
              </Chip>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "24px 36px 30px", borderTop: `1.5px solid ${C.border}`, fontSize: 27, fontWeight: 500, color: C.fg }}>
            <Icon name={version.index ? "refresh" : "check"} size={28} color={C.ocean} />
            {swapText(note)}
          </div>
        </Card>
      </div>
      <div style={{ position: "absolute", left: 1330 + (1 - slide) * 60, top: 242, opacity: toast.opacity, filter: toast.filter }}>
        <Toast status="tight" icon="pin" title="Gate change" description="BA 108 moves to B14" s={1.05} />
      </div>
    </>
  );
}

export function Scale({ t }: { t: number }) {
  if (t > T.decide + 0.3) return null;
  return (
    <Handheld t={t} start={0} end={T.decide} zoomFrom={1} zoomTo={1.04}>
      <Headline t={t} lines={LINES} />
      <FlightChip t={t} />
      <ClusterCards t={t} />
      <Dots t={t} />
      <CacheCard t={t} />
      <Mascot t={t} x={1770} y={150} size={150} rot={-5} poses={[[0, "calm"], [3.0, "dizzy"], [T.connect + 0.2, "happy"], [T.cache, "code"]]} />
    </Handheld>
  );
}
