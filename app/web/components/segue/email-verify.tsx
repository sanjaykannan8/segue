"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/arc/button/button";
import { Input } from "@/components/arc/input/input";
import { Ltr, Panel, PanelHeader } from "@/components/segue/ui";
import { api, type Me } from "@/lib/api";
import { useFormat, useT } from "@/lib/i18n";

/**
 * Shown while the passenger's email address is not yet confirmed. Alerts are emailed only after the
 * owner of the address types back the code sent to it, so nobody can point Segue at someone else's inbox.
 */
export function EmailVerify({ me, onChange }: { me: Me | null | undefined; onChange: (next: Me) => void }) {
  const t = useT();
  const format = useFormat();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  if (!me?.email || me.email_verified) return null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (code.length !== 6) { setError(t("verify.length")); return; }
    setBusy(true); setError(null); setNote(null);
    try {
      onChange(await api.verifyEmail(code));
    } catch (caught) {
      setError(format.error(caught));
    } finally { setBusy(false); }
  }

  async function resend() {
    setBusy(true); setError(null); setNote(null);
    try {
      await api.resendEmailCode();
      setNote(t("verify.sent"));
    } catch (caught) {
      setError(format.error(caught));
    } finally { setBusy(false); }
  }

  return (
    <Panel label={t("verify.title")}>
      <PanelHeader title={t("verify.title")} hint={<>{t("verify.intro")} <Ltr>{me.email}</Ltr></>} />
      <form onSubmit={submit} noValidate style={{ display: "grid", gap: "var(--space-3)" }}>
        <Input
          label={t("verify.code")} dir="ltr" inputMode="numeric" autoComplete="one-time-code" maxLength={6}
          value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
          error={error ?? undefined} description={note ?? undefined}
        />
        <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap" }}>
          <Button type="submit" loading={busy}>{t("verify.confirm")}</Button>
          <Button type="button" variant="ghost" onClick={() => void resend()} disabled={busy}>{t("verify.resend")}</Button>
        </div>
      </form>
    </Panel>
  );
}
