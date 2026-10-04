"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, MonitorSmartphone } from "lucide-react";
import { Button } from "@/components/arc/button/button";
import { Dialog, DialogContent } from "@/components/arc/dialog/dialog";
import { Skeleton } from "@/components/arc/skeleton/skeleton";
import { api, type DeviceLink } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { useToast } from "./toasts";
import { ErrorState } from "./ui";
import styles from "@/app/(passenger)/passenger.module.css";

/** "ABCD1234" → "ABCD-1234" */
export function formatCode(code: string): string {
  const clean = code.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return clean.length > 4 ? `${clean.slice(0, 4)}-${clean.slice(4)}` : clean;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** A one-time code that opens this trip on a second device. */
export function DeviceLinkButton({ variant = "secondary", className }: { variant?: "secondary" | "ghost"; className?: string }) {
  const t = useT();
  const notify = useToast();
  const [open, setOpen] = useState(false);
  const [link, setLink] = useState<(DeviceLink & { until: number }) | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const request = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await api.createLink();
      setNow(Date.now());
      setLink({ ...next, until: Date.now() + next.expires_in * 1000 });
    } catch (caught) {
      setLink(null);
      setError(caught);
    } finally { setLoading(false); }
  }, []);

  // A code is only requested when the dialog is opened, never in the background.
  useEffect(() => { if (open) void request(); else { setLink(null); setError(null); } }, [open, request]);
  useEffect(() => {
    if (!open || !link) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [open, link]);

  const left = link ? Math.max(0, Math.ceil((link.until - now) / 1000)) : 0;
  const expired = !!link && left === 0;
  const url = link && typeof window !== "undefined" ? `${window.location.origin}/claim#code=${encodeURIComponent(link.code)}` : "";
  const copy = async (text: string, done: string) => notify((await copyText(text)) ? done : t("link.copyFailed"));

  return (
    <>
      <Button type="button" variant={variant} className={className} onClick={() => setOpen(true)}>
        <MonitorSmartphone width={16} height={16} aria-hidden="true" /> {t("link.open")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title={t("link.open")} description={t("link.desc")}>
          <div className={styles.linkBody}>
            {loading && !link ? <Skeleton label={t("link.getting")} lines={3} /> : null}
            {error ? <ErrorState compact error={error} title={t("link.error")} onRetry={() => void request()} /> : null}
            {link ? (
              <>
                <p className={styles.linkCode} dir="ltr" aria-label={`${t("link.codeLabel")}: ${formatCode(link.code).split("").join(" ")}`} style={expired ? { opacity: 0.55 } : undefined}>{formatCode(link.code)}</p>
                {/* The countdown is not announced every second; only its end is. */}
                <p className={styles.linkTimer}>
                  {expired ? <span role="status">{t("link.expired")}</span> : t("link.expires", { time: `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}` })}
                </p>
                <p className={styles.linkUrl} dir="ltr">{url}</p>
                <div className={styles.actions}>
                  <Button type="button" variant="secondary" disabled={expired} onClick={() => void copy(link.code, t("link.codeCopied"))}>
                    <Copy width={16} height={16} aria-hidden="true" /> {t("link.copyCode")}
                  </Button>
                  <Button type="button" variant="secondary" disabled={expired} onClick={() => void copy(url, t("link.linkCopied"))}>
                    <Copy width={16} height={16} aria-hidden="true" /> {t("link.copyLink")}
                  </Button>
                </div>
                <p className={styles.muted}>{t("link.howTo")}</p>
                <Button type="button" variant={expired ? "primary" : "ghost"} loading={loading} onClick={() => void request()}>{t("link.newCode")}</Button>
              </>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
