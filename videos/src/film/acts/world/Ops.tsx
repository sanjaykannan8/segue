import { D, R, STATUS, type Status } from "../../../tokens";
import { Avatar, Badge, Button, Card, Icon, Progress, StatusBadge, Toast } from "../../../ui/arc";
import { count, ease, rise, swap, tween } from "../../anim";
import { b } from "../../cues";
import { OPS, W } from "./layout";

const METRICS: { label: string; status: Status; keys: [number, number][] }[] = [
  { label: "Safe", status: "safe", keys: [[0, 0], [W.ops - 0.2, 212], [W.approve + 0.25, 226]] },
  { label: "Tight", status: "tight", keys: [[0, 0], [W.ops - 0.1, 37]] },
  { label: "At Risk", status: "risk", keys: [[0, 0], [W.ops, 14], [W.approve + 0.25, 0]] },
  { label: "Lost", status: "lost", keys: [[0, 0], [W.ops + 0.1, 2]] },
];

const BOARD: { name: string; initials: string; route: string; left: string; needs: string; status: Status; saved?: boolean }[] = [
  { name: "Priya Sharma", initials: "PS", route: "EK 512 → BA 108", left: "50m", needs: "58m", status: "risk", saved: true },
  { name: "Omar Khalid", initials: "OK", route: "EK 512 → BA 108", left: "50m", needs: "57m", status: "risk", saved: true },
  { name: "Sara Ali", initials: "SA", route: "EK 512 → BA 108", left: "50m", needs: "61m", status: "risk", saved: true },
  { name: "Lena Müller", initials: "LM", route: "EK 512 → QF 2", left: "64m", needs: "61m", status: "tight" },
  { name: "Wei Chen", initials: "WC", route: "AI 995 → CX 732", left: "88m", needs: "55m", status: "safe" },
];

