"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Download } from "lucide-react";
import { Badge } from "@/components/arc/badge/badge";
import { Button } from "@/components/arc/button/button";
import { Dialog, DialogClose, DialogContent } from "@/components/arc/dialog/dialog";
import { EmptyState } from "@/components/arc/empty-state/empty-state";
import { Input } from "@/components/arc/input/input";
import { Select } from "@/components/arc/select/select";
import { Skeleton } from "@/components/arc/skeleton/skeleton";
import { Switch } from "@/components/arc/switch/switch";
import { HeaderLink, PassengerShell } from "@/components/segue/passenger-shell";
import { useToast } from "@/components/segue/toasts";
import { ErrorState, Fact, FormError, LoadingPanel, Mascot, Panel, PanelHeader } from "@/components/segue/ui";
import { api, errorMessage, isStatus, useResource, type Language, type Me, type Purpose } from "@/lib/api";
import { formatDateTime, humanize, PURPOSE_LABEL } from "@/lib/format";
import styles from "../passenger.module.css";

const PURPOSES: { id: Purpose; hint: string }[] = [
  { id: "tracking", hint: "Required. Turning this off deletes everything and ends your session." },
  { id: "notifications", hint: "Messages about your connection." },
  { id: "assistance", hint: "Your assistance need, shared only with ops, crew and ground staff." },
  { id: "authority_share", hint: "Lets us ask the airport for fast-track. The airport decides." },
];
const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "hi", label: "हिन्दी (Hindi)" },
];

const granted = (me: Me, purpose: Purpose) => me.consents.some((c) => c.purpose === purpose && !c.withdrawn_at);

function DetailsForm({ me, onSaved }: { me: Me; onSaved: (me: Me) => void }) {
  const notify = useToast();
  const [name, setName] = useState(me.name ?? "");
  const [phone, setPhone] = useState(me.phone ?? "");
  const [language, setLanguage] = useState<Language>(me.language === "hi" ? "hi" : "en");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      onSaved(await api.updateMyData({ name: name.trim(), phone: phone.trim(), language }));
      notify("Details saved");
    } catch (caught) { setError(caught); } finally { setSaving(false); }
  }

  return (
    <form className={styles.fields} onSubmit={save}>
      <Input label="Name" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} />
      <Input label="Phone" type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} />
      <Select label="Language" value={language} onValueChange={(value) => setLanguage(value as Language)} options={LANGUAGES} />
      <FormError error={error} />
      <Button type="submit" variant="secondary" loading={saving}>Save changes</Button>
    </form>
  );
}

function GrievanceForm({ onSent }: { onSent: () => void }) {
  const notify = useToast();
  const id = useId();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!message.trim()) { setError(new Error("Write a short message first.")); return; }
    setBusy(true);
    setError(null);
    try {
      await api.grievance(message.trim());
      setMessage("");
      notify("Complaint sent", "You can follow it under your requests.");
      onSent();
    } catch (caught) { setError(caught); } finally { setBusy(false); }
  }

  return (
    <form className={styles.fields} onSubmit={send}>
      <div>
        <label className={styles.label} htmlFor={id}>What went wrong?</label>
        <textarea id={id} className={styles.textarea} value={message} onChange={(event) => setMessage(event.target.value)} maxLength={2000} />
      </div>
      <FormError error={error} />
      <Button type="submit" variant="secondary" loading={busy}>Send complaint</Button>
    </form>
  );
}

function NomineeForm({ onSent }: { onSent: () => void }) {
  const notify = useToast();
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || !contact.trim()) { setError(new Error("Add your nominee's name and how to reach them.")); return; }
    setBusy(true);
    setError(null);
    try {
      await api.nominee(name.trim(), contact.trim());
      setName("");
      setContact("");
      notify("Nominee saved");
      onSent();
    } catch (caught) { setError(caught); } finally { setBusy(false); }
  }

  return (
    <form className={styles.fields} onSubmit={send}>
      <Input label="Nominee's name" autoComplete="off" value={name} onChange={(event) => setName(event.target.value)} />
      <Input label="Phone or email" autoComplete="off" value={contact} onChange={(event) => setContact(event.target.value)} />
      <FormError error={error} />
      <Button type="submit" variant="secondary" loading={busy}>Save nominee</Button>
    </form>
  );
}

