"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/arc/button/button";
import { Input } from "@/components/arc/input/input";
import { Skeleton } from "@/components/arc/skeleton/skeleton";
import { formatCode } from "@/components/segue/device-link";
import { PassengerShell } from "@/components/segue/passenger-shell";
import { Mascot, Panel, PanelHeader } from "@/components/segue/ui";
import { api } from "@/lib/api";
import { asLanguage, useFormat, useI18n } from "@/lib/i18n";
import styles from "../passenger.module.css";

const clean = (value: string) => value.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 8);

export default function ClaimPage() {
  const router = useRouter();
  const { t, setLanguage } = useI18n();
  const format = useFormat();
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
      const language = asLanguage(me.language);
      if (language) setLanguage(language);
      router.replace(me.has_itinerary ? "/trip" : "/scan");
    } catch (caught) {
      // 404: wrong, used or expired. 429: too many tries. The API's own message says which.
      setError(`${format.error(caught)} ${t("claim.tryAgain")}`);
      setBusy(false);
      setAuto(false);
    }
  }, [router, setLanguage, format, t]);

  // A link from the first device carries the code. It is filled in, and the person presses the button:
  // opening a link must never switch someone into another session by itself.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    // The code travels after the #, which browsers never send to a server, so no log records it.
    const fragment = new URLSearchParams(window.location.hash.replace(/^#/, "")).get("code");
    const fromLink = clean(fragment ?? new URLSearchParams(window.location.search).get("code") ?? "");
    if (fromLink) {
      setCode(fromLink);
      // Drop the code from the address bar so it is not left in history.
      window.history.replaceState(null, "", "/claim");
    }
    setAuto(false);
  }, []);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (code.length !== 8) { setError(t("claim.lengthError")); return; }
    void claim(code);
  }

  return (
    <PassengerShell pageTitle={t("title.claim")} title={t("claim.title")} intro={t("claim.intro")}>
      <Panel>
        {auto ? (
          <Skeleton label={t("claim.opening")} lines={3} />
        ) : (
          <>
            <div className={styles.noticeHead}>
              <Mascot pose="look_left" size={56} />
              <PanelHeader title={t("claim.codeTitle")} hint={t("claim.codeHint")} />
            </div>
            <form className={styles.fields} onSubmit={submit} noValidate>
              <Input
                label={t("claim.label")}
                placeholder="ABCD-1234"
                autoComplete="one-time-code"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                inputMode="text"
                dir="ltr"
                maxLength={9}
                value={formatCode(code)}
                onChange={(event) => { setCode(clean(event.target.value)); setError(null); }}
                error={error ?? undefined}
                style={{ fontVariantNumeric: "tabular-nums", letterSpacing: ".12em", fontWeight: 600 }}
              />
              <Button type="submit" size="lg" loading={busy} className={styles.full}>{t("claim.submit")}</Button>
            </form>
          </>
        )}
      </Panel>
      <p className={styles.quietLink}>{t("claim.noCode")} <Link href="/">{t("claim.start")}</Link></p>
    </PassengerShell>
  );
}
