import { b } from "../../cues";

/** World positions (px at zoom 1). Each scene lives in its own spot; the camera travels between them. */
export const PHONE = { x: 0, y: 0, w: 470, h: 960 };
export const CREW = { x: -140, y: 1560, w: 1220, h: 680 };
export const OPS = { x: 2300, y: 130, w: 1500, h: 820 };
export const BAGS = { left: 1555, top: 1130, w: 720, h: 650, gap: 50 };
export const STRIP = { y: 3120, x0: -700, step: 660, w: 560, h: 380 };

/** Scene windows inside the world act. */
export const W = {
  scan: b(4, 1),
  scanned: b(5, 1),
  card: b(5, 2),
  delay: b(6, 1),
  tight: b(6, 3),
  risk: b(6, 4),
  crew: b(8, 1),
  chat: b(9, 1),
  route: b(10, 1),
  ops: b(11, 1),
  approve: b(12, 2),
  bags: b(13, 1),
  wide: b(15, 1),
  boarded: b(15, 3),
  features: b(17, 1),
  end: b(19, 1),
} as const;
