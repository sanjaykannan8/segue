"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, MonitorSmartphone } from "lucide-react";
import { Button } from "@/components/arc/button/button";
import { Dialog, DialogContent } from "@/components/arc/dialog/dialog";
import { Skeleton } from "@/components/arc/skeleton/skeleton";
import { api, type DeviceLink } from "@/lib/api";
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
  const url = link && typeof window !== "undefined" ? `${window.location.origin}/claim?code=${encodeURIComponent(link.code)}` : "";
  const copy = async (text: string, what: string) => notify((await copyText(text)) ? `${what} copied` : "Couldn't copy. Select it and copy by hand.");

  return (
    <>
      <Button type="button" variant={variant} className={className} onClick={() => setOpen(true)}>
        <MonitorSmartphone width={16} height={16} aria-hidden="true" /> Open on another device
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Open on another device" description="Use this once, within 10 minutes. Anyone with it can see your trip, so only share it with yourself.">
          <div className={styles.linkBody}>
            {loading && !link ? <Skeleton label="Getting a code" lines={3} /> : null}
            {error ? <ErrorState compact error={error} title="We couldn't make a code" onRetry={() => void request()} /> : null}
            {link ? (
              <>
                <p className={styles.linkCode} aria-label={`Code ${formatCode(link.code).split("").join(" ")}`} style={expired ? { opacity: 0.4 } : undefined}>{formatCode(link.code)}</p>
                <p className={styles.linkTimer} role="timer">
                  {expired ? "This code has expired. Get a new one." : `Expires in ${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`}
                </p>
                <p className={styles.linkUrl}>{url}</p>
                <div className={styles.actions}>
                  <Button type="button" variant="secondary" disabled={expired} onClick={() => void copy(link.code, "Code")}>
                    <Copy width={16} height={16} aria-hidden="true" /> Copy code
                  </Button>
                  <Button type="button" variant="secondary" disabled={expired} onClick={() => void copy(url, "Link")}>
                    <Copy width={16} height={16} aria-hidden="true" /> Copy link
                  </Button>
                </div>
                <p className={styles.muted}>On the other device, open the link, or go to the start page and choose “Enter your code”.</p>
                <Button type="button" variant={expired ? "primary" : "ghost"} loading={loading} onClick={() => void request()}>New code</Button>
              </>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
