import type { ReactNode } from "react";
import Link from "next/link";
import { LogoTile } from "./ui";
import styles from "./shell.module.css";

/** Passenger frame: the shared light shell, one centered column, and a simple footer. */
export function PassengerShell({ title, intro, action, children, width = "narrow", hero }: { title: string; intro?: ReactNode; action?: ReactNode; children: ReactNode; width?: "narrow" | "reading"; /** Replaces the plain title block. The title must then be rendered as the page's h1 inside it. */ hero?: ReactNode }) {
  const size = styles[width];
  return (
    <div className={styles.page}>
      <header className={styles.bar}>
        <div className={`${styles.barInner} ${size}`}>
          <Link href="/" className={styles.brand} aria-label="Segue home">
            <LogoTile size={36} />
          </Link>
          {action ? <nav className={styles.end} aria-label="Page">{action}</nav> : null}
        </div>
      </header>
      <main className={`${styles.main} ${size}`}>
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
          <span>Segue watches your connection.</span>
          <nav className={styles.footerLinks} aria-label="Footer">
            <Link href="/privacy-policy">Privacy policy</Link>
            <Link href="/privacy">Your data</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}

export function HeaderLink({ href, children }: { href: string; children: ReactNode }) {
  return <Link href={href} className={styles.link}>{children}</Link>;
}
