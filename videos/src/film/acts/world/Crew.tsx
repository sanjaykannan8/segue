import { C, R, STATUS, alpha, type Status } from "../../../tokens";
import { Avatar, Badge, Card, Icon } from "../../../ui/arc";
import { ease, rise } from "../../anim";
import { b } from "../../cues";
import { CREW } from "./layout";

const ROWS: { seat: string; name: string; initials: string; to: string; left: string; status: Status }[] = [
  { seat: "12A", name: "Priya Sharma", initials: "PS", to: "BA 108 · London", left: "50 min", status: "risk" },
  { seat: "12C", name: "Omar Khalid", initials: "OK", to: "BA 108 · London", left: "50 min", status: "risk" },
  { seat: "19F", name: "Lena Müller", initials: "LM", to: "QF 2 · Sydney", left: "64 min", status: "tight" },
  { seat: "27D", name: "Wei Chen", initials: "WC", to: "CX 732 · Hong Kong", left: "71 min", status: "tight" },
];

/** 03 Prioritize: the cabin crew's priority deplaning list, before landing. */
export function Crew({ t }: { t: number }) {
  const show = rise(t, b(7, 3), b(9, 2), 40, 12);
  if (!show.visible) return null;
  const highlight = ease(t, b(8, 3), 0.3);
  return (
    <div style={{ position: "absolute", left: CREW.x - CREW.w / 2, top: CREW.y - CREW.h / 2, width: CREW.w, opacity: show.opacity, filter: show.filter }}>
      <Card shadow="floating" style={{ width: CREW.w, height: CREW.h }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20, padding: "30px 38px 24px" }}>
          <div style={{ width: 64, height: 64, borderRadius: R.pill, display: "grid", placeItems: "center", background: alpha(C.ocean, 0.1), color: C.ocean, border: `1.5px solid ${alpha(C.ocean, 0.25)}` }}>
            <Icon name="door" size={32} />
          </div>
          <div style={{ display: "grid", flex: 1 }}>
            <span style={{ fontSize: 38, fontWeight: 600, letterSpacing: "-0.02em" }}>Priority deplaning</span>
            <span style={{ fontSize: 24, color: C.text2 }}>EK 512 · lands 14:05 · Door L1</span>
          </div>
          <Badge status="info" icon="users" label="4 to call first" s={1.1} />
        </div>
        <div style={{ display: "grid", padding: "0 22px" }}>
          {ROWS.map((row, i) => {
            const r = rise(t, b(8, 1, 0.1 + i * 0.5), Infinity, 30, 10);
            const hot = i === 0 ? highlight : 0;
            return (
              <div
                key={row.seat}
                style={{
                  display: "grid",
                  gridTemplateColumns: "70px 74px 1fr 300px 150px 180px",
                  alignItems: "center",
                  gap: 10,
                  height: 116,
                  padding: "0 16px",
                  borderTop: `1.5px solid ${C.border}`,
                  borderRadius: hot ? R.control : 0,
                  background: alpha(STATUS.risk.color, 0.08 * hot),
                  opacity: r.opacity,
                  translate: r.translate,
                  filter: r.filter,
                }}
              >
                <span style={{ fontSize: 30, fontWeight: 600, color: C.text3, fontVariantNumeric: "tabular-nums" }}>{i + 1}</span>
                <Avatar initials={row.initials} size={62} />
                <div style={{ display: "grid" }}>
                  <span style={{ fontSize: 29, fontWeight: 600 }}>{row.name}</span>
                  <span style={{ fontSize: 22, color: C.text2 }}>Seat {row.seat}</span>
                </div>
                <span style={{ fontSize: 25, color: C.text2 }}>{row.to}</span>
                <span style={{ fontSize: 25, color: C.fg, fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>{row.left}</span>
                <Badge status={row.status} s={1.05} />
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
