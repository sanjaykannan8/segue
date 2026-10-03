"use client";

import { Accessibility, ArrowRight } from "lucide-react";
import { Badge } from "@/components/arc/badge/badge";
import { EmptyState } from "@/components/arc/empty-state/empty-state";
import { Skeleton } from "@/components/arc/skeleton/skeleton";
import { LiveState, StaffHeading } from "@/components/segue/staff-shell";
import { ErrorState, Fact, Mascot, Panel, RiskBadge, StaleNote } from "@/components/segue/ui";
import { useLive } from "@/components/segue/use-live";
import { api, type CrewFlight } from "@/lib/api";
import { flightLabel, flightStatusLabel, formatAge, formatBuffer, formatTime, humanize } from "@/lib/format";
import styles from "../staff.module.css";

function FlightList({ entry }: { entry: CrewFlight }) {
  const { flight, items } = entry;
  const ordered = [...items].sort((a, b) => a.rank - b.rank);
  return (
    <Panel label={`Priority deplaning for ${flightLabel(flight.flight_iata)}`}>
      <div className={styles.flightHead}>
        <div className={styles.flightTitle}>
          <h2>{flightLabel(flight.flight_iata)}</h2>
          <span className={styles.route}>{flight.origin} <ArrowRight width={16} height={16} aria-label="to" /> {flight.dest}</span>
        </div>
        <dl className={styles.facts}>
          <Fact label="Arrives (est.)">{formatTime(flight.est_arr ?? flight.sched_arr)}</Fact>
          <Fact label="Gate">{flight.arr_gate ?? "Not yet"}</Fact>
          <Fact label="Status">{flightStatusLabel(flight)}</Fact>
          <Fact label="Updated">{formatAge(flight.age_sec)}</Fact>
        </dl>
      </div>
      {ordered.length ? (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <caption className="sr-only">Passengers to let off first, in order</caption>
            <thead>
              <tr>
                <th scope="col">Order</th>
                <th scope="col">Seat</th>
                <th scope="col">Onward flight</th>
                <th scope="col">To</th>
                <th scope="col" className={styles.right}>Buffer</th>
                <th scope="col">Status</th>
                <th scope="col">Assistance</th>
              </tr>
            </thead>
            <tbody>
              {ordered.map((item) => (
                <tr key={`${item.rank}-${item.seat ?? "none"}-${item.onward}`}>
                  <td><span className={styles.rank}>{item.rank}</span></td>
                  <td className={styles.strong}>{item.seat ?? "No seat"}</td>
                  <td className={styles.nowrap}>{flightLabel(item.onward)}</td>
                  <td>{item.onward_dest}</td>
                  <td className={`${styles.right} ${styles.num} ${styles.nowrap}`}>{formatBuffer(item.buffer_min)}</td>
                  <td>
                    <span className={styles.badges}>
                      <RiskBadge level={item.level} size="sm" />
                      {item.booking === "separate_tickets" ? <Badge size="sm" tone="neutral">Separate tickets</Badge> : null}
                    </span>
                  </td>
                  <td>
                    {item.assistance && item.assistance !== "none"
                      ? <Badge size="sm" tone="info" icon={<Accessibility width={12} height={12} aria-hidden="true" />}>{humanize(item.assistance)}</Badge>
                      : <span className={styles.muted}>None</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className={styles.muted}>No one on this flight needs to get off first.</p>
      )}
    </Panel>
  );
}

export default function CrewPage() {
  const list = useLive<CrewFlight[]>(api.crewList, "crew");
  const data = list.data;

  return (
    <>
      <StaffHeading title="Priority deplaning" hint="Who to let off first, by inbound flight." aside={<LiveState state={list.stream} />} />
      {data ? <StaleNote error={list.error} onRetry={() => void list.reload()} /> : null}
      {list.loading ? <Panel><Skeleton label="Loading the crew list" lines={5} /></Panel> : null}
      {!list.loading && !data ? <ErrorState error={list.error} onRetry={() => void list.reload()} title="The crew list didn't load" /> : null}
      {data && data.length === 0 ? (
        <Panel><EmptyState icon={<Mascot pose="sleepy" size={40} />} title="No priority list yet" description="When a connection is short on time, the passengers to let off first appear here." label="No priority deplaning list" /></Panel>
      ) : null}
      {data?.map((entry) => <FlightList key={entry.flight.id} entry={entry} />)}
    </>
  );
}
