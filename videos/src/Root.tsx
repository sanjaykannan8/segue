import { loadFont } from "@remotion/fonts";
import { Composition, staticFile } from "remotion";

import { DURATION } from "./film/cues";
import { Film, type FilmProps } from "./film/Film";
import { Tech } from "./tech/Tech";

loadFont({ family: "Instrument Sans", url: staticFile("fonts/InstrumentSans.ttf"), weight: "400 700" });

export function Root() {
  return (
    <>
    <Composition
      id="SegueTech"
      component={Tech}
      width={1920}
      height={1080}
      fps={60}
      durationInFrames={Math.round(DURATION * 60)}
      defaultProps={{ fps: 60, debug: false, audio: true } satisfies FilmProps}
      calculateMetadata={({ props }) => ({ fps: props.fps, durationInFrames: Math.round(DURATION * props.fps) })}
    />
    <Composition
      id="Segue"
      component={Film}
      width={1920}
      height={1080}
      fps={60}
      durationInFrames={Math.round(DURATION * 60)}
      defaultProps={{ fps: 60, debug: false, audio: true } satisfies FilmProps}
      calculateMetadata={({ props }) => ({ fps: props.fps, durationInFrames: Math.round(DURATION * props.fps) })}
    />
    </>
  );
}
