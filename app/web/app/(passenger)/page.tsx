"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Clock, Database, ShieldCheck } from "lucide-react";
import { Button } from "@/components/arc/button/button";
import { Badge } from "@/components/arc/badge/badge";
import { Checkbox } from "@/components/arc/checkbox/checkbox";
import { Input } from "@/components/arc/input/input";
import SegmentedControl from "@/components/arc/segmented-control/segmented-control";
import { TextReveal } from "@/components/arc/text-reveal/text-reveal";
import { PassengerShell } from "@/components/segue/passenger-shell";
import { ErrorState, FormError, LoadingPanel, Mascot, Panel, PanelHeader } from "@/components/segue/ui";
import { api, isStatus, useResource, type Purpose } from "@/lib/api";
import { asLanguage, LANGUAGE_OPTIONS, useI18n } from "@/lib/i18n";
import { noticeSummary } from "@/lib/notice";
import styles from "./passenger.module.css";

const POINT_ICON = { collect: Database, retention: Clock, rights: ShieldCheck } as const;

function Hero() {
  const { t, lang, setLanguage } = useI18n();
  return (
    <div className={styles.hero}>
      <Mascot pose="happy" size={104} />
      {/* Keyed by language so the title is drawn again, whole, when the language changes. */}
      <TextReveal key={lang} as="h1" text={t("consent.title")} className={styles.heroTitle} />
      <p className={styles.heroLine}>{t("consent.line")}</p>
      <SegmentedControl options={LANGUAGE_OPTIONS} value={lang} onValueChange={(value) => { const next = asLanguage(value); if (next) setLanguage(next); }} label={t("lang.label")} />
    </div>
  );
}

export default function ConsentPage() {
  const router = useRouter();
  const { t, lang } = useI18n();
  const [checking, setChecking] = useState(true);
  const [chosen, setChosen] = useState<Purpose[]>([]);
  const [adult, setAdult] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
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

  const notice = useResource(() => api.notice(lang), { enabled: !checking, key: lang });

  const toggle = (purpose: Purpose, on: boolean) => setChosen((current) => (on ? [...new Set([...current, purpose])] : current.filter((p) => p !== purpose)));

  const data = notice.data;
  const required = data?.purposes.filter((p) => p.required).map((p) => p.id) ?? ["tracking"];
  const missingRequired = required.some((id) => !chosen.includes(id));
  const blocked = missingRequired || !adult;
  const wantsUpdates = chosen.includes("notifications");
  const policyHref = `/privacy-policy?lang=${lang}`;

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
        language: lang,
        adult: true,
        ...(name.trim() ? { name: name.trim() } : {}),
        ...(phone.trim() ? { phone: phone.trim() } : {}),
        ...(wantsUpdates && email.trim() ? { email: email.trim() } : {}),
      });
      router.push("/scan");
    } catch (error) {
      setSubmitError(error);
      setSubmitting(false);
    }
  }

  if (checking) {
    return (
      <PassengerShell pageTitle={t("title.home")} title={t("consent.title")} hero={<Hero />}>
        <LoadingPanel label={t("consent.checking")} lines={3} />
      </PassengerShell>
    );
  }

  const points = data ? noticeSummary(data) : [];

  return (
    <PassengerShell pageTitle={t("title.home")} title={t("consent.title")} hero={<Hero />}>
      {notice.loading ? <LoadingPanel label={t("consent.noticeLoading")} lines={6} /> : null}
      {!notice.loading && !data ? <ErrorState error={notice.error} onRetry={() => void notice.reload()} title={t("consent.noticeError")} /> : null}

      {data ? (
        <>
          <Panel>
            {/* The notice text arrives translated from the API and is shown as given. */}
            <div lang={data.lang} dir={data.dir}>
              <PanelHeader title={t("consent.shortTitle")} hint={data.intro} />
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
            </div>
            <Link href={policyHref} className={styles.policyLink}>
              {t("consent.readPolicy")} <ArrowRight width={16} height={16} aria-hidden="true" className="flip-rtl" />
            </Link>
          </Panel>

          <form onSubmit={submit} className={styles.stack} noValidate>
            <Panel>
              <PanelHeader title={t("consent.choicesTitle")} hint={t("consent.choicesHint")} />
              <p className={styles.noticeRef}>
                {t("consent.agreeing")} <Link href={policyHref}>{t("consent.noticeLink", { version: data.version })}</Link>
              </p>
              <ul className={styles.choices} lang={data.lang} dir={data.dir}>
                {data.purposes.map((purpose) => (
                  <li key={purpose.id} className={styles.choice}>
                    <Checkbox
                      label={purpose.title}
                      description={purpose.description}
                      checked={chosen.includes(purpose.id)}
                      onCheckedChange={(state) => toggle(purpose.id, state === true)}
                      aria-required={purpose.required || undefined}
                      aria-describedby={purpose.required && touched && missingRequired ? "required-error" : undefined}
                    />
                    <Badge size="sm" tone={purpose.required ? "info" : "neutral"}>{t(purpose.required ? "consent.required" : "consent.optional")}</Badge>
                  </li>
                ))}
              </ul>
              {touched && missingRequired ? <p id="required-error" className={styles.fieldError} role="alert">{t("consent.requiredError")}</p> : null}
            </Panel>

            <Panel>
              <PanelHeader title={t("consent.aboutTitle")} hint={t("consent.aboutHint")} />
              <div className={styles.fields}>
                <Input label={t("consent.name")} name="name" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} />
                <Input label={t("consent.phone")} name="phone" type="tel" inputMode="tel" autoComplete="tel" dir="ltr" value={phone} onChange={(event) => setPhone(event.target.value)} description={t("consent.phoneHint")} />
                {wantsUpdates ? (
                  <Input label={t("consent.email")} name="email" type="email" inputMode="email" autoComplete="email" dir="ltr" value={email} onChange={(event) => setEmail(event.target.value)} description={t("consent.emailHint")} />
                ) : null}
                <Checkbox label={t("consent.adult")} checked={adult} onCheckedChange={(state) => setAdult(state === true)} aria-required aria-describedby={touched && !adult ? "adult-error" : undefined} />
                {touched && !adult ? <p id="adult-error" className={styles.fieldError} role="alert" style={{ marginTop: 0 }}>{t("consent.adultError")}</p> : null}
              </div>
            </Panel>

            <FormError error={isStatus(submitError, 400) ? new Error(t("consent.submitError")) : submitError} />
            <Button type="submit" size="lg" loading={submitting} className={styles.full}>{t("consent.submit")}</Button>
          </form>
          <p className={styles.quietLink}>{t("consent.haveCode")} <Link href="/claim">{t("consent.enterCode")}</Link></p>
        </>
      ) : null}
    </PassengerShell>
  );
}
