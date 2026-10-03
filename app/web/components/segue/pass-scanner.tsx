"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/arc/button/button";
import { parseBcbp, type Bcbp } from "@/lib/bcbp";
import { Mascot } from "./ui";
import styles from "@/app/(passenger)/passenger.module.css";

type Phase = "idle" | "starting" | "scanning" | "error";

/**
 * Reads the boarding pass barcode (PDF417, Aztec or QR) with the camera. The video never leaves the device:
 * frames are decoded in the browser and only the parsed flight fields are handed back.
 */
export function PassScanner({ onScan }: { onScan: (pass: Bcbp) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const onScanRef = useRef(onScan);
  useEffect(() => { onScanRef.current = onScan; });
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState("");
  const [hint, setHint] = useState("Hold the barcode inside the frame.");
  const active = phase === "starting" || phase === "scanning";

  useEffect(() => {
    if (!active) return;
    let stopped = false;
    let stop: (() => void) | undefined;

    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("no-camera");
        const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([import("@zxing/browser"), import("@zxing/library")]);
        if (stopped || !video.current) return;
        const hints = new Map<unknown, unknown>([[DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.PDF_417, BarcodeFormat.AZTEC, BarcodeFormat.QR_CODE]]]);
        const reader = new BrowserMultiFormatReader(hints as ConstructorParameters<typeof BrowserMultiFormatReader>[0]);
        const controls = await reader.decodeFromConstraints({ audio: false, video: { facingMode: { ideal: "environment" } } }, video.current, (result) => {
          if (stopped || !result) return;
          const pass = parseBcbp(result.getText());
          if (!pass) { setHint("That code isn't a boarding pass. Try the long barcode on your pass."); return; }
          stopped = true;
          controls.stop();
          setPhase("idle");
          onScanRef.current(pass);
        });
        stop = () => controls.stop();
        if (stopped) controls.stop();
        else setPhase("scanning");
      } catch (error) {
        if (stopped) return;
        const name = error instanceof Error ? error.name : "";
        setMessage(
          name === "NotAllowedError" ? "Camera access is off. Allow it in your browser, or type your flights in."
            : name === "NotFoundError" || (error instanceof Error && error.message === "no-camera") ? "We couldn't find a camera on this device. Type your flights in instead."
              : "The camera didn't start. Try again, or type your flights in.",
        );
        setPhase("error");
      }
    })();

    return () => { stopped = true; stop?.(); };
  }, [active]);

  if (!active) {
    return (
      <div className={styles.cameraIdle}>
        <Mascot pose="look_left" size={72} />
        <p className={styles.muted}>{phase === "error" ? message : "Point your camera at the barcode on your boarding pass. Nothing is recorded."}</p>
        <Button type="button" variant="secondary" onClick={() => { setHint("Hold the barcode inside the frame."); setPhase("starting"); }}>
          {phase === "error" ? "Try the camera again" : "Open camera"}
        </Button>
      </div>
    );
  }

  return (
    <div className={styles.stack}>
      <div className={styles.camera}>
        <video ref={video} muted playsInline aria-label="Camera preview" />
        <p className={styles.cameraHint} role="status">{phase === "starting" ? "Starting the camera…" : hint}</p>
      </div>
      <Button type="button" variant="ghost" onClick={() => setPhase("idle")}>Stop camera</Button>
    </div>
  );
}
