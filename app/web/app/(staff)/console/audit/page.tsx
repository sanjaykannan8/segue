"use client";

import { useMemo } from "react";
import { Skeleton } from "@/components/arc/skeleton/skeleton";
import { ChipGroup, FilterBar, matches, NoMatches, useFilters } from "@/components/segue/filters";
import { ErrorState, Panel, PanelHeader, StaleNote } from "@/components/segue/ui";
import { formatDateTime, humanize } from "@/lib/format";
import styles from "../../staff.module.css";
import { useConsole } from "../console-data";

export default function ConsoleAuditPage() {
  const { audit } = useConsole();
  const entries = useMemo(() => audit.data ?? [], [audit.data]);
  const { query, setQuery, filters, set, active, clear } = useFilters<{ role: string }>({ role: "all" });
  const roles = useMemo(() => [...new Set(entries.map((entry) => entry.role))].sort(), [entries]);
  const shownAudit = entries.filter((entry) =>
    matches(query, entry.actor, entry.action, humanize(entry.action), entry.object)
    && (filters.role === "all" || entry.role === filters.role));

  return (
    <>
      {audit.data ? (
        <FilterBar label="Filter the audit log" query={query} onQuery={setQuery} placeholder="Search by person, action or object" shown={shownAudit.length} total={entries.length} noun={{ one: "entry", other: "entries" }} active={active} onClear={clear}>
          {roles.length > 1 ? <ChipGroup label="Role" value={filters.role} onChange={(next) => set("role", next)} options={[{ value: "all", label: "All" }, ...roles.map((role) => ({ value: role, label: humanize(role), count: entries.filter((entry) => entry.role === role).length }))]} /> : null}
        </FilterBar>
      ) : null}
      <Panel label="Audit log">
        <PanelHeader title="Audit log" hint="The latest 100 actions." />
        {audit.data ? <StaleNote error={audit.error} onRetry={() => void audit.reload()} /> : null}
        {audit.loading ? <Skeleton label="Loading the audit log" lines={4} /> : null}
        {!audit.loading && !audit.data ? <ErrorState compact error={audit.error} onRetry={() => void audit.reload()} title="The audit log didn't load" /> : null}
        {audit.data && audit.data.length === 0 ? <p className={styles.muted}>Nothing logged yet.</p> : null}
        {audit.data && audit.data.length > 0 && shownAudit.length === 0 ? <NoMatches onClear={clear} /> : null}
        {audit.data && shownAudit.length > 0 ? (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <caption className="sr-only">Recent audit log</caption>
              <thead>
                <tr>
                  <th scope="col">When</th>
                  <th scope="col">Actor</th>
                  <th scope="col">Role</th>
                  <th scope="col">Action</th>
                  <th scope="col">Object</th>
                </tr>
              </thead>
              <tbody>
                {shownAudit.map((entry, index) => (
                  <tr key={`${entry.at}-${index}`}>
                    <td className={`${styles.num} ${styles.nowrap}`}>{formatDateTime(entry.at)}</td>
                    <td>{entry.actor}</td>
                    <td>{humanize(entry.role)}</td>
                    <td>{humanize(entry.action)}</td>
                    <td className={styles.mono}>{entry.object}</td>
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
