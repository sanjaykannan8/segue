import type { ReactNode } from "react";

import { C, R, STATUS, alpha } from "../../../tokens";
import { Badge, Card, Icon, QR, Stepper, StatusBadge } from "../../../ui/arc";
import { ease, rise, swap, tween } from "../../anim";
import { b } from "../../cues";
import { BAGS } from "./layout";

function Header({ icon, title, sub, right }: { icon: string; title: string; sub: string; right: ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 18, padding: "28px 32px 22px" }}>
      <div style={{ width: 64, height: 64, flex: "none", borderRadius: R.pill, display: "grid", placeItems: "center", background: alpha(C.ocean, 0.1), color: C.ocean, border: `1.5px solid ${alpha(C.ocean, 0.25)}` }}>
        <Icon name={icon} size={32} />
      </div>
      <div style={{ display: "grid", flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 34, fontWeight: 600, letterSpacing: "-0.02em" }}>{title}</span>
        <span style={{ fontSize: 22, color: C.text3 }}>{sub}</span>
      </div>
      {right}
    </div>
  );
}

/** 06 Bags and borders: a hot-transfer bag reaches the aircraft; the transfer pass clears the path. */
export function Bags({ t }: { t: number }) {
  const show = rise(t, b(12, 3), b(15, 3), 40, 12);
  if (!show.visible) return null;
  const bagStatus = swap(t, [[0, "risk"], [b(14, 2), "safe"]] as const);
  const done = tween(t, [[0, 1], [b(13, 1, 0.5), 2], [b(13, 3), 3], [b(14, 2), 4]], 0.4);
  const lane = swap(t, [[0, "info"], [b(14, 1), "safe"]] as const);
  const rows = [
    { at: b(13, 2), title: "Airside transit", sub: "No immigration needed", right: <Badge status="safe" label="Cleared" s={1.05} /> },
    {
      at: b(13, 3),
      title: "Transfer security",
      sub: "T3 queue right now",
      right: (
        <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 46 }}>
          {[0.5, 0.8, 0.65, 0.35, 0.25].map((h, i) => (
            <span key={i} style={{ width: 14, height: 46 * h * ease(t, b(13, 3, 0.1 * i), 0.3), borderRadius: 4, background: i === 4 ? C.ocean : C.border }} />
          ))}
          <span style={{ marginLeft: 8, fontSize: 26, fontWeight: 600 }}>6 min</span>
        </div>
      ),
    },
    { at: b(13, 4), title: "Fast-track lane", sub: "Requested for at-risk transfer", right: <StatusBadge from={lane.previous} to={lane.current} u={lane.u} width={180} s={1.05} labels={{ info: "Requested", safe: "Lane 3" }} /> },
  ];
  return (
    <div style={{ position: "absolute", left: BAGS.left, top: BAGS.top, opacity: show.opacity, filter: show.filter }}>
      <Card shadow="floating" style={{ position: "absolute", left: 0, top: 0, width: BAGS.w, height: BAGS.h }}>
        <Header icon="bag" title="Priya's bag" sub="Tag 0176 451382 · 23 kg" right={<StatusBadge from={bagStatus.previous} to={bagStatus.current} u={bagStatus.u} width={220} s={1.05} labels={{ risk: "Hot transfer", safe: "On board" }} />} />
        <div style={{ padding: "18px 40px", borderTop: `1.5px solid ${C.border}` }}>
          <Stepper
            orientation="vertical"
            s={1.05}
            gap={30}
            done={done}
            accent={done >= 3.99 ? STATUS.safe.color : C.ocean}
            steps={[
              { label: "Checked in", description: "Delhi · 09:12" },
              { label: "Unloaded", description: "Dubai · 14:09" },
              { label: "Hot transfer", description: "Belt 7 → stand B14" },
              { label: "Loaded", description: "BA 108 · hold 2" },
            ]}
          />
        </div>
      </Card>
      <Card shadow="floating" style={{ position: "absolute", left: BAGS.w + BAGS.gap, top: 0, width: BAGS.w, height: BAGS.h }}>
        <Header icon="shield" title="Transfer pass" sub="Dubai DXB · Terminal 3" right={<QR size={84} seed={11} />} />
        {rows.map((row) => {
          const r = rise(t, row.at, Infinity, 24, 10);
          return (
            <div key={row.title} style={{ display: "flex", alignItems: "center", gap: 18, height: 128, padding: "0 32px", borderTop: `1.5px solid ${C.border}`, opacity: r.opacity, translate: r.translate, filter: r.filter }}>
              <div style={{ display: "grid", flex: 1 }}>
                <span style={{ fontSize: 29, fontWeight: 600 }}>{row.title}</span>
                <span style={{ fontSize: 22, color: C.text2 }}>{row.sub}</span>
              </div>
              {row.right}
            </div>
          );
        })}
        <div style={{ position: "absolute", left: 32, right: 32, bottom: 26, display: "flex", alignItems: "center", gap: 12, color: C.text3, fontSize: 21 }}>
          <Icon name="zap" size={22} color={C.ocean} /> Pre-filled from data the airline already holds
        </div>
      </Card>
    </div>
  );
}
