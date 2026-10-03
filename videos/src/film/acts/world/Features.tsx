import { Img } from "remotion";

import { C, R, SHADOW, alpha } from "../../../tokens";
import { Icon } from "../../../ui/arc";
import { inOut, rise } from "../../anim";
import { b } from "../../cues";
import { mascotSrc, type Pose } from "../../mascot";
import { STRIP } from "./layout";

export const FEATURES: { title: string; line: string; icon: string; pose: Pose }[] = [
  { title: "Living MCT", line: "Learns real connection times by terminal and hour.", icon: "brain", pose: "code" },
  { title: "Pre-rebooking", line: "Soft-holds a backup seat. Releases it if she makes it.", icon: "refresh", pose: "calm" },
  { title: "Gate-change alerts", line: "Re-routes the moment a gate moves.", icon: "pin", pose: "look_right" },
  { title: "Assistance on call", line: "Wheelchair or buggy sent to those who need it.", icon: "wheel", pose: "happy" },
  { title: "Group linking", line: "A family moves at the pace of its slowest member.", icon: "users", pose: "wink" },
  { title: "Wallet transfer pass", line: "A live pass in the phone's wallet. No app needed.", icon: "wallet", pose: "mail" },
  { title: "Their language", line: "Every message in the traveller's own language.", icon: "globe", pose: "cookie" },
  { title: "Hub analytics", line: "See where connections break, day by day.", icon: "chart", pose: "sleepy" },
];

/** The "more in Segue" strip the camera dollies past. Cards settle in as the camera reaches them. */
export function Features({ t, camX }: { t: number; camX: number }) {
  const show = rise(t, b(16, 3), b(19, 1) + 0.3, 40, 12);
  if (!show.visible) return null;
  const head = rise(t, b(17, 1) - 0.1, Infinity, 30, 12);
  return (
    <div style={{ position: "absolute", left: 0, top: 0, opacity: show.opacity }}>
      <div style={{ position: "absolute", left: STRIP.x0 - STRIP.w / 2, top: STRIP.y - STRIP.h / 2 - 150, fontSize: 64, fontWeight: 600, letterSpacing: "-0.03em", color: C.fg, whiteSpace: "nowrap", opacity: head.opacity, translate: head.translate, filter: head.filter }}>
        More in <span style={{ color: C.ocean }}>Segue</span>
      </div>
      {FEATURES.map((f, i) => {
        const x = STRIP.x0 + i * STRIP.step;
        // Each card settles in as the dolly brings it on screen.
        const p = inOut(Math.min(1, Math.max(0, (camX - (x - 1250)) / 520)));
        const bob = 0;
        return (
          <div
            key={f.title}
            style={{
              position: "absolute",
              left: x - STRIP.w / 2,
              top: STRIP.y - STRIP.h / 2 + bob + (i % 2 ? 50 : -10),
              width: STRIP.w,
              height: STRIP.h,
              scale: String(0.82 + 0.18 * p),
              opacity: Math.min(1, p * 1.4),
              rotate: `${(1 - p) * (i % 2 ? 2 : -2)}deg`,
              borderRadius: R.surface,
              border: `1.5px solid ${C.border}`,
              background: C.surface,
              boxShadow: SHADOW.floating,
              padding: "30px 34px",
              display: "grid",
              alignContent: "start",
              gap: 12,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ width: 62, height: 62, borderRadius: R.pill, display: "grid", placeItems: "center", background: alpha(C.ocean, 0.1), color: C.ocean, border: `1.5px solid ${alpha(C.ocean, 0.25)}` }}>
                <Icon name={f.icon} size={30} />
              </div>
              <Img src={mascotSrc(f.pose)} style={{ width: 120, height: 120, marginTop: -26, marginRight: -14, }} />
            </div>
            <span style={{ fontSize: 40, fontWeight: 600, letterSpacing: "-0.02em", marginTop: 6 }}>{f.title}</span>
            <span style={{ fontSize: 27, lineHeight: 1.3, color: C.text2 }}>{f.line}</span>
          </div>
        );
      })}
    </div>
  );
}