export default function PrivacyPage() {
  const router = useRouter();
  const notify = useToast();
  const me = useResource(api.me);
  const requests = useResource(api.myRequests);
  const [pending, setPending] = useState<Purpose | null>(null);
  const [consentError, setConsentError] = useState<unknown>(null);
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [working, setWorking] = useState(false);
  const [dialogError, setDialogError] = useState<unknown>(null);
  const [downloading, setDownloading] = useState(false);

  const noSession = isStatus(me.error, 401);
  useEffect(() => { if (noSession) router.replace("/"); }, [noSession, router]);

  async function setConsent(purpose: Purpose, on: boolean) {
    if (purpose === "tracking" && !on) { setDialogError(null); setConfirmWithdraw(true); return; }
    setPending(purpose);
    setConsentError(null);
    try {
      me.setData(on ? await api.grantConsent(purpose) : await api.withdrawConsent(purpose));
    } catch (caught) { setConsentError(caught); } finally { setPending(null); }
  }

  async function endEverything(action: () => Promise<unknown>) {
    setWorking(true);
    setDialogError(null);
    try {
      await action();
      notify("Your data has been deleted");
      router.replace("/");
    } catch (caught) {
      setDialogError(caught);
      setWorking(false);
    }
  }

  async function download() {
    setDownloading(true);
    try {
      const data = await api.exportMyData();
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = "segue-my-data.json";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (caught) {
      notify("Download failed", errorMessage(caught));
    } finally { setDownloading(false); }
  }

  const data = me.data;
  const back = <HeaderLink href={data && !data.has_itinerary ? "/scan" : "/trip"}>{data && !data.has_itinerary ? "Add trip" : "Your trip"}</HeaderLink>;

  if (me.loading || noSession) {
    return <PassengerShell title="Your data"><LoadingPanel label="Loading your data" lines={5} /></PassengerShell>;
  }
  if (!data) {
    return <PassengerShell title="Your data"><ErrorState error={me.error} onRetry={() => void me.reload()} /></PassengerShell>;
  }

  return (
    <PassengerShell title="Your data" intro="See, change, download or delete what Segue holds about you." action={back}>
      <Panel>
        <PanelHeader title="What we hold" />
        <dl className={styles.facts}>
          <Fact label="Name">{data.name || "Not given"}</Fact>
          <Fact label="Phone">{data.phone || "Not given"}</Fact>
          <Fact label="Language">{data.language === "hi" ? "Hindi" : "English"}</Fact>
          <Fact label="Trip">{data.has_itinerary ? "One connection" : "None yet"}</Fact>
          <Fact label="Your Segue ID">{data.principal_id}</Fact>
        </dl>
        <div style={{ marginTop: "var(--space-5)" }}>
          <Button variant="secondary" onClick={download} loading={downloading} className={styles.full}>
            <Download width={16} height={16} aria-hidden="true" /> Download my data
          </Button>
        </div>
      </Panel>

      <Panel>
        <PanelHeader title="Edit your details" />
        <DetailsForm key={`${data.name}|${data.phone}|${data.language}`} me={data} onSaved={me.setData} />
      </Panel>

      <Panel>
        <PanelHeader title="Your choices" hint="Turn a purpose on or off at any time." />
        <div>
          {PURPOSES.map(({ id, hint }) => {
            const on = granted(data, id);
            const record = data.consents.find((c) => c.purpose === id);
            return (
              <div key={id} className={styles.switchRow}>
                <div className={styles.switchCopy}>
                  <p className={styles.switchTitle} id={`purpose-${id}`}>{PURPOSE_LABEL[id]}</p>
                  <p className={styles.switchHint}>{hint}</p>
                  <p className={styles.switchHint}>
                    {on && record ? `On since ${formatDateTime(record.granted_at)}` : record?.withdrawn_at ? `Off since ${formatDateTime(record.withdrawn_at)}` : "Off"}
                  </p>
                </div>
                <Switch checked={on} disabled={pending !== null} onCheckedChange={(next) => void setConsent(id, next)} aria-label={PURPOSE_LABEL[id]} />
              </div>
            );
          })}
        </div>
        <FormError error={consentError} />
      </Panel>

      <Panel>
        <PanelHeader title="Make a complaint" hint="Tell us if something about your data is wrong." />
        <GrievanceForm onSent={() => void requests.reload()} />
      </Panel>

      <Panel>
        <PanelHeader title="Name a nominee" hint="Someone who can use your data rights for you if you can't." />
        <NomineeForm onSent={() => void requests.reload()} />
      </Panel>

      <Panel>
        <PanelHeader title="Your requests" />
        {requests.loading ? <Skeleton label="Loading your requests" lines={2} /> : null}
        {!requests.loading && !requests.data ? <ErrorState compact error={requests.error} onRetry={() => void requests.reload()} title="Requests didn't load" /> : null}
        {requests.data && requests.data.length === 0 ? (
          <EmptyState icon={<Mascot pose="sleepy" size={40} />} title="No requests yet" description="Complaints and nominee requests you send will be listed here." label="No requests" />
        ) : null}
        {requests.data && requests.data.length > 0 ? (
          <ul className={styles.requests}>
            {requests.data.map((request) => (
              <li key={request.id} className={styles.request}>
                <div>
                  <p>{humanize(request.type)}</p>
                  <p className={styles.requestMeta}>
                    Opened {formatDateTime(request.opened_at)}{request.closed_at ? ` · closed ${formatDateTime(request.closed_at)}` : ""}
                  </p>
                </div>
                <Badge size="sm" tone={request.closed_at ? "neutral" : "info"}>{humanize(request.status)}</Badge>
              </li>
            ))}
          </ul>
        ) : null}
      </Panel>

      <Panel className={styles.danger}>
        <PanelHeader title="Delete everything" hint="Erases all your personal data and ends your session. This can't be undone." />
        <Button variant="danger" onClick={() => { setDialogError(null); setConfirmDelete(true); }} className={styles.full}>Delete everything</Button>
      </Panel>

      <Dialog open={confirmWithdraw} onOpenChange={(open) => { if (!working) setConfirmWithdraw(open); }}>
        <DialogContent title="Stop tracking your connection?" description="Tracking is what Segue runs on. Turning it off deletes everything we hold about you and ends your session.">
          <FormError error={dialogError} />
          <div className={styles.dialogActions}>
            <DialogClose asChild><Button variant="secondary" disabled={working}>Keep tracking</Button></DialogClose>
            <Button variant="danger" loading={working} onClick={() => void endEverything(() => api.withdrawConsent("tracking"))}>Stop and delete</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmDelete} onOpenChange={(open) => { if (!working) setConfirmDelete(open); }}>
        <DialogContent title="Delete everything?" description="All your personal data is erased and you are signed out. This can't be undone.">
          <FormError error={dialogError} />
          <div className={styles.dialogActions}>
            <DialogClose asChild><Button variant="secondary" disabled={working}>Cancel</Button></DialogClose>
            <Button variant="danger" loading={working} onClick={() => void endEverything(api.deleteMe)}>Delete everything</Button>
          </div>
        </DialogContent>
      </Dialog>
    </PassengerShell>
  );
}
