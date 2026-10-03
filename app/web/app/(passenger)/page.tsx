"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/arc/button/button";
import { Badge } from "@/components/arc/badge/badge";
import { Checkbox } from "@/components/arc/checkbox/checkbox";
import { Input } from "@/components/arc/input/input";
import { Select } from "@/components/arc/select/select";
import { PassengerShell } from "@/components/segue/passenger-shell";
import { ErrorState, FormError, LoadingPanel, Mascot, Panel, PanelHeader } from "@/components/segue/ui";
import { api, isStatus, useResource, type Language, type Purpose } from "@/lib/api";
import styles from "./passenger.module.css";

const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "hi", label: "हिन्दी (Hindi)" },
];

export default function ConsentPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [language, setLanguage] = useState<Language>("en");
  const [chosen, setChosen] = useState<Purpose[]>([]);
  const [adult, setAdult] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<unknown>(null);
  const [touched, setTouched] = useState(false);

  // A returning passenger goes straight to their trip.
  useEffect(() => {
    let alive = true;
    api.me()
      .then((me) => { if (alive) router.replace(me.has_itinerary ? "/trip" : "/scan"); })
      .catch(() => { if (alive) setChecking(false); });
    return () => { alive = false; };
  }, [router]);

  const notice = useResource(() => api.notice(language), { enabled: !checking, key: language });

  const toggle = (purpose: Purpose, on: boolean) => setChosen((current) => (on ? [...new Set([...current, purpose])] : current.filter((p) => p !== purpose)));

  const data = notice.data;
  const required = data?.purposes.filter((p) => p.required).map((p) => p.id) ?? ["tracking"];
  const missingRequired = required.some((id) => !chosen.includes(id));
  const blocked = missingRequired || !adult;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (!data || blocked) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await api.consent({
        notice_version: data.version,
        purposes: chosen,
        language,
        adult: true,
        ...(name.trim() ? { name: name.trim() } : {}),
        ...(phone.trim() ? { phone: phone.trim() } : {}),
      });
      router.push("/scan");
    } catch (error) {
      setSubmitError(error);
      setSubmitting(false);
    }
  }

  if (checking) {
    return (
      <PassengerShell title="Welcome to Segue">
        <LoadingPanel label="Checking your session" lines={3} />
      </PassengerShell>
    );
  }

  return (
    <PassengerShell title={data?.title ?? "Before we start"} intro={data?.intro ?? "Segue watches your connection and tells you where to go."}>
      <Panel>
        <Select label="Language" value={language} onValueChange={(value) => setLanguage(value as Language)} options={LANGUAGES} />
      </Panel>

      {notice.loading ? <LoadingPanel label="Loading the privacy notice" lines={6} /> : null}
      {!notice.loading && !data ? <ErrorState error={notice.error} onRetry={() => void notice.reload()} title="The privacy notice didn't load" /> : null}

      {data ? (
        <>
          <Panel>
            <div className={styles.noticeHead}>
              <Mascot pose="look_right" size={56} />
              <PanelHeader title="How we use your data" hint={`Notice version ${data.version}`} />
            </div>
            <div className={styles.notice}>
              {data.sections.map((section) => (
                <section key={section.heading} className={styles.noticeSection}>
                  <h3>{section.heading}</h3>
                  <p>{section.body}</p>
                </section>
              ))}
            </div>
            <dl className={styles.noticeFacts}>
              <div><dt>We keep your data for</dt><dd>{data.retention_hours} hours</dd></div>
              <div><dt>Questions or complaints</dt><dd>{data.grievance_contact}</dd></div>
            </dl>
          </Panel>

          <form onSubmit={submit} className={styles.stack} noValidate>
            <Panel>
              <PanelHeader title="Your choices" hint="Nothing is ticked for you. You can change these later." />
              <ul className={styles.choices}>
                {data.purposes.map((purpose) => (
                  <li key={purpose.id} className={styles.choice}>
                    <Checkbox
                      label={purpose.title}
                      description={purpose.description}
                      checked={chosen.includes(purpose.id)}
                      onCheckedChange={(state) => toggle(purpose.id, state === true)}
                      aria-required={purpose.required || undefined}
                    />
                    <Badge size="sm" tone={purpose.required ? "info" : "neutral"}>{purpose.required ? "Required" : "Optional"}</Badge>
                  </li>
                ))}
              </ul>
              {touched && missingRequired ? <p className={styles.fieldError} role="alert">Tick the required choice to use Segue. Without it we can&apos;t track your connection.</p> : null}
            </Panel>

            <Panel>
              <PanelHeader title="About you" hint="Name and phone are optional." />
              <div className={styles.fields}>
                <Input label="Name (optional)" name="name" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} />
                <Input label="Phone (optional)" name="phone" type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} description="Used only if you choose to get updates." />
                <Checkbox label="I am 18 or older" checked={adult} onCheckedChange={(state) => setAdult(state === true)} aria-required />
                {touched && !adult ? <p className={styles.fieldError} role="alert">Confirm you are 18 or older to continue.</p> : null}
              </div>
            </Panel>

            <FormError error={isStatus(submitError, 400) ? new Error("Tick the required choice and confirm your age to continue.") : submitError} />
            <Button type="submit" size="lg" loading={submitting} className={styles.full}>Agree and continue</Button>
          </form>
        </>
      ) : null}
    </PassengerShell>
  );
}
