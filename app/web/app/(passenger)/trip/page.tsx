"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Alert } from "@/components/arc/alert/alert";
import { Skeleton } from "@/components/arc/skeleton/skeleton";
import { DeviceLinkButton } from "@/components/segue/device-link";
import { PassengerShell } from "@/components/segue/passenger-shell";
import { ErrorState, Panel, PanelHeader, StaleNote } from "@/components/segue/ui";
import styles from "../passenger.module.css";
import { EmailCheck, Messages, StatusCard, useTrip } from "./trip-data";

/** The passenger's dashboard: connection status, flights and steps, and the newest message. */
export default function TripPage() {
  const { t, now, connection, feed, view, redirecting } = useTrip();
  const title = t("title.trip");
  return (
    <PassengerShell pageTitle={title} title={title}>
      {view?.degraded ? <Alert tone="info" title={t("trip.degradedTitle")}>{t("trip.degradedBody")}</Alert> : null}
      {view ? <StaleNote error={connection.error} onRetry={() => void connection.reload()} /> : null}

      {view ? <StatusCard view={view} /> : connection.loading || redirecting ? (
        <Panel><Skeleton label={t("trip.loading")} lines={6} avatar /></Panel>
      ) : (
        <ErrorState error={connection.error} onRetry={() => void connection.reload()} title={t("trip.error")} />
      )}

      {/* The newest message, with a way through to all of them. */}
      {feed.data && feed.data.length > 0 ? (
        <Panel>
          <PanelHeader title={t("trip.messages")} action={<Link href="/trip/messages" className={styles.seeAll}>{t("trip.seeAll")} <ArrowRight width={16} height={16} aria-hidden="true" className="flip-rtl" /></Link>} />
          <Messages items={feed.data.slice(0, 1)} now={now} />
        </Panel>
      ) : null}

      <EmailCheck />

      {view ? <div className={styles.quietRow}><DeviceLinkButton variant="ghost" /></div> : null}
    </PassengerShell>
  );
}
