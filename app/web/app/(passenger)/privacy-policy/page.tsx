"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/arc/button/button";
import SegmentedControl from "@/components/arc/segmented-control/segmented-control";
import { Skeleton } from "@/components/arc/skeleton/skeleton";
import { PassengerShell } from "@/components/segue/passenger-shell";
import { ErrorState, Mascot, Panel } from "@/components/segue/ui";
import { api, useResource, type Language } from "@/lib/api";
import { asLanguage, LANGUAGE_OPTIONS, useI18n } from "@/lib/i18n";
import { sectionAnchor } from "@/lib/notice";
import styles from "./policy.module.css";

export default function PrivacyPolicyPage() {
  const router = useRouter();
  const { t, lang } = useI18n();
  // The policy can be read in any language without changing the language of the rest of the app.
  const [picked, setPicked] = useState<Language | null>(null);
  useEffect(() => {
    const wanted = asLanguage(new URLSearchParams(window.location.search).get("lang"));
    if (wanted) setPicked(wanted);
  }, []);
  const language = picked ?? lang;

  const notice = useResource(() => api.notice(language), { key: language });
  const data = notice.data;

  // Back to wherever the reader came from; a direct visit goes to the start.
  const back = () => { if (window.history.length > 1) router.back(); else router.push("/"); };

  return (
    <PassengerShell
      pageTitle={t("title.policy")}
      width="reading"
      title={data?.title ?? t("title.policy")}
      hero={(
        <div className={styles.head}>
          <Button variant="ghost" size="sm" onClick={back} className={styles.back}>
            <ArrowLeft width={16} height={16} aria-hidden="true" className="flip-rtl" /> {t("common.back")}
          </Button>
          <div className={styles.titleRow}>
            <div>
              <p className={styles.eyebrow}>{t("title.policy")}</p>
              <h1 className={styles.title} lang={data?.lang} dir={data?.dir}>{data?.title ?? t("title.policy")}</h1>
            </div>
            <Mascot pose="calm" size={72} />
          </div>
          <div className={styles.meta}>
            <SegmentedControl options={LANGUAGE_OPTIONS} value={language} onValueChange={(value) => { const next = asLanguage(value); if (next) setPicked(next); }} label={t("lang.label")} />
            {data ? <span className={styles.version}>{t("policy.version", { version: data.version })}</span> : null}
          </div>
        </div>
      )}
    >
      {notice.loading ? <Panel><Skeleton label={t("policy.loading")} lines={6} /></Panel> : null}
      {!notice.loading && !data ? <ErrorState error={notice.error} onRetry={() => void notice.reload()} title={t("policy.error")} /> : null}

      {data ? (
        <div className={styles.layout}>
          <nav className={styles.toc} aria-label={t("policy.toc")}>
            <p className={styles.tocTitle}>{t("policy.toc")}</p>
            <ol>
              {data.sections.map((section, index) => (
                <li key={section.heading} lang={data.lang} dir={data.dir}><a href={`#${sectionAnchor(index)}`}>{section.heading}</a></li>
              ))}
              <li><a href="#purposes">{t("policy.purposes")}</a></li>
              <li><a href="#retention">{t("policy.retention")}</a></li>
            </ol>
          </nav>

          <article className={styles.article}>
            <div lang={data.lang} dir={data.dir}>
              <p className={styles.lead}>{data.intro}</p>
              {data.sections.map((section, index) => (
                <section key={section.heading} id={sectionAnchor(index)} className={styles.section}>
                  <h2><span className={styles.number}>{index + 1}</span>{section.heading}</h2>
                  <p>{section.body}</p>
                </section>
              ))}
            </div>

            <section id="purposes" className={styles.section}>
              <h2><span className={styles.number}>{data.sections.length + 1}</span>{t("policy.purposes")}</h2>
              <dl className={styles.purposes}>
                {data.purposes.map((purpose) => (
                  <div key={purpose.id}>
                    <dt><span lang={data.lang} dir={data.dir}>{purpose.title}</span> <span className={styles.tag}>{t(purpose.required ? "consent.required" : "consent.optional")}</span></dt>
                    <dd lang={data.lang} dir={data.dir}>{purpose.description}</dd>
                  </div>
                ))}
              </dl>
            </section>

            <section id="retention" className={styles.section}>
              <h2><span className={styles.number}>{data.sections.length + 2}</span>{t("policy.retention")}</h2>
              <dl className={styles.facts}>
                <div><dt>{t("policy.keepFor")}</dt><dd>{t("policy.hours", { n: data.retention_hours })}</dd></div>
                <div><dt>{t("policy.contact")}</dt><dd><bdi dir="ltr">{data.grievance_contact}</bdi></dd></div>
                <div><dt>{t("policy.versionLabel")}</dt><dd><bdi dir="ltr">{data.version}</bdi></dd></div>
              </dl>
            </section>
          </article>
        </div>
      ) : null}
    </PassengerShell>
  );
}
