"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import Link from "next/link";
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
import { DeviceLinkButton } from "@/components/segue/device-link";
import { PassengerShell } from "@/components/segue/passenger-shell";
import { useToast } from "@/components/segue/toasts";
import { ErrorState, Fact, FormError, LoadingPanel, Ltr, Mascot, Panel, PanelHeader } from "@/components/segue/ui";
import { api, isStatus, useResource, type Language, type Me, type Purpose } from "@/lib/api";
import { humanize } from "@/lib/format";
import { EmailVerify } from "@/components/segue/email-verify";
import { asLanguage, LANGUAGE_OPTIONS, useFormat, useI18n, useT } from "@/lib/i18n";
import styles from "../passenger.module.css";

const PURPOSES: Purpose[] = ["tracking", "notifications", "assistance", "authority_share"];

const granted = (me: Me, purpose: Purpose) => me.consents.some((c) => c.purpose === purpose && !c.withdrawn_at);

function DetailsForm({ me, onSaved }: { me: Me; onSaved: (me: Me) => void }) {
  const { t, lang, setLanguage } = useI18n();
  const notify = useToast();
  const [name, setName] = useState(me.name ?? "");
  const [phone, setPhone] = useState(me.phone ?? "");
  const [email, setEmail] = useState(me.email ?? "");
  const [language, setLang] = useState<Language>(asLanguage(me.language) ?? lang);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const canEmail = granted(me, "notifications");

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      // Email is stored only with the "updates" consent; without it the field is left out so nothing is refused.
      const next = await api.updateMyData({ name: name.trim(), phone: phone.trim(), language, ...(canEmail || email.trim() !== (me.email ?? "") ? { email: email.trim() } : {}) });
      setLanguage(language);
      onSaved(next);
      notify(t("privacy.saved"));
    } catch (caught) { setError(caught); } finally { setSaving(false); }
  }

  return (
    <form className={styles.fields} onSubmit={save} noValidate>
      <Input label={t("privacy.name")} autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} />
      <Input label={t("privacy.phone")} type="tel" inputMode="tel" autoComplete="tel" dir="ltr" value={phone} onChange={(event) => setPhone(event.target.value)} />
      <Input label={t("privacy.email")} type="email" inputMode="email" autoComplete="email" dir="ltr" value={email} onChange={(event) => setEmail(event.target.value)} description={t("privacy.emailHint")} />
      <Select label={t("lang.label")} value={language} onValueChange={(value) => { const next = asLanguage(value); if (next) setLang(next); }} options={LANGUAGE_OPTIONS} />
      {/* A 403 here is the API saying email needs the updates consent; its message is shown as given. */}
      <FormError error={error} />
      <Button type="submit" variant="secondary" loading={saving}>{t("privacy.save")}</Button>
    </form>
  );
}

function GrievanceForm({ onSent }: { onSent: () => void }) {
  const t = useT();
  const notify = useToast();
  const id = useId();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!message.trim()) { setError(new Error(t("privacy.complaintEmpty"))); return; }
    setBusy(true);
    setError(null);
    try {
      await api.grievance(message.trim());
      setMessage("");
      notify(t("privacy.complaintSent"), t("privacy.complaintSentBody"));
      onSent();
    } catch (caught) { setError(caught); } finally { setBusy(false); }
  }

  return (
    <form className={styles.fields} onSubmit={send} noValidate>
      <div>
        <label className={styles.label} htmlFor={id}>{t("privacy.complaintLabel")}</label>
        <textarea id={id} className={styles.textarea} value={message} onChange={(event) => setMessage(event.target.value)} maxLength={2000} aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : undefined} />
      </div>
      <FormError error={error} id={`${id}-error`} />
      <Button type="submit" variant="secondary" loading={busy}>{t("privacy.complaintSend")}</Button>
    </form>
  );
}

