"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Skeleton } from "@/components/arc/skeleton/skeleton";
import { type DataColumn } from "@/components/arc/sortable-data-table/sortable-data-table";
import { LiveState, StaffHeading } from "@/components/segue/staff-shell";
import { ErrorState, LiveRegion, Panel, RiskBadge, StaleNote } from "@/components/segue/ui";
import { useLive } from "@/components/segue/use-live";
import { api, type AuthorityRequest } from "@/lib/api";
import { asRiskLevel, flightLabel, formatDateTime, RISK_RANK } from "@/lib/format";
import styles from "../staff.module.css";

export type Row = { id: string; name: string; flights: string; airport: string; deadline: number | null; deadlineText: string; status: number; level: string; requested: number; requestedText: string };

export const COLUMNS: DataColumn<Row>[] = [
  { key: "name", label: "Passenger", sortable: true, render: (_, row) => <span className={styles.strong}>{row.name}</span> },
  { key: "flights", label: "Flights", sortable: true, render: (_, row) => <span className={styles.nowrap}>{row.flights}</span> },
  { key: "airport", label: "Airport", sortable: true },
  { key: "deadline", label: "Deadline", sortable: true, numeric: false, render: (_, row) => <span className={`${styles.num} ${styles.nowrap}`}>{row.deadlineText}</span> },
  { key: "status", label: "Level", sortable: true, numeric: false, render: (_, row) => <RiskBadge level={row.level} size="sm" /> },
  { key: "requested", label: "Requested", sortable: true, numeric: false, render: (_, row) => <span className={`${styles.num} ${styles.nowrap}`}>{row.requestedText}</span> },
];

type Authority = ReturnType<typeof useAuthorityList>;
const AuthorityContext = createContext<Authority | null>(null);

/** Fast-track requests, loaded once for every Authority page. */
function useAuthorityList() {
  const list = useLive<AuthorityRequest[]>(api.authorityRequests, "authority");
  const data = list.data;

  const rows = useMemo<Row[]>(() => (data ?? []).map((request) => {
    const level = asRiskLevel(request.level);
    const deadline = request.deadline ? new Date(request.deadline).getTime() : NaN;
    return {
      id: request.id,
      name: request.name ?? "Not shared",
      flights: `${flightLabel(request.inbound)} → ${flightLabel(request.outbound)}`,
      airport: request.airport,
      deadline: Number.isNaN(deadline) ? null : deadline,
      deadlineText: request.deadline ? formatDateTime(request.deadline) : "Not set",
      status: level ? RISK_RANK[level] : 0,
      level: request.level,
      requested: new Date(request.created_at).getTime() || 0,
      requestedText: formatDateTime(request.created_at),
    };
  }), [data]);
  return { list, data, rows };
}

export function useAuthority(): Authority & { data: AuthorityRequest[] } {
  const authority = useContext(AuthorityContext);
  if (!authority?.data) throw new Error("useAuthority is used inside AuthorityProvider, once the list has loaded");
  return authority as Authority & { data: AuthorityRequest[] };
}

const HEADINGS: Record<string, { title: string; hint: string }> = {
  "/authority": { title: "Airport authority", hint: "Fast-track requests to approve or refuse." },
  "/authority/requests": { title: "Requests", hint: "Every fast-track request, earliest deadline first." },
};

export function AuthorityProvider({ children }: { children: ReactNode }) {
  const authority = useAuthorityList();
  const { list, data } = authority;
  const heading = HEADINGS[usePathname()] ?? HEADINGS["/authority"];
  return (
    <AuthorityContext.Provider value={authority}>
      <StaffHeading title={heading.title} hint={heading.hint} aside={<LiveState state={list.stream} />} />
      {data ? <LiveRegion>{`Requests updated: ${data.length} ${data.length === 1 ? "request" : "requests"}.`}</LiveRegion> : null}
      {data ? <StaleNote error={list.error} onRetry={() => void list.reload()} /> : null}
      {list.loading ? <Panel><Skeleton label="Loading fast-track requests" lines={5} /></Panel> : null}
      {!list.loading && !data ? <ErrorState error={list.error} onRetry={() => void list.reload()} title="The request list didn't load" /> : null}
      {data ? children : null}
    </AuthorityContext.Provider>
  );
}
