"use client";

import { Accessibility, ArrowRight } from "lucide-react";
import { Badge } from "@/components/arc/badge/badge";
import { EmptyState } from "@/components/arc/empty-state/empty-state";
import { Skeleton } from "@/components/arc/skeleton/skeleton";
import { LiveState, StaffHeading } from "@/components/segue/staff-shell";
import { ErrorState, Fact, LiveRegion, Mascot, Panel, RiskBadge, StaleNote } from "@/components/segue/ui";
import { useLive } from "@/components/segue/use-live";
import { api, type CrewFlight } from "@/lib/api";
import { flightLabel, flightStatusLabel, formatAge, formatBuffer, formatTime, humanize } from "@/lib/format";
import styles from "../staff.module.css";

function FlightList({ entry, showNameHelp }: { entry: CrewFlight; showNameHelp: boolean }) {
  const { flight, items } = entry;
  const ordered = [...items].sort((a, b) => a.rank - b.rank);
  return (
    <Panel label={`Call-off list for ${flightLabel(flight.flight_iata)}`}>
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
        <>
          {showNameHelp ? <p className={styles.helper}>Names are masked. Confirm with the seat.</p> : null}
          <div className={styles.tableWrap}>
            <table className={`${styles.table} ${styles.tableLarge}`}>
              <caption className="sr-only">Passengers to call off the aircraft first, in order</caption>
              <thead>
                <tr>
                  <th scope="col">Order</th>
                  <th scope="col">Seat</th>
                  <th scope="col">Name</th>
                  <th scope="col">Onward flight</th>
                  <th scope="col" className={styles.right}>Buffer</th>
                  <th scope="col">Status</th>
                  <th scope="col">Assistance</th>
                </tr>
              </thead>
              <tbody>
                {ordered.map((item) => (
                  <tr key={`${item.rank}-${item.seat ?? "none"}-${item.onward}`}>
                    <td><span className={styles.rank}>{item.rank}</span></td>
                    <th scope="row" className={styles.seat}>{item.seat ?? "No seat"}</th>
                    <td>{item.name ?? <span className={styles.muted}>Not shared</span>}</td>
                    <td className={styles.nowrap}>{flightLabel(item.onward)} to {item.onward_dest}</td>
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
        </>
      ) : (
        <p className={styles.muted}>No one on this flight needs to get off first.</p>
      )}
    </Panel>
  );
}

export default function CrewPage() {
  const list = useLive<CrewFlight[]>(api.crewList, "crew");
  const data = list.data;
  const total = data?.reduce((sum, entry) => sum + entry.items.length, 0) ?? 0;
  const firstWithItems = data?.findIndex((entry) => entry.items.length > 0) ?? -1;

  return (
    <>
      <StaffHeading title="Cabin crew" hint="Who to call off the aircraft first." aside={<LiveState state={list.stream} />} />
      {data ? <LiveRegion>{`Call-off list updated: ${total} ${total === 1 ? "passenger" : "passengers"} on ${data.length} ${data.length === 1 ? "flight" : "flights"}.`}</LiveRegion> : null}
      {data ? <StaleNote error={list.error} onRetry={() => void list.reload()} /> : null}
      {list.loading ? <Panel><Skeleton label="Loading the call-off list" lines={5} /></Panel> : null}
      {!list.loading && !data ? <ErrorState error={list.error} onRetry={() => void list.reload()} title="The call-off list didn't load" /> : null}
      {data && data.length === 0 ? (
        <Panel><EmptyState icon={<Mascot pose="sleepy" size={40} />} title="No one to call off yet" description="When an inbound flight has passengers short on time for their connection at Dubai International, they appear here in the order to let them off." /></Panel>
      ) : null}
      {data?.map((entry, index) => <FlightList key={entry.flight.id} entry={entry} showNameHelp={index === firstWithItems} />)}
    </>
  );
}
