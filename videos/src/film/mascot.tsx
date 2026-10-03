import { Img, staticFile } from "remotion";
import type { CSSProperties } from "react";

import { track, type SpringConfig } from "../kit/spring";
import { clamp01 } from "../kit/time";
import { BAR } from "./cues";
import { swap } from "./anim";

export type Pose = "wink" | "cookie" | "code" | "dizzy_tilt" | "dizzy" | "sleepy" | "alert" | "happy" | "mail" | "calm" | "look_right" | "look_left";
export const POSES: Pose[] = ["wink", "cookie", "code", "dizzy_tilt", "dizzy", "sleepy", "alert", "happy", "mail", "calm", "look_right", "look_left"];

export const mascotSrc = (pose: Pose) => staticFile(`mascot/${pose}.png`);

/**
 * The cloud mascot, driven by t. Pose changes cross-fade under a squash and
 * stretch; it floats slowly. (x, y) is its center.
 */
export function Mascot({ t, poses, x, y, size, rot = 0, phase = 0, live = 1, style }: { t: number; poses: readonly (readonly [number, Pose])[]; x: number; y: number; size: number; rot?: number; phase?: number; live?: number; style?: CSSProperties }) {
  const { current, previous, u, index } = swap(t, poses, 0.14);
  const since = t - poses[index][0];
  const squash = index > 0 && since < 0.5 ? Math.sin((Math.PI * since) / 0.5) * (1 - since / 0.5) : 0;
  // A slow float (one cycle every two bars). No beat bounce: the film stays calm.
  const bob = Math.sin(((t + phase) / (BAR * 2)) * Math.PI * 2) * size * 0.025 * live;
  const sx = 1 + 0.08 * squash;
  const sy = 1 - 0.09 * squash;
  const img = (pose: Pose, o: number) => <Img src={mascotSrc(pose)} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: o }} />;
  return (
    <div
      style={{
        position: "absolute",
        left: x - size / 2,
        top: y - size / 2 + bob,
        width: size,
        height: size,
        rotate: `${rot}deg`,
        scale: `${sx} ${sy}`,
        transformOrigin: "50% 85%",
        ...style,
      }}
    >
      {u < 1 ? img(previous, 1 - u) : null}
      {img(current, u)}
    </div>
  );
}

/** A mascot that leaps between keyed spots on an arc. Keys: [time, x, y, size]. */
const leapSpring: SpringConfig = { stiffness: 110, damping: 21 };
export function leapAt(t: number, keys: readonly (readonly [number, number, number, number])[], hop = 200) {
  const x = track(t, keys.map(([k, v]) => [k, v] as const), leapSpring);
  const y0 = track(t, keys.map(([k, , v]) => [k, v] as const), leapSpring);
  const size = track(t, keys.map(([k, , , v]) => [k, v] as const), leapSpring);
  let lift = 0;
  for (let i = 1; i < keys.length; i++) {
    const d = (t - keys[i][0]) / 0.8;
    if (d > 0 && d < 1) lift += Math.sin(Math.PI * d) * hop * (1 - clamp01(d - 0.6));
  }
  return { x, y: y0 - lift, size };
}
