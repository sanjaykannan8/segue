"use client";

import { useEffect, type ReactNode } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { asLanguage, PageTitle, useI18n } from "@/lib/i18n";
import { LogoTile } from "./ui";
import styles from "./shell.module.css";

// The language saved with the session is read once per page load, on whichever passenger screen opens first.
let sessionLanguageRead = false;

/** Passenger frame: the shared light shell, one centered column, and a simple footer. */
export function PassengerShell({ pageTitle, title, intro, action, children, width = "narrow", hero }: {
  /** Browser tab title for this route. */
  pageTitle: string;
  title: string;
  intro?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  width?: "narrow" | "reading";
  /** Replaces the plain title block. It must render the page's single h1. */
  hero?: ReactNode;
}) {
  const { t, setLanguage } = useI18n();
  const size = styles[width];

  useEffect(() => {
    if (sessionLanguageRead) return;
    sessionLanguageRead = true;
    api.me().then((me) => { const language = asLanguage(me.language); if (language) setLanguage(language); }).catch(() => { /* no session yet: keep the stored choice */ });
  }, [setLanguage]);

  return (
    <div className={`${styles.page} ${styles.passenger}`}>
      <PageTitle title={pageTitle} />
      <a href="#main" className={styles.skip}>{t("shell.skip")}</a>
      <header className={styles.bar}>
        <div className={`${styles.barInner} ${size}`}>
          <Link href="/" className={styles.brand} aria-label={t("shell.home")}>
            <LogoTile size={36} decorative />
          </Link>
          {action ? <nav className={styles.end} aria-label={t("shell.pageNav")}>{action}</nav> : null}
        </div>
      </header>
      <main id="main" tabIndex={-1} className={`${styles.main} ${size}`}>
        {hero ?? (
          <div>
            <h1 className={styles.title}>{title}</h1>
            {intro ? <p className={styles.hint}>{intro}</p> : null}
          </div>
        )}
        {children}
      </main>
      <footer className={styles.footer}>
        <div className={`${styles.footerInner} ${size}`}>
          <span>{t("shell.footerLine")}</span>
          <nav className={styles.footerLinks} aria-label={t("shell.footerNav")}>
            <Link href="/privacy-policy">{t("shell.policy")}</Link>
            <Link href="/privacy">{t("shell.yourData")}</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}

export function HeaderLink({ href, children }: { href: string; children: ReactNode }) {
  return <Link href={href} className={styles.link}>{children}</Link>;
}
