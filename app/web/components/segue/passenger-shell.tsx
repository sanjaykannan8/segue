import type { ReactNode } from "react";
import Link from "next/link";
import { LogoTile } from "./ui";
import styles from "./passenger-shell.module.css";

/** Passenger frame: light, mobile-first, one centered column. */
export function PassengerShell({ title, intro, action, children }: { title: string; intro?: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.brand} aria-label="Segue home">
          <LogoTile size={40} />
        </Link>
        {action ? <nav className={styles.action} aria-label="Page">{action}</nav> : null}
      </header>
      <main className={styles.main}>
        <div className={styles.heading}>
          <h1 className={styles.title}>{title}</h1>
          {intro ? <p className={styles.intro}>{intro}</p> : null}
        </div>
        {children}
      </main>
    </div>
  );
}

export function HeaderLink({ href, children }: { href: string; children: ReactNode }) {
  return <Link href={href} className={styles.headerLink}>{children}</Link>;
}
