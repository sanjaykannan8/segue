"use client";

import { useEffect, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileText, MessageSquare, Plane, UserRound, type LucideIcon } from "lucide-react";
import { api } from "@/lib/api";
import { asLanguage, PageTitle, useI18n, type Key } from "@/lib/i18n";
import { LogoTile } from "./ui";
import styles from "./shell.module.css";

// The language saved with the session is read once per page load, on whichever passenger screen opens first.
let sessionLanguageRead = false;

type PassengerTab = "trip" | "messages" | "data" | "policy";

/** The passenger's bottom navigation. "Your trip" covers adding a trip too. */
const TABS: { id: PassengerTab; href: string; match: string[]; label: Key; icon: LucideIcon }[] = [
  { id: "trip", href: "/trip", match: ["/trip", "/scan"], label: "shell.yourTrip", icon: Plane },
  { id: "messages", href: "/trip/messages", match: ["/trip/messages"], label: "trip.messages", icon: MessageSquare },
  { id: "data", href: "/privacy", match: ["/privacy"], label: "shell.yourData", icon: UserRound },
  { id: "policy", href: "/privacy-policy", match: ["/privacy-policy"], label: "shell.policy", icon: FileText },
];
/** Screens a passenger only reaches with a session: these get the bottom navigation. */
const APP_PATHS = ["/trip", "/trip/messages", "/scan", "/privacy"];

/** Passenger frame: a slim top bar, one centered column, a footer, and on app screens a bottom navigation bar. */
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
  const pathname = usePathname();
  const size = styles[width];
  const inApp = APP_PATHS.includes(pathname);

  useEffect(() => {
    if (sessionLanguageRead) return;
    sessionLanguageRead = true;
    api.me().then((me) => { const language = asLanguage(me.language); if (language) setLanguage(language); }).catch(() => { /* no session yet: keep the stored choice */ });
  }, [setLanguage]);

  const current = TABS.find((entry) => entry.match.includes(pathname))?.id;

  return (
    <div className={`${styles.page} ${styles.passenger}`} data-app={inApp || undefined}>
      <PageTitle title={pageTitle} />
      <a href="#main" className={styles.skip}>{t("shell.skip")}</a>
      <header className={styles.bar}>
        <div className={`${styles.barInner} ${styles.reading}`}>
          <Link href="/" className={styles.brand} aria-label={t("shell.home")}>
            <LogoTile size={30} decorative />
            <span className={styles.wordmark} aria-hidden="true">Segue</span>
          </Link>
          {/* Before a session there is nothing to navigate to yet, so only the policy is linked. */}
          {!inApp && pathname !== "/privacy-policy" ? (
            <nav className={styles.end} aria-label={t("shell.pageNav")}>
              <Link href="/privacy-policy" className={styles.link}>{t("shell.policy")}</Link>
            </nav>
          ) : null}
          {action ? <nav className={styles.end} aria-label={t("shell.pageNav")}>{action}</nav> : null}
        </div>
      </header>
      <main id="main" tabIndex={-1} className={`${styles.main} ${size}`}>
        {hero ?? (
          <div className={styles.pageHead}>
            <h1 className={styles.title}>{title}</h1>
            {intro ? <p className={styles.hint}>{intro}</p> : null}
          </div>
        )}
        {children}
      </main>
      <footer className={styles.footer}>
        <div className={`${styles.footerInner} ${styles.reading}`}>
          <span>{t("shell.footerLine")}</span>
          <nav className={styles.footerLinks} aria-label={t("shell.footerNav")}>
            <Link href="/privacy-policy">{t("shell.policy")}</Link>
            <Link href="/privacy">{t("shell.yourData")}</Link>
          </nav>
        </div>
      </footer>
      {inApp ? (
        <nav className={styles.tabBar} aria-label={t("shell.mainNav")}>
          <div className={styles.tabBarInner}>
            {TABS.map((entry) => (
              <Link key={entry.id} href={entry.href} className={styles.tabBarLink} aria-current={entry.id === current ? "page" : undefined}>
                <entry.icon width={22} height={22} aria-hidden="true" />
                <span>{t(entry.label)}</span>
              </Link>
            ))}
          </div>
        </nav>
      ) : null}
    </div>
  );
}

export function HeaderLink({ href, children }: { href: string; children: ReactNode }) {
  return <Link href={href} className={styles.link}>{children}</Link>;
}
