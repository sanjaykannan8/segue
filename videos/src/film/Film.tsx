import { AbsoluteFill, Audio, staticFile } from "remotion";

import { TargetLog } from "../kit/debug";
import { useTime } from "../kit/time";
import { C, FONT } from "../tokens";
import { Intro } from "./acts/Intro";
import { Outro } from "./acts/Outro";
import { World } from "./acts/World";

export type FilmProps = { fps: number; debug: boolean; audio: boolean };

/** Layers, bottom to top: outro backdrop and acts, the world canvas, the intro (it zooms out over the world's entry). */
export function Film({ debug, audio }: FilmProps) {
  const t = useTime();
  return (
    <AbsoluteFill style={{ background: C.mist, fontFamily: FONT, overflow: "hidden" }}>
      <Outro t={t} />
      <World t={t} debug={debug} />
      <Intro t={t} />
      {audio ? <Audio src={staticFile("audio/segue-mix.wav")} /> : null}
      {debug ? <TargetLog /> : null}
    </AbsoluteFill>
  );
}
