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
import { sectionAnchor } from "@/lib/notice";
import styles from "./policy.module.css";

const LANGUAGE_TABS = [
  { value: "en", label: "English" },
  { value: "hi", label: "हिन्दी" },
];

export default function PrivacyPolicyPage() {
  const router = useRouter();
  const [language, setLanguage] = useState<Language>("en");

  // The consent screen passes the language the passenger was reading in.
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get("lang");
    if (wanted === "hi") setLanguage("hi");
  }, []);

  const notice = useResource(() => api.notice(language), { key: language });
  const data = notice.data;

  // Back to wherever the reader came from; a direct visit goes to the start.
  const back = () => { if (window.history.length > 1) router.back(); else router.push("/"); };

  return (
    <PassengerShell
      width="reading"
      title={data?.title ?? "Privacy policy"}
      hero={(
        <div className={styles.head}>
          <Button variant="ghost" size="sm" onClick={back} className={styles.back}>
            <ArrowLeft width={16} height={16} aria-hidden="true" /> Back
          </Button>
          <div className={styles.titleRow}>
            <div>
              <p className={styles.eyebrow}>Privacy policy</p>
              <h1 className={styles.title} lang={data?.lang}>{data?.title ?? "Privacy policy"}</h1>
            </div>
            <Mascot pose="calm" size={72} />
          </div>
          <div className={styles.meta}>
            <SegmentedControl options={LANGUAGE_TABS} value={language} onValueChange={(value) => setLanguage(value === "hi" ? "hi" : "en")} label="Language" />
            {data ? <span className={styles.version}>Notice version {data.version}</span> : null}
          </div>
        </div>
      )}
    >
      {notice.loading ? <Panel><Skeleton label="Loading the privacy policy" lines={6} /></Panel> : null}
      {!notice.loading && !data ? <ErrorState error={notice.error} onRetry={() => void notice.reload()} title="The privacy policy didn't load" /> : null}

      {data ? (
        <div className={styles.layout} lang={data.lang}>
          <nav className={styles.toc} aria-label="On this page">
            <p className={styles.tocTitle}>On this page</p>
            <ol>
              {data.sections.map((section, index) => (
                <li key={section.heading}><a href={`#${sectionAnchor(index)}`}>{section.heading}</a></li>
              ))}
              <li><a href="#purposes">What you can agree to</a></li>
              <li><a href="#retention">Retention and contact</a></li>
            </ol>
          </nav>

          <article className={styles.article}>
            <p className={styles.lead}>{data.intro}</p>

            {data.sections.map((section, index) => (
              <section key={section.heading} id={sectionAnchor(index)} className={styles.section}>
                <h2><span className={styles.number}>{index + 1}</span>{section.heading}</h2>
                <p>{section.body}</p>
              </section>
            ))}

            <section id="purposes" className={styles.section}>
              <h2><span className={styles.number}>{data.sections.length + 1}</span>What you can agree to</h2>
              <dl className={styles.purposes}>
                {data.purposes.map((purpose) => (
                  <div key={purpose.id}>
                    <dt>{purpose.title} <span className={styles.tag}>{purpose.required ? "Required" : "Optional"}</span></dt>
                    <dd>{purpose.description}</dd>
                  </div>
                ))}
              </dl>
            </section>

            <section id="retention" className={styles.section}>
              <h2><span className={styles.number}>{data.sections.length + 2}</span>Retention and contact</h2>
              <dl className={styles.facts}>
                <div><dt>We keep your data for</dt><dd>{data.retention_hours} hours</dd></div>
                <div><dt>Questions or complaints</dt><dd>{data.grievance_contact}</dd></div>
                <div><dt>Notice version</dt><dd>{data.version}</dd></div>
              </dl>
            </section>
          </article>
        </div>
      ) : null}
    </PassengerShell>
  );
}
