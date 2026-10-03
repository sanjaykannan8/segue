"use client";

import { useMemo, useState } from "react";
import { ArrowRight, Check } from "lucide-react";
import { Badge } from "@/components/arc/badge/badge";
import { Button } from "@/components/arc/button/button";
import { EmptyState } from "@/components/arc/empty-state/empty-state";
import { Skeleton } from "@/components/arc/skeleton/skeleton";
import { LiveState, StaffHeading } from "@/components/segue/staff-shell";
import { useToast } from "@/components/segue/toasts";
import { ErrorState, Mascot, Panel, PanelHeader, StaleNote } from "@/components/segue/ui";
import { useLive } from "@/components/segue/use-live";
import { api, errorMessage, type GroundJob } from "@/lib/api";
import { ageSince, flightLabel, formatBuffer, humanize } from "@/lib/format";
import { useNow } from "@/lib/hooks";
import styles from "../staff.module.css";

function JobRow({ job, position, now, onDone }: { job: GroundJob; position: number; now: number; onDone: (next: GroundJob) => void }) {
  const notify = useToast();
  const [busy, setBusy] = useState(false);
  const done = job.status === "done";

  async function markDone() {
    setBusy(true);
    try {
      onDone(await api.groundJobDone(job.id));
      notify("Job marked done", `${humanize(job.kind)}${job.seat ? ` for ${job.seat}` : ""}`);
    } catch (error) {
      notify("That didn't go through", errorMessage(error));
    } finally { setBusy(false); }
  }

  return (
    <tr className={done ? styles.done : undefined}>
      <td><span className={styles.rank}>{position}</span></td>
      <td className={styles.strong}>{humanize(job.kind)}</td>
      <td>{job.seat ?? "No seat"}</td>
      <td>
        <span className={styles.route}>
          {job.from_gate ?? "Gate not set"} <ArrowRight width={14} height={14} aria-label="to" /> {job.to_gate ?? "Gate not set"}
        </span>
      </td>
      <td>
        <span className={styles.route}>
          {flightLabel(job.inbound)} <ArrowRight width={14} height={14} aria-label="to" /> {flightLabel(job.outbound)}
        </span>
      </td>
      <td className={`${styles.right} ${styles.num} ${styles.nowrap}`}>{formatBuffer(job.buffer_min)}</td>
      <td className={styles.nowrap}>{ageSince(job.created_at, now)}</td>
      <td className={styles.right}>
        {done
          ? <Badge size="sm" tone="neutral" icon={<Check width={12} height={12} aria-hidden="true" />}>Done</Badge>
          : <Button size="sm" onClick={() => void markDone()} loading={busy} aria-label={`Mark ${humanize(job.kind)}${job.seat ? ` for seat ${job.seat}` : ""} as done`}>Done</Button>}
      </td>
    </tr>
  );
}

export default function GroundPage() {
  const now = useNow();
  const queue = useLive<GroundJob[]>(api.groundQueue, "ground");
  const data = queue.data;

  // The API returns the queue in priority order; that order is kept, and finished jobs sink to the bottom.
  const ordered = useMemo(() => [...(data ?? [])].sort((a, b) => Number(a.status === "done") - Number(b.status === "done")), [data]);
  const open = ordered.filter((job) => job.status !== "done").length;
  const replace = (next: GroundJob) => queue.setData((current) => current?.map((job) => (job.id === next.id ? next : job)));

  return (
    <>
      <StaffHeading title="Dispatch queue" hint="Most urgent first." aside={<LiveState state={queue.stream} />} />
      {data ? <StaleNote error={queue.error} onRetry={() => void queue.reload()} /> : null}
      {queue.loading ? <Panel><Skeleton label="Loading the dispatch queue" lines={5} /></Panel> : null}
      {!queue.loading && !data ? <ErrorState error={queue.error} onRetry={() => void queue.reload()} title="The dispatch queue didn't load" /> : null}
      {data && data.length === 0 ? (
        <Panel><EmptyState icon={<Mascot pose="sleepy" size={40} />} title="The queue is clear" description="New buggy, bus and escort jobs appear here as they are raised." label="No dispatch jobs" /></Panel>
      ) : null}
      {data && data.length > 0 ? (
        <Panel label="Dispatch queue">
          <PanelHeader title="Jobs" hint={open === 0 ? "Everything is done." : `${open} open`} />
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <caption className="sr-only">Dispatch jobs in priority order</caption>
              <thead>
                <tr>
                  <th scope="col">Order</th>
                  <th scope="col">Job</th>
                  <th scope="col">Seat</th>
                  <th scope="col">Gates</th>
                  <th scope="col">Flights</th>
                  <th scope="col" className={styles.right}>Buffer</th>
                  <th scope="col">Raised</th>
                  <th scope="col" className={styles.right}><span className="sr-only">Action</span></th>
                </tr>
              </thead>
              <tbody>
                {ordered.map((job, index) => <JobRow key={job.id} job={job} position={index + 1} now={now} onDone={replace} />)}
              </tbody>
            </table>
          </div>
        </Panel>
      ) : null}
    </>
  );
}
