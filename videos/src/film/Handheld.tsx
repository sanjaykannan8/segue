import type { ReactNode } from "react";

import { ease, inOut } from "./anim";

/**
 * A screen-space camera for the acts that are not on the world canvas: one slow,
 * eased push over the act. No drift, roll, beat pulse or shake (user note: calm, focused).
 */
export function Handheld({ t, start, end, zoomFrom = 1, zoomTo = 1.04, children }: { t: number; start: number; end: number; zoomFrom?: number; zoomTo?: number; shakes?: number[]; amount?: number; children: ReactNode }) {
  const zoom = zoomFrom + (zoomTo - zoomFrom) * ease(t, start, end - start, inOut);
  return <div style={{ position: "absolute", inset: 0, scale: String(zoom), transformOrigin: "50% 50%" }}>{children}</div>;
}