function NomineeForm({ onSent }: { onSent: () => void }) {
  const t = useT();
  const notify = useToast();
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || !contact.trim()) { setError(new Error(t("privacy.nomineeEmpty"))); return; }
    setBusy(true);
    setError(null);
    try {
      await api.nominee(name.trim(), contact.trim());
      setName("");
      setContact("");
      notify(t("privacy.nomineeSaved"));
      onSent();
    } catch (caught) { setError(caught); } finally { setBusy(false); }
  }

  return (
    <form className={styles.fields} onSubmit={send} noValidate>
      <Input label={t("privacy.nomineeName")} autoComplete="off" value={name} onChange={(event) => setName(event.target.value)} />
      <Input label={t("privacy.nomineeContact")} autoComplete="off" value={contact} onChange={(event) => setContact(event.target.value)} />
      <FormError error={error} />
      <Button type="submit" variant="secondary" loading={busy}>{t("privacy.nomineeSave")}</Button>
    </form>
  );
}

export default function PrivacyPage() {
  const router = useRouter();
  const t = useT();
  const format = useFormat();
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
      notify(t("privacy.deleted"));
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
      notify(t("privacy.downloadFailed"), format.error(caught));
    } finally { setDownloading(false); }
  }

  const data = me.data;
  const title = t("title.privacy");

  if (me.loading || noSession) {
    return <PassengerShell pageTitle={title} title={title}><LoadingPanel label={t("privacy.loading")} lines={5} /></PassengerShell>;
  }
  if (!data) {
    return <PassengerShell pageTitle={title} title={title}><ErrorState error={me.error} onRetry={() => void me.reload()} /></PassengerShell>;
  }

  const language = LANGUAGE_OPTIONS.find((option) => option.value === data.language)?.label ?? data.language;

  return (
    <PassengerShell pageTitle={title} title={title} intro={<>{t("privacy.intro")} <Link href="/privacy-policy">{t("privacy.readPolicy")}</Link></>}>
      <EmailVerify me={data} onChange={() => void me.reload()} />
      <Panel>
        <PanelHeader title={t("privacy.hold")} />
        <dl className={styles.facts}>
          <Fact label={t("privacy.name")}>{data.name || t("privacy.notGiven")}</Fact>
          <Fact label={t("privacy.phone")}>{data.phone ? <Ltr>{data.phone}</Ltr> : t("privacy.notGiven")}</Fact>
          <Fact label={t("privacy.email")}>{data.email ? <Ltr>{data.email}</Ltr> : t("privacy.notGiven")}</Fact>
          <Fact label={t("lang.label")}>{language}</Fact>
          <Fact label={t("privacy.trip")}>{t(data.has_itinerary ? "privacy.tripOne" : "privacy.tripNone")}</Fact>
          <Fact label={t("privacy.id")}><Ltr>{data.principal_id}</Ltr></Fact>
        </dl>
        <div className={styles.fields} style={{ marginTop: "var(--space-5)" }}>
          <Button variant="secondary" onClick={download} loading={downloading} className={styles.full}>
            <Download width={16} height={16} aria-hidden="true" /> {t("privacy.download")}
          </Button>
          <DeviceLinkButton className={styles.full} />
        </div>
      </Panel>

      <Panel>
        <PanelHeader title={t("privacy.edit")} />
        <DetailsForm key={`${data.name}|${data.phone}|${data.email}|${data.language}|${granted(data, "notifications")}`} me={data} onSaved={me.setData} />
      </Panel>

      <Panel>
        <PanelHeader title={t("privacy.choices")} hint={t("privacy.choicesHint")} />
        <div>
          {PURPOSES.map((id) => {
            const on = granted(data, id);
            const record = data.consents.find((c) => c.purpose === id);
            return (
              <div key={id} className={styles.switchRow}>
                <div className={styles.switchCopy}>
                  <p className={styles.switchTitle} id={`purpose-${id}`}>{t(`purpose.${id}`)}</p>
                  <p className={styles.switchHint} id={`purpose-${id}-hint`}>{t(`purpose.${id}.hint`)}</p>
                  <p className={styles.switchHint}>
                    {on && record ? t("privacy.onSince", { date: format.dateTime(record.granted_at) }) : record?.withdrawn_at ? t("privacy.offSince", { date: format.dateTime(record.withdrawn_at) }) : t("privacy.off")}
                  </p>
                </div>
                {/* The control keeps its left-to-right travel; its name and hint come from the text beside it. */}
                <span dir="ltr">
                  <Switch checked={on} disabled={pending !== null} onCheckedChange={(next) => void setConsent(id, next)} aria-label={t(`purpose.${id}`)} aria-describedby={`purpose-${id}-hint`} />
                </span>
              </div>
            );
          })}
        </div>
        <FormError error={consentError} />
      </Panel>

      <Panel>
        <PanelHeader title={t("privacy.complaint")} hint={t("privacy.complaintHint")} />
        <GrievanceForm onSent={() => void requests.reload()} />
      </Panel>

      <Panel>
        <PanelHeader title={t("privacy.nominee")} hint={t("privacy.nomineeHint")} />
        <NomineeForm onSent={() => void requests.reload()} />
      </Panel>

      <Panel>
        <PanelHeader title={t("privacy.requests")} />
        {requests.loading ? <Skeleton label={t("privacy.requestsLoading")} lines={2} /> : null}
        {!requests.loading && !requests.data ? <ErrorState compact error={requests.error} onRetry={() => void requests.reload()} title={t("privacy.requestsError")} /> : null}
        {requests.data && requests.data.length === 0 ? (
          <EmptyState icon={<Mascot pose="sleepy" size={40} />} title={t("privacy.noRequests")} description={t("privacy.noRequestsBody")} />
        ) : null}
        {requests.data && requests.data.length > 0 ? (
          <ul className={styles.requests}>
            {requests.data.map((request) => (
              <li key={request.id} className={styles.request}>
                <div>
                  <p>{request.type === "grievance" || request.type === "nominee" ? t(`request.${request.type}`) : humanize(request.type)}</p>
                  <p className={styles.requestMeta}>
                    {t("privacy.opened", { date: format.dateTime(request.opened_at) })}{request.closed_at ? ` · ${t("privacy.closed", { date: format.dateTime(request.closed_at) })}` : ""}
                  </p>
                </div>
                <Badge size="sm" tone={request.closed_at ? "neutral" : "info"}>{request.status === "open" || request.status === "closed" ? t(`reqStatus.${request.status}`) : humanize(request.status)}</Badge>
              </li>
            ))}
          </ul>
        ) : null}
      </Panel>

      <Panel className={styles.danger}>
        <PanelHeader title={t("privacy.delete")} hint={t("privacy.deleteHint")} />
        <Button variant="danger" onClick={() => { setDialogError(null); setConfirmDelete(true); }} className={styles.full}>{t("privacy.delete")}</Button>
      </Panel>

      <Dialog open={confirmWithdraw} onOpenChange={(open) => { if (!working) setConfirmWithdraw(open); }}>
        <DialogContent title={t("privacy.stopAsk")} description={t("privacy.stopDesc")}>
          <FormError error={dialogError} />
          <div className={styles.dialogActions}>
            <DialogClose asChild><Button variant="secondary" disabled={working}>{t("privacy.keep")}</Button></DialogClose>
            <Button variant="danger" loading={working} onClick={() => void endEverything(() => api.withdrawConsent("tracking"))}>{t("privacy.stopConfirm")}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmDelete} onOpenChange={(open) => { if (!working) setConfirmDelete(open); }}>
        <DialogContent title={t("privacy.deleteAsk")} description={t("privacy.deleteDesc")}>
          <FormError error={dialogError} />
          <div className={styles.dialogActions}>
            <DialogClose asChild><Button variant="secondary" disabled={working}>{t("common.cancel")}</Button></DialogClose>
            <Button variant="danger" loading={working} onClick={() => void endEverything(api.deleteMe)}>{t("privacy.delete")}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </PassengerShell>
  );
}
