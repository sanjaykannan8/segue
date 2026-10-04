"use client";

import { Check, X } from "lucide-react";
import { Badge } from "@/components/arc/badge/badge";
import { DonutChart } from "@/components/arc/donut-chart/donut-chart";
import { LineChart } from "@/components/arc/line-chart/line-chart";
import { UsageMeter } from "@/components/arc/usage-meter/usage-meter";
import { Skeleton } from "@/components/arc/skeleton/skeleton";
import { ErrorState, Panel, PanelHeader, StaleNote } from "@/components/segue/ui";
import { humanize } from "@/lib/format";
import { clockTime } from "@/lib/hooks";
import styles from "../staff.module.css";
import { BreakerRow, useConsole } from "./console-data";

export default function ConsoleDashboardPage() {
  const { health, services, down, outbox } = useConsole();

  return (
    <>
    {health.data ? <StaleNote error={health.error} onRetry={() => void health.reload()} /> : null}
    {health.loading ? <Panel><Skeleton label="Loading service health" lines={5} /></Panel> : null}
    {!health.loading && !health.data ? <ErrorState error={health.error} onRetry={() => void health.reload()} title="Service health didn't load" /> : null}

    {health.data ? (
      <>
        <div className={styles.charts}>
          <Panel label="Health summary">
            <PanelHeader title="Health" hint={services.length === 0 ? "No services reported." : `${services.length - down} of ${services.length} services healthy. Checked every 5 seconds.`} />
            <DonutChart
              data={[
                { key: "healthy", label: "Healthy", value: services.length - down, color: "var(--chart-1)" },
                { key: "down", label: "Down", value: down, color: "var(--chart-3)" },
              ]}
              label="Services by health"
              unit="services"
              totalLabel="Services"
              size={148}
              thickness={20}
              groupBelow={0}
              emptyLabel="No services reported"
            />
          </Panel>

          <Panel label="AirLabs budget">
            <PanelHeader title="AirLabs budget" hint="Flight status calls against the budget." />
            <UsageMeter label="Calls used" segments={[{ id: "used", label: "Used", value: health.data.airlabs.used }]} limit={health.data.airlabs.budget} unit="calls" decimals={0} freeLabel="Left" overLabel="Over budget" />
          </Panel>

          <Panel label="Outbox">
            <PanelHeader title="Outbox" hint={`${health.data.outbox_pending} pending now. Trend since you opened this page.`} />
            <LineChart
              data={outbox.length > 1 ? outbox.map((sample, index) => ({ key: String(sample.at), label: clockTime(sample.at), axisLabel: index === 0 || index === outbox.length - 1 ? clockTime(sample.at) : undefined, values: { pending: sample.pending } })) : []}
              series={[{ key: "pending", label: "Pending decisions", color: "var(--chart-1)" }]}
              label="Outbox pending"
              height={132}
              legend={false}
              categoryLabel="Time"
              emptyLabel="Collecting. The line appears after the next check"
              formatTick={(value) => String(Math.round(value))}
            />
          </Panel>
        </div>

        <Panel label="Service health">
          <PanelHeader title="Services" hint={down === 0 ? "All services are up." : `${down} down.`} />
          <div className={styles.tiles}>
            {services.map(([name, service]) => (
              <div key={name} className={styles.tile}>
                <div className={styles.tileTop}>
                  <span className={styles.tileName}>{humanize(name)}</span>
                  <Badge size="sm" tone={service.ok ? "info" : "neutral"} icon={service.ok ? <Check width={12} height={12} aria-hidden="true" /> : <X width={12} height={12} aria-hidden="true" />}>{service.ok ? "OK" : "Down"}</Badge>
                </div>
                <p className={styles.tileDetail}>{service.detail || (service.ok ? "Responding" : "No detail given")}</p>
              </div>
            ))}
          </div>
        </Panel>

        <Panel label="Circuit breakers">
          <PanelHeader title="Breakers" hint="Auto lets each breaker open and close itself." />
          <div className={styles.breakers}>
            {health.data.breakers.length
              ? health.data.breakers.map((breaker) => <BreakerRow key={breaker.name} breaker={breaker} onChanged={() => void health.reload()} />)
              : <p className={styles.muted}>No breakers reported.</p>}
          </div>
        </Panel>
      </>
    ) : null}
    </>
  );
}
