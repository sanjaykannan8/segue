"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/arc/alert/alert";
import { Button } from "@/components/arc/button/button";
import { PasswordField } from "@/components/arc/password-field/password-field";
import { StaffHeading } from "@/components/segue/staff-shell";
import { Panel, PanelHeader } from "@/components/segue/ui";
import { api, errorMessage } from "@/lib/api";

export default function AccountPage() {
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function change(event: FormEvent) {
    event.preventDefault();
    setError(null); setDone(false);
    if (next.length < 12) { setError("Use at least 12 characters for the new password."); return; }
    setBusy(true);
    try {
      await api.changePassword(current, next);
      setCurrent(""); setNext(""); setDone(true);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally { setBusy(false); }
  }

  async function signOutEverywhere() {
    setBusy(true);
    try { await api.logoutEverywhere(); } catch { /* the session is dropped locally either way */ }
    router.replace("/login");
  }

  return (
    <>
      <StaffHeading title="Your account" hint="Change your password, or sign out on every device." />
      <Panel>
        <PanelHeader title="Change password" hint="Changing it signs you out on every other device." />
        <form onSubmit={change} noValidate style={{ display: "grid", gap: "var(--space-4)", maxWidth: 420 }}>
          <PasswordField label="Current password" autoComplete="current-password" value={current} onChange={(event) => setCurrent(event.target.value)} required />
          <PasswordField label="New password" description="At least 12 characters." autoComplete="new-password" value={next} onChange={(event) => setNext(event.target.value)} required />
          {error ? <Alert tone="danger" title="Password not changed">{error}</Alert> : null}
          {done ? <Alert tone="success" title="Password changed">Other devices have been signed out.</Alert> : null}
          <div><Button type="submit" loading={busy}>Change password</Button></div>
        </form>
      </Panel>
      <Panel>
        <PanelHeader title="Sign out everywhere" hint="Ends your session on this and every other device at once." />
        <Button variant="ghost" onClick={() => void signOutEverywhere()} disabled={busy}>Sign out everywhere</Button>
      </Panel>
    </>
  );
}
