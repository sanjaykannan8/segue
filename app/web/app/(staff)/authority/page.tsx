"use client";

import { useMemo } from "react";
import { Alert } from "@/components/arc/alert/alert";
import { EmptyState } from "@/components/arc/empty-state/empty-state";
import { Skeleton } from "@/components/arc/skeleton/skeleton";
import { SortableDataTable, type DataColumn } from "@/components/arc/sortable-data-table/sortable-data-table";
import { LiveState, StaffHeading } from "@/components/segue/staff-shell";
import { ErrorState, LiveRegion, Mascot, Panel, PanelHeader, RiskBadge, StaleNote } from "@/components/segue/ui";
import { useLive } from "@/components/segue/use-live";
import { api, type AuthorityRequest } from "@/lib/api";
import { asRiskLevel, flightLabel, formatDateTime, RISK_RANK } from "@/lib/format";
import styles from "../staff.module.css";

type Row = { id: string; name: string; flights: string; airport: string; deadline: number | null; deadlineText: string; status: number; level: string; requested: number; requestedText: string };

const COLUMNS: DataColumn<Row>[] = [
  { key: "name", label: "Passenger", sortable: true, render: (_, row) => <span className={styles.strong}>{row.name}</span> },
  { key: "flights", label: "Flights", sortable: true, render: (_, row) => <span className={styles.nowrap}>{row.flights}</span> },
  { key: "airport", label: "Airport", sortable: true },
  { key: "deadline", label: "Deadline", sortable: true, numeric: false, render: (_, row) => <span className={`${styles.num} ${styles.nowrap}`}>{row.deadlineText}</span> },
  { key: "status", label: "Level", sortable: true, numeric: false, render: (_, row) => <RiskBadge level={row.level} size="sm" /> },
  { key: "requested", label: "Requested", sortable: true, numeric: false, render: (_, row) => <span className={`${styles.num} ${styles.nowrap}`}>{row.requestedText}</span> },
];

export default function AuthorityPage() {
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

  return (
    <>
      <StaffHeading title="Airport authority" hint="Fast-track requests to approve or refuse." aside={<LiveState state={list.stream} />} />
      <Alert tone="info" title="The airport decides.">Segue only asks for fast-track; you approve or refuse it in your own system. Every passenger on this list consented to sharing these details. Names are masked. Confirm with the flight.</Alert>
      {data ? <LiveRegion>{`Requests updated: ${data.length} ${data.length === 1 ? "request" : "requests"}.`}</LiveRegion> : null}
      {data ? <StaleNote error={list.error} onRetry={() => void list.reload()} /> : null}
      {list.loading ? <Panel><Skeleton label="Loading fast-track requests" lines={5} /></Panel> : null}
      {!list.loading && !data ? <ErrorState error={list.error} onRetry={() => void list.reload()} title="The request list didn't load" /> : null}
      {data && data.length === 0 ? (
        <Panel><EmptyState icon={<Mascot pose="sleepy" size={40} />} title="No requests right now" description="A request appears here when a passenger at Dubai International is short on time for a connection and has consented to sharing their name and flights with the airport." /></Panel>
      ) : null}
      {data && data.length > 0 ? (
        <Panel label="Fast-track requests">
          <PanelHeader title="Fast-track requests" hint="Earliest deadline first." />
          <SortableDataTable rows={rows} columns={COLUMNS} rowKey="id" caption="Fast-track requests" defaultSort={{ key: "deadline", direction: "asc" }} itemName={{ one: "request", other: "requests" }} />
        </Panel>
      ) : null}
    </>
  );
}
