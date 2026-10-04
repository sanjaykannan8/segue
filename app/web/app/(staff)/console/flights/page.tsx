"use client";

import { useMemo } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/arc/button/button";
import { EmptyState } from "@/components/arc/empty-state/empty-state";
import { Skeleton } from "@/components/arc/skeleton/skeleton";
import { ChipGroup, FilterBar, matches, NoMatches, useFilters } from "@/components/segue/filters";
import { ErrorState, Mascot, Panel, PanelHeader, StaleNote } from "@/components/segue/ui";
import { flightLabel, flightStatusLabel, formatAge, humanize } from "@/lib/format";
import styles from "../../staff.module.css";
import { useConsole } from "../console-data";

export default function ConsoleFlightsPage() {
  const { flights, setTarget } = useConsole();
  const all = useMemo(() => flights.data ?? [], [flights.data]);
  const { query, setQuery, filters, set, active, clear } = useFilters<{ status: string; source: string }>({ status: "all", source: "all" });
  const statuses = useMemo(() => [...new Set(all.map((flight) => flight.status))].sort(), [all]);
  const shownFlights = all.filter((flight) =>
    matches(query, flightLabel(flight.flight_iata), flight.flight_iata, flight.origin, flight.dest, flight.dep_gate, flight.arr_gate, flight.date)
    && (filters.status === "all" || flight.status === filters.status)
    && (filters.source === "all" || flight.source === filters.source));

  return (
    <>
      {flights.data ? (
        <FilterBar label="Filter tracked flights" query={query} onQuery={setQuery} placeholder="Search by flight, airport or gate" shown={shownFlights.length} total={all.length} noun={{ one: "flight", other: "flights" }} active={active} onClear={clear}>
          <ChipGroup label="Status" value={filters.status} onChange={(next) => set("status", next)} options={[{ value: "all", label: "All" }, ...statuses.map((status) => ({ value: status, label: humanize(status), count: all.filter((flight) => flight.status === status).length }))]} />
          <ChipGroup label="Source" value={filters.source} onChange={(next) => set("source", next)} options={[{ value: "all", label: "All" }, { value: "airlabs", label: "AirLabs" }, { value: "manual", label: "Manual" }]} />
        </FilterBar>
      ) : null}
      <Panel label="Tracked flights">
        <PanelHeader title="Tracked flights" hint="Inject an event to simulate a delay, a gate change or a new status." />
        {flights.data ? <StaleNote error={flights.error} onRetry={() => void flights.reload()} /> : null}
        {flights.loading ? <Skeleton label="Loading tracked flights" lines={4} /> : null}
        {!flights.loading && !flights.data ? <ErrorState compact error={flights.error} onRetry={() => void flights.reload()} title="Flights didn't load" /> : null}
        {flights.data && flights.data.length === 0 ? <EmptyState icon={<Mascot pose="sleepy" size={40} />} title="No flights tracked yet" description="Flights appear here once a passenger adds a trip." label="No tracked flights" /> : null}
        {flights.data && flights.data.length > 0 && shownFlights.length === 0 ? <NoMatches onClear={clear} /> : null}
        {flights.data && shownFlights.length > 0 ? (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <caption className="sr-only">Tracked flights</caption>
              <thead>
                <tr>
                  <th scope="col">Flight</th>
                  <th scope="col">Date</th>
                  <th scope="col">Route</th>
                  <th scope="col">Status</th>
                  <th scope="col">Dep. gate</th>
                  <th scope="col">Arr. gate</th>
                  <th scope="col" className={styles.right}>Version</th>
                  <th scope="col">Source</th>
                  <th scope="col">Updated</th>
                  <th scope="col" className={styles.right}><span className="sr-only">Action</span></th>
                </tr>
              </thead>
              <tbody>
                {shownFlights.map((flight) => (
                  <tr key={flight.id}>
                    <td className={`${styles.strong} ${styles.nowrap}`}>{flightLabel(flight.flight_iata)}</td>
                    <td className={`${styles.num} ${styles.nowrap}`}>{flight.date}</td>
                    <td><span className={styles.route}>{flight.origin} <ArrowRight width={14} height={14} aria-label="to" /> {flight.dest}</span></td>
                    <td>{flightStatusLabel(flight)}</td>
                    <td>{[flight.dep_terminal ? `T${flight.dep_terminal.replace(/^T/i, "")}` : null, flight.dep_gate].filter(Boolean).join(" · ") || "Not set"}</td>
                    <td>{[flight.arr_terminal ? `T${flight.arr_terminal.replace(/^T/i, "")}` : null, flight.arr_gate].filter(Boolean).join(" · ") || "Not set"}</td>
                    <td className={`${styles.right} ${styles.num}`}>{flight.version}</td>
                    <td>{flight.source === "airlabs" ? "AirLabs" : "Manual"}</td>
                    <td className={styles.nowrap}>{formatAge(flight.age_sec)}</td>
                    <td className={styles.right}><Button size="sm" variant="secondary" onClick={() => setTarget(flight)} aria-label={`Inject event for ${flightLabel(flight.flight_iata)}`}>Inject event</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </Panel>
    </>
  );
}
