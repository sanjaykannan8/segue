"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Clock, Database, ShieldCheck } from "lucide-react";
import { Button } from "@/components/arc/button/button";
import { Badge } from "@/components/arc/badge/badge";
import { Checkbox } from "@/components/arc/checkbox/checkbox";
import { Input } from "@/components/arc/input/input";
import { Select } from "@/components/arc/select/select";
import { TextReveal } from "@/components/arc/text-reveal/text-reveal";
import { PassengerShell } from "@/components/segue/passenger-shell";
import { ErrorState, FormError, LoadingPanel, Mascot, Panel, PanelHeader } from "@/components/segue/ui";
import { api, isStatus, useResource, type Language, type Purpose } from "@/lib/api";
import { LANGUAGES, noticeSummary } from "@/lib/notice";
import styles from "./passenger.module.css";

const POINT_ICON = { collect: Database, retention: Clock, rights: ShieldCheck } as const;

function Hero() {
  return (
    <div className={styles.hero}>
      <Mascot pose="happy" size={104} />
      <TextReveal as="h1" text="Segue watches your connection" className={styles.heroTitle} />
      <p className={styles.heroLine}>Add your two flights and we&apos;ll tell you if you&apos;ll make it, and where to go.</p>
    </div>
  );
}

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
  const policyHref = `/privacy-policy?lang=${language}`;

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
      <PassengerShell title="Segue watches your connection" hero={<Hero />}>
        <LoadingPanel label="Checking your session" lines={3} />
      </PassengerShell>
    );
  }

  const points = data ? noticeSummary(data) : [];

  return (
    <PassengerShell title="Segue watches your connection" hero={<Hero />}>
      {notice.loading ? <LoadingPanel label="Loading the privacy notice" lines={6} /> : null}
      {!notice.loading && !data ? <ErrorState error={notice.error} onRetry={() => void notice.reload()} title="The privacy notice didn't load" /> : null}

      {data ? (
        <>
          <Panel>
            <PanelHeader title="Your data, in short" hint={data.intro} />
            {points.length ? (
              <ul className={styles.points}>
                {points.map((point) => {
                  const Icon = POINT_ICON[point.id as keyof typeof POINT_ICON] ?? ShieldCheck;
                  return (
                    <li key={point.id} className={styles.point}>
                      <span className={styles.pointIcon}><Icon width={18} height={18} aria-hidden="true" /></span>
                      <div>
                        <p className={styles.pointHead}>{point.heading}</p>
                        <p className={styles.pointLine}>{point.line}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : null}
            <Link href={policyHref} className={styles.policyLink}>
              Read the full privacy policy <ArrowRight width={16} height={16} aria-hidden="true" />
            </Link>
          </Panel>

          <form onSubmit={submit} className={styles.stack} noValidate>
            <Panel>
              <PanelHeader title="Your choices" hint="Nothing is ticked for you. You can change these later." />
              <p className={styles.noticeRef}>
                You are agreeing to <Link href={policyHref}>privacy notice version {data.version}</Link>.
              </p>
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
                <Select label="Language" value={language} onValueChange={(value) => setLanguage(value as Language)} options={LANGUAGES} />
                <Input label="Name (optional)" name="name" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} />
                <Input label="Phone (optional)" name="phone" type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} description="Used only if you choose to get updates." />
                <Checkbox label="I am 18 or older" checked={adult} onCheckedChange={(state) => setAdult(state === true)} aria-required />
                {touched && !adult ? <p className={styles.fieldError} role="alert" style={{ marginTop: 0 }}>Confirm you are 18 or older to continue.</p> : null}
              </div>
            </Panel>

            <FormError error={isStatus(submitError, 400) ? new Error("Tick the required choice and confirm your age to continue.") : submitError} />
            <Button type="submit" size="lg" loading={submitting} className={styles.full}>Agree and continue</Button>
          </form>
          <p className={styles.quietLink}>Already added your trip on another device? <Link href="/claim">Enter your code</Link></p>
        </>
      ) : null}
    </PassengerShell>
  );
}
