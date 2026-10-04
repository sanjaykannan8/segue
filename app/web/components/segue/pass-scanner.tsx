"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/arc/button/button";
import { parseBcbp, type Bcbp } from "@/lib/bcbp";
import { useT, type Key } from "@/lib/i18n";
import { Mascot } from "./ui";
import styles from "@/app/(passenger)/passenger.module.css";

type Phase = "idle" | "starting" | "scanning" | "error";

/**
 * Reads the boarding pass barcode (PDF417, Aztec or QR) with the camera. The video never leaves the device:
 * frames are decoded in the browser and only the parsed flight fields are handed back.
 */
export function PassScanner({ onScan }: { onScan: (pass: Bcbp) => void }) {
  const t = useT();
  const video = useRef<HTMLVideoElement>(null);
  const onScanRef = useRef(onScan);
  useEffect(() => { onScanRef.current = onScan; });
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState<Key>("scanner.failed");
  const [hint, setHint] = useState<Key>("scanner.hint");
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
          if (!pass) { setHint("scanner.notPass"); return; }
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
        setMessage(name === "NotAllowedError" ? "scanner.denied" : name === "NotFoundError" || (error instanceof Error && error.message === "no-camera") ? "scanner.none" : "scanner.failed");
        setPhase("error");
      }
    })();

    return () => { stopped = true; stop?.(); };
  }, [active]);

  if (!active) {
    return (
      <div className={styles.cameraIdle}>
        <Mascot pose="look_left" size={72} />
        <p className={styles.muted} role={phase === "error" ? "alert" : undefined}>{t(phase === "error" ? message : "scanner.idle")}</p>
        <Button type="button" variant="secondary" onClick={() => { setHint("scanner.hint"); setPhase("starting"); }}>
          {t(phase === "error" ? "scanner.retry" : "scanner.open")}
        </Button>
      </div>
    );
  }

  return (
    <div className={styles.stack}>
      <div className={styles.camera}>
        <video ref={video} muted playsInline aria-label={t("scanner.preview")} />
        <p className={styles.cameraHint} role="status">{t(phase === "starting" ? "scanner.starting" : hint)}</p>
      </div>
      <Button type="button" variant="ghost" onClick={() => setPhase("idle")}>{t("scanner.stop")}</Button>
    </div>
  );
}
