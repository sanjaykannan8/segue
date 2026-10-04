"use client";

import { useMemo } from "react";
import { BarChart } from "@/components/arc/bar-chart/bar-chart";
import { Skeleton } from "@/components/arc/skeleton/skeleton";
import { ChipGroup, FilterBar, matches, NoMatches, useFilters } from "@/components/segue/filters";
import { ErrorState, Panel, PanelHeader, StaleNote } from "@/components/segue/ui";
import { formatDateTime } from "@/lib/format";
import styles from "../../staff.module.css";
import { ReplayButton, useConsole } from "../console-data";

export default function ConsoleDeadLettersPage() {
  const { health, dlq, refreshAll, queueBars, waiting } = useConsole();
  const events = useMemo(() => dlq.data?.events ?? [], [dlq.data]);
  const { query, setQuery, filters, set, active, clear } = useFilters<{ topic: string }>({ topic: "all" });
  const topics = useMemo(() => [...new Set(events.map((event) => event.topic))].sort(), [events]);
  const shownEvents = events.filter((event) =>
    matches(query, event.topic, event.error, typeof event.payload === "string" ? event.payload : JSON.stringify(event.payload))
    && (filters.topic === "all" || event.topic === filters.topic));

  return (
    <>
      {dlq.data ? (
        <FilterBar label="Filter dead events" query={query} onQuery={setQuery} placeholder="Search by topic, error or payload" shown={shownEvents.length} total={events.length} noun={{ one: "dead event", other: "dead events" }} active={active} onClear={clear}>
          {topics.length > 1 ? <ChipGroup label="Topic" value={filters.topic} onChange={(next) => set("topic", next)} options={[{ value: "all", label: "All" }, ...topics.map((topic) => ({ value: topic, label: topic, count: events.filter((event) => event.topic === topic).length }))]} /> : null}
        </FilterBar>
      ) : null}
      <Panel label="Dead letters">
        <PanelHeader title="Dead letters" hint={health.data ? `${health.data.dead_events} dead ${health.data.dead_events === 1 ? "event" : "events"} in total.` : "Events and messages that failed after retries."} />
        {dlq.data ? <StaleNote error={dlq.error} onRetry={() => void dlq.reload()} /> : null}
        {dlq.loading ? <Skeleton label="Loading dead letters" lines={4} /> : null}
        {!dlq.loading && !dlq.data ? <ErrorState compact error={dlq.error} onRetry={() => void dlq.reload()} title="Dead letters didn't load" /> : null}
        {dlq.data ? (
          <>
            <h3 className={styles.sub} style={{ marginTop: 0 }}>Dead events</h3>
            {shownEvents.length === 0 ? (dlq.data.events.length ? <NoMatches onClear={clear} /> : <p className={styles.muted}>No dead events.</p>) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <caption className="sr-only">Dead events</caption>
                  <thead>
                    <tr>
                      <th scope="col">Topic</th>
                      <th scope="col">Error</th>
                      <th scope="col">Payload</th>
                      <th scope="col">When</th>
                      <th scope="col" className={styles.right}><span className="sr-only">Action</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {shownEvents.map((event) => (
                      <tr key={event.id}>
                        <td className={styles.mono}>{event.topic}</td>
                        <td>{event.error}</td>
                        <td><pre className={`${styles.mono} ${styles.payload}`} tabIndex={0}>{typeof event.payload === "string" ? event.payload : JSON.stringify(event.payload, null, 1)}</pre></td>
                        <td className={styles.nowrap}>{formatDateTime(event.created_at)}</td>
                        <td className={styles.right}><ReplayButton body={{ kind: "event", id: event.id }} label={`Replay event on ${event.topic}`} onReplayed={refreshAll} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <h3 className={styles.sub}>Dead-letter queues</h3>
            {queueBars.length ? (
              <div className={styles.chartBox}>
                <BarChart data={queueBars} label="Dead-letter queue depth" period={waiting === 0 ? "All queues are empty" : "Messages waiting, by queue"} unit="messages" averageLabel="Average depth" valueLabel="Depth" categoryLabel="Queue" showAverage={false} height={132} />
              </div>
            ) : null}
            {dlq.data.queues.length === 0 ? <p className={styles.muted}>No queues reported.</p> : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <caption className="sr-only">Dead-letter queues</caption>
                  <thead>
                    <tr>
                      <th scope="col">Queue</th>
                      <th scope="col" className={styles.right}>Messages</th>
                      <th scope="col" className={styles.right}><span className="sr-only">Action</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {dlq.data.queues.map((queue) => (
                      <tr key={queue.name}>
                        <td className={styles.mono}>{queue.name}</td>
                        <td className={`${styles.right} ${styles.num}`}>{queue.messages}</td>
                        <td className={styles.right}><ReplayButton body={{ kind: "queue", name: queue.name }} label={`Replay queue ${queue.name}`} disabled={queue.messages === 0} onReplayed={refreshAll} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : null}
      </Panel>
    </>
  );
}