/** 05 Decide: the ops dashboard (dark), a suggested hold, one click to approve. */
export function Ops({ t }: { t: number }) {
  const show = rise(t, b(10, 3), b(13, 2), 40, 12);
  if (!show.visible) return null;
  const left = OPS.x - OPS.w / 2;
  const top = OPS.y - OPS.h / 2;
  const approved = swap(t, [[0, 0], [W.approve, 1]] as const, 0.3);
  const a = approved.index ? approved.u : 0;
  const press = t >= W.approve && t < W.approve + 0.16 ? Math.sin((Math.PI * (t - W.approve)) / 0.16) : 0;
  const atRisk = count(t, [[0, 14], [W.approve + 0.25, 0]], 0.6);
  const toast = rise(t, W.approve + 0.35, Infinity, 30, 12);
  const toastSlide = ease(t, W.approve + 0.35, 0.4);
  return (
    <div style={{ position: "absolute", left, top, width: OPS.w, height: OPS.h, opacity: show.opacity, filter: show.filter }}>
      <Card dark shadow="floating" style={{ width: OPS.w, height: OPS.h, background: D.bg }}>
        {/* Window bar */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, height: 66, padding: "0 26px", borderBottom: `1.5px solid ${D.border}` }}>
          {[0, 1, 2].map((i) => (
            <span key={i} style={{ width: 14, height: 14, borderRadius: 7, background: D.border }} />
          ))}
          <span style={{ marginLeft: 16, fontSize: 23, fontWeight: 600, color: D.fg, flex: 1 }}>Segue Ops · Dubai DXB hub</span>
          <Badge dark status="safe" icon="zap" label="Live" s={0.95} />
        </div>
        {/* Metrics */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 20, padding: "26px 30px 0" }}>
          {METRICS.map((m, i) => {
            const r = rise(t, b(11, 1, i * 0.25) - 0.3, Infinity, 24, 10);
            const value = m.label === "At Risk" ? atRisk : count(t, m.keys, 0.55);
            return (
              <div key={m.label} style={{ border: `1.5px solid ${D.border}`, borderRadius: R.surface, background: D.surface, padding: "20px 26px", display: "grid", gap: 6, opacity: r.opacity, translate: r.translate, filter: r.filter }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, color: D.text2, fontSize: 23 }}>
                  <span style={{ width: 13, height: 13, borderRadius: 7, background: STATUS[m.status].dark }} />
                  {m.label}
                </div>
                <span style={{ fontSize: 64, fontWeight: 600, letterSpacing: "-0.03em", lineHeight: 1.05, color: D.fg, fontVariantNumeric: "tabular-nums" }}>{value}</span>
              </div>
            );
          })}
        </div>
        {/* Connection board */}
        <div style={{ position: "absolute", left: 30, top: 270, width: 880, bottom: 30, border: `1.5px solid ${D.border}`, borderRadius: R.panel, background: D.surface, overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 250px 80px 90px 170px", gap: 10, padding: "18px 24px", fontSize: 20, color: D.text3, borderBottom: `1.5px solid ${D.border}` }}>
            <span>Passenger</span>
            <span>Connection</span>
            <span>Left</span>
            <span>Needs</span>
            <span>Status</span>
          </div>
          {BOARD.map((row, i) => {
            const r = rise(t, b(11, 2, i * 0.25), Infinity, 20, 8);
            const to: Status = row.saved && approved.index ? "safe" : row.status;
            return (
              <div key={row.name} style={{ display: "grid", gridTemplateColumns: "1fr 250px 80px 90px 170px", gap: 10, alignItems: "center", height: 86, padding: "0 24px", borderBottom: `1.5px solid ${D.border}`, opacity: r.opacity, translate: r.translate, filter: r.filter }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <Avatar dark initials={row.initials} size={48} />
                  <span style={{ fontSize: 24, fontWeight: 600, color: D.fg }}>{row.name}</span>
                </div>
                <span style={{ fontSize: 21, color: D.text2 }}>{row.route}</span>
                <span style={{ fontSize: 22, color: D.fg, fontVariantNumeric: "tabular-nums" }}>{row.left}</span>
                <span style={{ fontSize: 22, color: D.text2, fontVariantNumeric: "tabular-nums" }}>{row.needs}</span>
                <StatusBadge dark from={row.status} to={to} u={row.saved ? approved.u : 1} width={150} s={0.9} />
              </div>
            );
          })}
        </div>
        {/* Suggested action */}
        <div data-target="action-card" style={{ position: "absolute", left: 932, top: 270, right: 30, bottom: 30, border: `1.5px solid ${D.border}`, borderRadius: R.panel, background: D.raised, padding: "26px 28px", display: "grid", alignContent: "start", gap: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 21, color: D.text3 }}>Suggested action</span>
            <Badge dark status="info" icon="brain" label="92% confidence" s={0.9} />
          </div>
          <span style={{ fontSize: 38, fontWeight: 600, letterSpacing: "-0.02em", color: D.fg, lineHeight: 1.1 }}>Hold BA 108 for 8 min</span>
          <span style={{ fontSize: 22, color: D.text2, lineHeight: 1.35 }}>Saves 14 connections. Departure slot still open.</span>
          <div style={{ display: "grid", gap: 10, marginTop: 6 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ fontSize: 21, color: D.text2 }}>At Risk on BA 108</span>
              <span style={{ fontSize: 40, fontWeight: 600, color: atRisk ? STATUS.risk.dark : STATUS.safe.dark, fontVariantNumeric: "tabular-nums" }}>{atRisk}</span>
            </div>
            <Progress dark value={tween(t, [[0, 1], [W.approve + 0.25, 0]], 0.6)} color={STATUS.risk.dark} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 22, color: D.text2 }}>
            <Icon name="clock" size={24} color={D.text2} />
            <span style={{ flex: 1 }}>BA 108 departs</span>
            <span style={{ color: D.text3, textDecoration: a > 0.5 ? "line-through" : undefined }}>15:20</span>
            <Icon name="arrow" size={20} color={D.text3} />
            <span style={{ color: D.fg, fontWeight: 600 }}>15:28</span>
          </div>
          <div style={{ display: "flex", gap: 14, justifyContent: "flex-end", marginTop: 14 }}>
            <Button dark variant="secondary" s={0.95}>
              Dismiss
            </Button>
            <Button dark variant="primary" s={0.95} press={press} width={250} target="approve">
              <span style={{ position: "relative", display: "inline-block", width: 180, height: 32 }}>
                <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", opacity: 1 - a, translate: `0 ${-a * 12}px`, filter: a > 0 && a < 1 ? `blur(${a * 5}px)` : undefined }}>Approve hold</span>
                <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, opacity: a, translate: `0 ${(1 - a) * 12}px` }}>
                  <Icon name="check" size={24} stroke={3} /> Approved
                </span>
              </span>
            </Button>
          </div>
        </div>
      </Card>
      <div style={{ position: "absolute", right: 40, bottom: 44 - 20 + toastSlide * 20, opacity: toast.opacity, filter: toast.filter }}>
        <Toast dark status="safe" title="Hold approved" description="BA 108 gate and crew notified" />
      </div>
    </div>
  );
}
