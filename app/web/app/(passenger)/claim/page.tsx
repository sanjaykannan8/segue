"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/arc/alert/alert";
import { Button } from "@/components/arc/button/button";
import { Input } from "@/components/arc/input/input";
import { Skeleton } from "@/components/arc/skeleton/skeleton";
import { formatCode } from "@/components/segue/device-link";
import { PassengerShell } from "@/components/segue/passenger-shell";
import { Mascot, Panel, PanelHeader } from "@/components/segue/ui";
import { api, errorMessage } from "@/lib/api";
import styles from "../passenger.module.css";

const clean = (value: string) => value.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 8);

export default function ClaimPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [auto, setAuto] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  const claim = useCallback(async (value: string) => {
    setBusy(true);
    setError(null);
    try {
      const me = await api.claimSession(value);
      router.replace(me.has_itinerary ? "/trip" : "/scan");
    } catch (caught) {
      // 404: wrong, used or expired. 429: too many tries. The API's own message says which.
      setError(errorMessage(caught));
      setBusy(false);
      setAuto(false);
    }
  }, [router]);

  // A link from the first device carries the code: claim it straight away, once.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const fromLink = clean(new URLSearchParams(window.location.search).get("code") ?? "");
    if (fromLink.length === 8) {
      setCode(fromLink);
      // Drop the code from the address bar so it is not left in history.
      window.history.replaceState(null, "", "/claim");
      void claim(fromLink);
    } else {
      if (fromLink) setCode(fromLink);
      setAuto(false);
    }
  }, [claim]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (code.length !== 8) { setError("The code has 8 letters and numbers."); return; }
    void claim(code);
  }

  return (
    <PassengerShell title="Open your trip here" intro="Enter the code shown on your other device.">
      <Panel>
        {auto ? (
          <Skeleton label="Opening your trip" lines={3} />
        ) : (
          <>
            <div className={styles.noticeHead}>
              <Mascot pose="look_left" size={56} />
              <PanelHeader title="Your code" hint="On your other device, open your trip and choose “Open on another device”." />
            </div>
            <form className={styles.fields} onSubmit={submit} noValidate>
              <Input
                label="8-character code"
                placeholder="ABCD-1234"
                autoComplete="one-time-code"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                inputMode="text"
                maxLength={9}
                value={formatCode(code)}
                onChange={(event) => { setCode(clean(event.target.value)); setError(null); }}
                style={{ fontVariantNumeric: "tabular-nums", letterSpacing: ".12em", fontWeight: 600 }}
              />
              {error ? <Alert tone="info" title="That code didn't work">{error} You can try again.</Alert> : null}
              <Button type="submit" size="lg" loading={busy} className={styles.full}>Open my trip</Button>
            </form>
          </>
        )}
      </Panel>
      <p className={styles.quietLink}>No code? <Link href="/">Start here</Link></p>
    </PassengerShell>
  );
}
