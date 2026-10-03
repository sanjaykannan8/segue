"use client";

import type { ReactNode } from "react";
import { CircleCheck, CircleHelp, CircleX, Clock, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/arc/badge/badge";
import { Button } from "@/components/arc/button/button";
import { Skeleton } from "@/components/arc/skeleton/skeleton";
import { errorMessage, type RiskLevel } from "@/lib/api";
import { asRiskLevel, RISK_LABEL } from "@/lib/format";
import styles from "./ui.module.css";

export type MascotPose = "wink" | "cookie" | "code" | "dizzy" | "dizzy_tilt" | "sleepy" | "alert" | "happy" | "mail" | "calm" | "look_right" | "look_left";

/** The cloud mascot. Decorative by default: the text next to it always carries the meaning. */
export function Mascot({ pose, size = 72, alt = "", className }: { pose: MascotPose; size?: number; alt?: string; className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- static local asset, no optimizer needed
  return <img src={`/mascot/${pose}.png`} width={size} height={size} alt={alt} aria-hidden={alt ? undefined : true} className={[styles.mascot, className].filter(Boolean).join(" ")} decoding="async" />;
}

/** The gradient logo tile (mark and wordmark in white). */
export function LogoTile({ size = 40 }: { size?: number }) {
  // eslint-disable-next-line @next/next/no-img-element -- static local asset
  return <img src="/segue-logo.svg" width={size} height={size} alt="Segue" className={styles.logo} style={{ borderRadius: Math.round(size * 0.28) }} />;
}

const RISK_ICON: Record<RiskLevel, typeof CircleCheck> = { safe: CircleCheck, tight: Clock, at_risk: TriangleAlert, lost: CircleX };

export function RiskIcon({ level, size = 14 }: { level: RiskLevel | null; size?: number }) {
  const Icon = level ? RISK_ICON[level] : CircleHelp;
  return <Icon width={size} height={size} strokeWidth={2} aria-hidden="true" />;
}

/** Risk is never shown by color alone: every badge carries an icon and a label. */
export function RiskBadge({ level, size = "md" }: { level: string | null | undefined; size?: "sm" | "md" }) {
  const known = asRiskLevel(level);
  return (
    <Badge size={size} data-risk={known ?? "unknown"} icon={<RiskIcon level={known} size={size === "sm" ? 12 : 14} />}>
      {known ? RISK_LABEL[known] : "Not scored"}
    </Badge>
  );
}

/** A white panel: the basic container on every screen. */
export function Panel({ children, className, label }: { children: ReactNode; className?: string; label?: string }) {
  return <section className={[styles.panel, className].filter(Boolean).join(" ")} aria-label={label}>{children}</section>;
}

export function PanelHeader({ title, hint, action, level = 2 }: { title: string; hint?: ReactNode; action?: ReactNode; level?: 2 | 3 }) {
  const Heading = level === 2 ? "h2" : "h3";
  return (
    <div className={styles.panelHeader}>
      <div className={styles.panelTitles}>
        <Heading className={styles.panelTitle}>{title}</Heading>
        {hint ? <p className={styles.panelHint}>{hint}</p> : null}
      </div>
      {action ? <div className={styles.panelAction}>{action}</div> : null}
    </div>
  );
}

/** Friendly inline error with a retry. Used wherever a request can fail. */
export function ErrorState({ error, onRetry, title = "That didn't load", compact = false }: { error: unknown; onRetry?: () => void; title?: string; compact?: boolean }) {
  return (
    <div className={[styles.error, compact ? styles.errorCompact : ""].filter(Boolean).join(" ")} role="alert">
      {compact ? null : <Mascot pose="dizzy" size={72} />}
      <div className={styles.errorCopy}>
        <p className={styles.errorTitle}>{title}</p>
        <p className={styles.errorText}>{errorMessage(error)}</p>
      </div>
      {onRetry ? <Button variant="secondary" size="sm" onClick={onRetry}>Retry</Button> : null}
    </div>
  );
}

/** A thin notice shown when a background refresh failed but older data is still on screen. */
export function StaleNote({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  if (!error) return null;
  return (
    <div className={styles.stale} role="status">
      <span>Couldn&apos;t refresh. Showing the last data we have.</span>
      <button type="button" className={styles.linkButton} onClick={onRetry}>Retry</button>
    </div>
  );
}

export function LoadingPanel({ label = "Loading", lines = 4 }: { label?: string; lines?: number }) {
  return <Panel><Skeleton label={label} lines={lines} /></Panel>;
}

/** Inline form feedback under a form. */
export function FormError({ error }: { error: unknown }) {
  if (!error) return null;
  return <p className={styles.formError} role="alert">{errorMessage(error)}</p>;
}

/** A label and value pair, stacked. Use inside a <dl>. */
export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.fact}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
