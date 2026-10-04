"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { ArrowRight, Check } from "lucide-react";
import { Badge } from "@/components/arc/badge/badge";
import { Button } from "@/components/arc/button/button";
import { Skeleton } from "@/components/arc/skeleton/skeleton";
import { LiveState, StaffHeading } from "@/components/segue/staff-shell";
import { useToast } from "@/components/segue/toasts";
import { ErrorState, LiveRegion, Panel, StaleNote } from "@/components/segue/ui";
import { useLive } from "@/components/segue/use-live";
import { api, errorMessage, type GroundJob } from "@/lib/api";
import { ageSince, flightLabel, formatBuffer, humanize } from "@/lib/format";
import { useNow } from "@/lib/hooks";
import styles from "../staff.module.css";

function JobRow({ job, position, now, onDone }: { job: GroundJob; position: number; now: number; onDone: (next: GroundJob) => void }) {
  const notify = useToast();
  const [busy, setBusy] = useState(false);
  const done = job.status === "done";
  const what = `${humanize(job.kind)}${job.seat ? ` for seat ${job.seat}` : ""}`;

  async function markDone() {
    setBusy(true);
    try {
      onDone(await api.groundJobDone(job.id));
      notify("Job marked done", what);
    } catch (error) {
      notify("That didn't go through", errorMessage(error));
    } finally { setBusy(false); }
  }

  return (
    <tr className={done ? styles.done : undefined}>
      <td><span className={styles.rank}>{position}</span></td>
      <th scope="row" className={styles.seat}>
        {humanize(job.kind)}
        {job.assistance && job.assistance !== "none" ? <> <Badge size="sm" tone="info">{humanize(job.assistance)}</Badge></> : null}
      </th>
      <td className={styles.strong}>{job.seat ?? "No seat"}</td>
      <td>{job.name ?? <span className={styles.muted}>Not shared</span>}</td>
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
          : <Button onClick={() => void markDone()} loading={busy} aria-label={`Mark done: ${what}`}>Done</Button>}
      </td>
    </tr>
  );
}

/** The dispatch table, shared by the open and done sections. */
export function JobTable({ jobs, now, caption, onDone }: { jobs: GroundJob[]; now: number; caption: string; onDone: (next: GroundJob) => void }) {
  return (
    <div className={styles.tableWrap}>
      <table className={`${styles.table} ${styles.tableLarge}`}>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Order</th>
            <th scope="col">Job</th>
            <th scope="col">Seat</th>
            <th scope="col">Name</th>
            <th scope="col">Gates</th>
            <th scope="col">Flights</th>
            <th scope="col" className={styles.right}>Buffer</th>
            <th scope="col">Raised</th>
            <th scope="col" className={styles.right}><span className="sr-only">Action</span></th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((job, index) => <JobRow key={job.id} job={job} position={index + 1} now={now} onDone={onDone} />)}
        </tbody>
      </table>
    </div>
  );
}

type Ground = ReturnType<typeof useGroundQueue>;
const GroundContext = createContext<Ground | null>(null);

/** The dispatch queue, loaded once for every Ground page. */
function useGroundQueue() {
  const now = useNow();
  const queue = useLive<GroundJob[]>(api.groundQueue, "ground");
  const data = queue.data;

  // Open jobs first, largest priority first, then the smallest buffer; finished jobs sink to the bottom.
  const ordered = useMemo(() => [...(data ?? [])].sort((a, b) => Number(a.status === "done") - Number(b.status === "done") || b.priority - a.priority || a.buffer_min - b.buffer_min), [data]);
  const open = ordered.filter((job) => job.status !== "done").length;
  const replace = (next: GroundJob) => queue.setData((current) => current?.map((job) => (job.id === next.id ? next : job)));
  return { now, queue, data, ordered, open, replace };
}

export function useGround(): Ground & { data: GroundJob[] } {
  const ground = useContext(GroundContext);
  if (!ground?.data) throw new Error("useGround is used inside GroundProvider, once the queue has loaded");
  return ground as Ground & { data: GroundJob[] };
}

const HEADINGS: Record<string, { title: string; hint: string }> = {
  "/ground": { title: "Ground handler", hint: "Who needs a buggy, bus or escort, in order." },
  "/ground/open": { title: "Open jobs", hint: "Most urgent first. Names are masked. Confirm with the seat." },
  "/ground/done": { title: "Done", hint: "Jobs already marked done." },
};

export function GroundProvider({ children }: { children: ReactNode }) {
  const ground = useGroundQueue();
  const { queue, data, open } = ground;
  const heading = HEADINGS[usePathname()] ?? HEADINGS["/ground"];
  return (
    <GroundContext.Provider value={ground}>
      <StaffHeading title={heading.title} hint={heading.hint} aside={<LiveState state={queue.stream} />} />
      {data ? <LiveRegion>{`Queue updated: ${open} open ${open === 1 ? "job" : "jobs"}.`}</LiveRegion> : null}
      {data ? <StaleNote error={queue.error} onRetry={() => void queue.reload()} /> : null}
      {queue.loading ? <Panel><Skeleton label="Loading the dispatch queue" lines={5} /></Panel> : null}
      {!queue.loading && !data ? <ErrorState error={queue.error} onRetry={() => void queue.reload()} title="The dispatch queue didn't load" /> : null}
      {data ? children : null}
    </GroundContext.Provider>
  );
}
