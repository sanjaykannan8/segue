"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { GitBranch, Inbox, Radio, Send, ShieldCheck, Timer, TrendingUp, User, Workflow, Zap, type LucideIcon } from "lucide-react";
import { Alert } from "@/components/arc/alert/alert";
import { Badge } from "@/components/arc/badge/badge";
import { Button } from "@/components/arc/button/button";
import { DonutChart } from "@/components/arc/donut-chart/donut-chart";
import { EmptyState } from "@/components/arc/empty-state/empty-state";
import { Skeleton } from "@/components/arc/skeleton/skeleton";
import { LiveState, StaffHeading } from "@/components/segue/staff-shell";
import { ErrorState, Mascot, Panel, PanelHeader, RiskBadge } from "@/components/segue/ui";
import { api, errorMessage, streams, useEventStream, useResource, type TraceEntry, type TraceStage } from "@/lib/api";
import { asRiskLevel, formatBuffer, humanize, RISK_LABEL } from "@/lib/format";
import { clockTime } from "@/lib/hooks";
import { ConnectionStrip, PassengerGrid, StoryCard } from "./demo-board";
import board_styles from "./demo-board.module.css";
import styles from "./demo.module.css";

/* ───────────── Reading trace details safely ───────────── */

const text = (value: unknown): string | null => (typeof value === "string" && value ? value : typeof value === "number" ? String(value) : null);
const num = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);
const record = (value: unknown): Record<string, unknown> => (value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {});
const percent = (value: unknown): string | null => { const n = num(value); return n === null ? null : `${Math.round(n * 100)}%`; };

const STAGE: Record<TraceStage, { label: string; Icon: LucideIcon }> = {
  event: { label: "Event", Icon: Radio },
  buffer: { label: "Buffer", Icon: Timer },
  risk: { label: "Risk", Icon: TrendingUp },
  ops: { label: "Ops decision", Icon: Workflow },
  passenger: { label: "Passenger", Icon: User },
  decision: { label: "Decision", Icon: GitBranch },
  publish: { label: "Published", Icon: Send },
  deliver: { label: "Delivered", Icon: Inbox },
};
const STAGES = Object.keys(STAGE) as TraceStage[];

const GATE = {
  auto: { label: "Runs itself", Icon: Zap, color: "var(--chart-1)" },
  approval: { label: "Needs approval", Icon: ShieldCheck, color: "var(--chart-2)" },
  human: { label: "Needs a person", Icon: User, color: "var(--chart-3)" },
} as const;
type GateKey = keyof typeof GATE;
const gateOf = (value: unknown): GateKey | null => (value === "auto" || value === "approval" || value === "human" ? value : null);

const AUDIENCES = [
  { key: "pax", label: "Passenger" },
  { key: "ops", label: "Ops" },
  { key: "crew", label: "Cabin crew" },
  { key: "ground", label: "Ground" },
  { key: "authority", label: "Authority" },
] as const;

const NODES = [
  { key: "event", label: "Event", sub: "Redpanda" },
  { key: "buffer", label: "Buffer", sub: "Exact time sums, in code" },
  { key: "risk", label: "Risk", sub: "clef-flash + cache" },
  { key: "decisions", label: "Decisions", sub: "clef-flash" },
  { key: "outbox", label: "Outbox", sub: "Saved with the decision" },
  { key: "rabbit", label: "RabbitMQ", sub: "One queue per audience" },
] as const;

/** Which diagram nodes a trace entry lights up. */
function nodesFor(entry: TraceEntry): string[] {
  switch (entry.stage) {
    case "event": return ["event"];
    case "buffer": return ["buffer"];
    case "risk": return ["risk"];
    case "ops": case "passenger": case "decision": return ["decisions"];
    case "publish": return ["outbox", "rabbit"];
    case "deliver": return [`aud:${text(entry.detail.audience) ?? "pax"}`];
    default: return [];
  }
}

const hasAnswers = (entry: TraceEntry) => Object.keys(record(entry.detail.answers)).length > 0;
const timeOf = (entry: TraceEntry) => new Date(entry.at).getTime();

/* ───────────── Entry details, readable ───────────── */

function ProbabilityBars({ value }: { value: unknown }) {
  const rows = Object.entries(record(value)).flatMap(([key, v]) => (typeof v === "number" ? [[key, v] as const] : [])).sort((a, b) => b[1] - a[1]).slice(0, 5);
  if (!rows.length) return null;
  return (
    <ul className={styles.bars} aria-label="Probability of each option">
      {rows.map(([key, v]) => (
        <li key={key}>
          <span className={styles.barLabel}>{asRiskLevel(key) ? RISK_LABEL[asRiskLevel(key)!] : humanize(key)}</span>
          <span className={styles.barTrack}><span className={styles.barFill} style={{ width: `${Math.round(Math.min(1, Math.max(0, v)) * 100)}%` }} /></span>
          <span className={styles.barValue}>{Math.round(v * 100)}%</span>
        </li>
      ))}
    </ul>
  );
}

function Chip({ children }: { children: ReactNode }) {
  return <span className={styles.chip}>{children}</span>;
}

function EntryDetail({ entry }: { entry: TraceEntry }) {
  const d = entry.detail;
  switch (entry.stage) {
    case "event":
      return <div className={styles.facts}>{text(d.type) ? <Chip>{humanize(text(d.type)!.replace(/\./g, " "))}</Chip> : null}{text(d.topic) ? <Chip>Topic {text(d.topic)}</Chip> : null}</div>;
    case "buffer":
      return (
        <div className={styles.facts}>
          {num(d.left_min) !== null ? <Chip>{Math.round(num(d.left_min)!)} min left</Chip> : null}
          {num(d.needed_min) !== null ? <Chip>{Math.round(num(d.needed_min)!)} min needed</Chip> : null}
          {num(d.buffer_min) !== null ? <Chip>Buffer {formatBuffer(num(d.buffer_min))}</Chip> : null}
          {Array.isArray(d.steps) ? d.steps.map((step, index) => { const s = record(step); return <Chip key={index}>{text(s.label)} {num(s.minutes) !== null ? `${Math.round(num(s.minutes)!)} min` : ""}</Chip>; }) : null}
        </div>
      );
    case "risk":
      return (
        <>
          <div className={styles.facts}>
            <RiskBadge level={text(d.level)} size="sm" />
            <Chip>{d.cache === "hit" ? "Cache hit, no model call" : "Cache miss"}</Chip>
            {text(d.source) ? <Chip>{d.source === "rules" ? "Fixed rules" : "Model"}</Chip> : null}
            {num(d.model_ms) !== null && d.cache !== "hit" ? <Chip>{Math.round(num(d.model_ms)!)} ms</Chip> : null}
            {percent(d.confidence) ? <Chip>Confidence {percent(d.confidence)}</Chip> : null}
          </div>
          <ProbabilityBars value={d.probabilities} />
        </>
      );
    case "ops":
      return (
        <>
          <div className={styles.facts}>
            {text(d.answer) ? <Chip>Answer: {humanize(text(d.answer))}</Chip> : null}
            {percent(d.confidence) ? <Chip>Confidence {percent(d.confidence)}</Chip> : null}
            {num(d.protected_passengers) !== null ? <Chip>{num(d.protected_passengers)} on one booking</Chip> : null}
            {num(d.self_transfer_passengers) !== null ? <Chip>{num(d.self_transfer_passengers)} on separate tickets</Chip> : null}
          </div>
          <ProbabilityBars value={d.probabilities} />
        </>
      );
    case "passenger": {
      const answers = Object.entries(record(d.answers));
      return (
        <div className={styles.facts}>
          <Chip>Seat {text(d.seat) ?? "not given"}</Chip>
          <RiskBadge level={text(d.level)} size="sm" />
          {num(d.buffer_min) !== null ? <Chip>Buffer {formatBuffer(num(d.buffer_min))}</Chip> : null}
          {text(d.booking) ? <Chip>{d.booking === "separate_tickets" ? "Separate tickets" : "One booking"}</Chip> : null}
          {answers.length === 0 ? <Chip>No model call needed</Chip> : answers.map(([question, answer]) => {
            const a = record(answer);
            return <Chip key={question}>{humanize(question)}: {humanize(text(a.answer)) || "none"}{percent(a.confidence) ? ` (${percent(a.confidence)})` : ""}</Chip>;
          })}
        </div>
      );
    }
    case "decision": {
      const gate = gateOf(d.gate);
      const G = gate ? GATE[gate] : null;
      return (
        <div className={styles.facts}>
          {G ? <Badge size="sm" tone={gate === "auto" ? "neutral" : "info"} icon={<G.Icon width={12} height={12} aria-hidden="true" />}>{G.label}</Badge> : null}
          {text(d.type) ? <Chip>{humanize(text(d.type))}: {humanize(text(d.answer)) || "none"}</Chip> : null}
          {percent(d.confidence) ? <Chip>Confidence {percent(d.confidence)}</Chip> : null}
          {text(d.seat) ? <Chip>Seat {text(d.seat)}</Chip> : null}
          {text(d.target) ? <Chip>To {text(d.target)}</Chip> : null}
        </div>
      );
    }
    case "publish":
      return <div className={styles.facts}>{text(d.routing_key) ? <Chip>Routing key {text(d.routing_key)}</Chip> : null}{num(d.wait_ms) !== null ? <Chip>Waited {Math.round(num(d.wait_ms)!)} ms in the outbox</Chip> : null}</div>;
    case "deliver": {
      const audience = AUDIENCES.find((a) => a.key === d.audience);
      return (
        <div className={styles.facts}>
          <Chip>To {audience?.label ?? text(d.audience) ?? "unknown"}</Chip>
          {text(d.template) ? <Chip>{humanize(text(d.template))}</Chip> : null}
          {text(d.seat) ? <Chip>Seat {text(d.seat)}</Chip> : null}
          {text(d.queue) ? <Chip>Queue {text(d.queue)}</Chip> : null}
        </div>
      );
    }
    default:
      return null;
  }
}

/* ───────────── Page ───────────── */

type StepKey = "seed" | "delay" | "gate" | "down" | "up" | "reset";
const MAX_ENTRIES = 600;

export default function DemoPage() {
  const demo = useResource(api.demo);
  const health = useResource(api.adminHealth);
  const [entries, setEntries] = useState<TraceEntry[]>([]);
  const [traceError, setTraceError] = useState<unknown>(null);
  const [traceLoaded, setTraceLoaded] = useState(false);
  const [busy, setBusy] = useState<StepKey | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [hot, setHot] = useState<Set<string>>(() => new Set());
  const [paused, setPaused] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [seenAtPause, setSeenAtPause] = useState(0);
  const timers = useRef(new Map<string, number>());

  const merge = useCallback((incoming: TraceEntry[]) => {
    setEntries((current) => {
      const known = new Set(current.map((entry) => entry.id));
      const fresh = incoming.filter((entry) => !known.has(entry.id));
      if (!fresh.length) return current;
      return [...current, ...fresh].sort((a, b) => timeOf(a) - timeOf(b)).slice(-MAX_ENTRIES);
    });
  }, []);

  const loadTrace = useCallback(async (replace = false) => {
    try {
      const rows = await api.trace(300);
      if (replace) setEntries([...rows].reverse());
      else merge(rows);
      setTraceError(null);
    } catch (error) { setTraceError(error); } finally { setTraceLoaded(true); }
  }, [merge]);
  useEffect(() => { void loadTrace(true); }, [loadTrace]);

  // A node that just received an entry is tinted for a moment, then settles. One transition, no looping.
  const light = useCallback((keys: string[]) => {
    if (!keys.length) return;
    setHot((current) => new Set([...current, ...keys]));
    for (const key of keys) {
      window.clearTimeout(timers.current.get(key));
      timers.current.set(key, window.setTimeout(() => setHot((current) => { const next = new Set(current); next.delete(key); return next; }), 1200));
    }
  }, []);
  useEffect(() => { const map = timers.current; return () => { map.forEach((timer) => window.clearTimeout(timer)); }; }, []);

  const reloadDemo = demo.reload;
  const running = !!demo.data?.demo;
  // The people view: refetched after each step, shortly after any trace entry, and every 3 s while a demo runs
  // (decisions land a second or two after the first trace entry).
  const board = useResource(api.demoBoard, { pollMs: running ? 3000 : undefined });
  const reloadBoard = board.reload;
  const boardTimer = useRef<number | undefined>(undefined);
  const refreshBoardSoon = useCallback(() => {
    window.clearTimeout(boardTimer.current);
    boardTimer.current = window.setTimeout(() => { void reloadBoard(); }, 700);
  }, [reloadBoard]);
  useEffect(() => () => window.clearTimeout(boardTimer.current), []);
  const [approving, setApproving] = useState<string | null>(null);
  const onTrace = useCallback((data: unknown) => {
    const entry = data as TraceEntry;
    if (!entry || typeof entry.id !== "string" || typeof entry.stage !== "string") return;
    merge([{ ...entry, detail: record(entry.detail) }]);
    light(nodesFor(entry));
    if (entry.stage === "risk") void reloadDemo();
    refreshBoardSoon();
  }, [merge, light, reloadDemo, refreshBoardSoon]);
  const stream = useEventStream(streams.trace, { trace: onTrace });

  const state = demo.data?.demo ?? null;
  const model = health.data?.breakers.find((breaker) => breaker.name === "model");
  const modelDown = model ? model.forced === "open" || model.state === "open" : false;

  async function run(key: StepKey, action: () => Promise<unknown>, clears = false) {
    setBusy(key);
    setActionError(null);
    try {
      await action();
      if (clears) { setEntries([]); setPicked(null); setPaused(false); await loadTrace(true); }
    } catch (error) {
      setActionError(errorMessage(error));
    } finally {
      await Promise.all([demo.reload(), health.reload(), board.reload()]);
      setBusy(null);
    }
  }

  async function approve(decisionId: string) {
    setApproving(decisionId);
    setActionError(null);
    try { await api.approveDecision(decisionId); } catch (error) { setActionError(errorMessage(error)); } finally {
      await board.reload();
      setApproving(null);
    }
  }

  const steps: { key: StepKey; title: string; line: string; enabled: boolean; action: () => Promise<unknown>; clears?: boolean; secondary?: boolean }[] = [
    { key: "seed", title: "Seed passengers", line: "8 made-up passengers on one connection", enabled: !state, action: () => api.demoRun(), clears: true },
    { key: "delay", title: "Delay inbound 25 min", line: "A flight event enters the system", enabled: !!state, action: () => api.injectEvent({ flight_id: state!.inbound.id, delay_min: 25 }) },
    { key: "gate", title: "Change the gate", line: "The outbound moves to gate A07", enabled: !!state, action: () => api.injectEvent({ flight_id: state!.outbound.id, dep_gate: "A07" }) },
    { key: "down", title: "Take the model down", line: "Risk falls back to fixed rules", enabled: !!state && !modelDown, action: async () => { await api.setBreaker("model", "open"); await api.injectEvent({ flight_id: state!.inbound.id, delay_min: 30 }); } },
    { key: "up", title: "Bring the model back", line: "The breaker returns to automatic", enabled: modelDown, action: () => api.setBreaker("model", "auto") },
    { key: "reset", title: "Reset", line: "Erase the demo and clear the trace", enabled: !!state || entries.length > 0 || modelDown, action: () => api.demoReset(), clears: true, secondary: true },
  ];

  /* Counts and latest facts for the diagram */
  const nodes = useMemo(() => {
    const count: Record<string, number> = {};
    const fact: Record<string, string> = {};
    let decisions = 0;
    for (const entry of entries) {
      for (const key of nodesFor(entry)) count[key] = (count[key] ?? 0) + 1;
      const d = entry.detail;
      if (entry.stage === "event") fact.event = text(d.type) ? humanize(text(d.type)!.replace(/\./g, " ")) : entry.title;
      if (entry.stage === "buffer" && num(d.buffer_min) !== null) fact.buffer = formatBuffer(num(d.buffer_min));
      if (entry.stage === "risk") {
        const level = asRiskLevel(text(d.level));
        fact.risk = [level ? RISK_LABEL[level] : humanize(text(d.level)), d.cache === "hit" ? "cache hit" : "cache miss", d.cache !== "hit" && num(d.model_ms) !== null ? `${Math.round(num(d.model_ms)!)} ms` : null].filter(Boolean).join(" · ");
      }
      if (entry.stage === "decision") decisions += 1;
      if (entry.stage === "publish") {
        if (num(d.wait_ms) !== null) fact.outbox = `Waited ${Math.round(num(d.wait_ms)!)} ms`;
        if (text(d.routing_key)) fact.rabbit = text(d.routing_key)!;
      }
      if (entry.stage === "deliver") fact[`aud:${text(d.audience) ?? "pax"}`] = text(d.template) ? humanize(text(d.template)) : entry.title;
    }
    if (decisions) fact.decisions = `${decisions} ${decisions === 1 ? "decision" : "decisions"}`;
    return { count, fact };
  }, [entries]);

  /* Scorecard */
  const score = useMemo(() => {
    const of = (stage: TraceStage) => entries.filter((entry) => entry.stage === stage);
    const risk = of("risk");
    const modelCalls = risk.filter((e) => e.detail.cache === "miss" && e.detail.source === "model").length + of("ops").length + of("passenger").filter(hasAnswers).length;
    const cached = risk.filter((e) => e.detail.cache === "hit").length;
    const gates = { auto: 0, approval: 0, human: 0 };
    for (const e of of("decision")) { const gate = gateOf(e.detail.gate); if (gate) gates[gate] += 1; }
    const delivered = of("deliver");
    const byAudience = AUDIENCES.map((a) => ({ ...a, value: delivered.filter((e) => e.detail.audience === a.key).length }));
    // The most recent event that has both its start and a delivery.
    let seconds: number | null = null;
    const starts = of("event").filter((e) => e.event_id);
    for (let i = starts.length - 1; i >= 0 && seconds === null; i -= 1) {
      const last = delivered.filter((e) => e.event_id === starts[i].event_id).pop();
      if (last) seconds = Math.max(0, (timeOf(last) - timeOf(starts[i])) / 1000);
    }
    return { modelCalls, cached, gates, decisions: of("decision").length, delivered: delivered.length, byAudience, seconds };
  }, [entries]);

  /* Events list */
  const events = useMemo(() => {
    const groups = new Map<string, TraceEntry[]>();
    for (const entry of entries) {
      const key = entry.event_id ?? "none";
      const list = groups.get(key);
      if (list) list.push(entry); else groups.set(key, [entry]);
    }
    return [...groups.entries()].map(([key, list]) => {
      const head = list.find((entry) => entry.stage === "event") ?? list[0];
      const counts = STAGES.map((stage) => ({ stage, count: list.filter((entry) => entry.stage === stage).length })).filter((item) => item.count > 0);
      return { key, title: key === "none" && head.stage !== "event" ? "System activity" : head.title, at: timeOf(list[0]), entries: list, counts };
    }).sort((a, b) => b.at - a.at);
  }, [entries]);

  const newest = events[0]?.key ?? null;
  const selectedKey = paused && picked && events.some((event) => event.key === picked) ? picked : newest;
  const selected = events.find((event) => event.key === selectedKey) ?? null;
  const newCount = paused ? Math.max(0, entries.length - seenAtPause) : 0;

  const togglePause = () => {
    if (paused) { setPaused(false); setPicked(null); }
    else { setPaused(true); setPicked(selectedKey); setSeenAtPause(entries.length); }
  };
  const pick = (key: string) => { if (!paused) setSeenAtPause(entries.length); setPaused(true); setPicked(key); };

  const empty = traceLoaded && entries.length === 0;

  return (
    <>
      <StaffHeading title="Live demo" hint="Run a scenario and watch every step the system takes." aside={<LiveState state={stream} />} />

      {/* Scenario */}
      <div className={styles.top}>
        <Panel label="Scenario">
          <PanelHeader title="Scenario" hint="Press the steps in order. Each one is a real request to the running system." action={<span className={styles.chip}>{modelDown ? "Model down" : "Model up"}</span>} />
          <ol className={styles.steps}>
            {steps.map((step, index) => (
              <li key={step.key} className={styles.stepItem}>
                <Button
                  variant={step.secondary ? "secondary" : "primary"}
                  size="sm"
                  className={styles.stepButton}
                  disabled={!step.enabled || (busy !== null && busy !== step.key)}
                  loading={busy === step.key}
                  onClick={() => void run(step.key, step.action, step.clears)}
                >
                  <span className={styles.stepNumber} aria-hidden="true">{index + 1}</span> {step.title}
                </Button>
                <span className={styles.stepLine}>{step.line}</span>
              </li>
            ))}
          </ol>
          {actionError ? <div className={styles.gapTop}><Alert tone="info" title="That didn't go through" onDismiss={() => setActionError(null)}>{actionError}</Alert></div> : null}
        </Panel>

      </div>

      {/* Outcomes first */}
      {board.data ? <StoryCard story={board.data.story} /> : null}
      {board.loading ? <Panel><Skeleton label="Loading the demo" lines={4} /></Panel> : null}
      {!board.loading && board.error ? <ErrorState compact error={board.error} onRetry={() => void board.reload()} title="The demo board didn't refresh" /> : null}
      {board.data ? <ConnectionStrip board={board.data} approving={approving} onApprove={(id) => void approve(id)} /> : null}
      {board.data && state ? <PassengerGrid passengers={board.data.passengers} approving={approving} onApprove={(id) => void approve(id)} /> : null}

      <details className={board_styles.under}>
        <summary>How it works underneath</summary>
        <div className={board_styles.underBody}>
          <p className={board_styles.underLead}>Each step below is a real stage the event passed through.</p>

      {/* Pipeline */}
      <Panel label="Pipeline">
        <PanelHeader title="What the system does" hint="One flight event travels left to right. Counts are for this run." />
        <div className={styles.pipeScroll}>
          <div className={styles.pipe}>
            {NODES.map((node, index) => (
              <div key={node.key} className={styles.segment}>
                {index > 0 ? <span className={styles.connector} data-hot={hot.has(node.key) || undefined} aria-hidden="true" /> : null}
                <div className={styles.node} data-hot={hot.has(node.key) || undefined}>
                  <span className={styles.nodeCount}>{nodes.count[node.key] ?? 0}</span>
                  <span className={styles.nodeLabel}>{node.label}</span>
                  <span className={styles.nodeSub}>{node.sub}</span>
                  <span className={styles.nodeFact}>{nodes.fact[node.key] ?? "Waiting"}</span>
                </div>
              </div>
            ))}
            <span className={styles.connector} data-hot={AUDIENCES.some((a) => hot.has(`aud:${a.key}`)) || undefined} aria-hidden="true" />
            <ul className={styles.audiences} aria-label="Audiences">
              {AUDIENCES.map((audience) => {
                const key = `aud:${audience.key}`;
                return (
                  <li key={audience.key} className={styles.audience} data-hot={hot.has(key) || undefined}>
                    <span className={styles.audienceCount}>{nodes.count[key] ?? 0}</span>
                    <span className={styles.audienceCopy}>
                      <span className={styles.nodeLabel}>{audience.label}</span>
                      <span className={styles.nodeFact}>{nodes.fact[key] ?? "Waiting"}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </Panel>

      {/* Scorecard */}
      <div className={styles.scores}>
        <div className={styles.score}>
          <p className={styles.scoreLabel}>Model calls</p>
          <p className={styles.scoreValue}>{score.modelCalls}</p>
          <p className={styles.quiet}>Risk scored once per connection, then one call per passenger who needs decisions.</p>
        </div>
        <div className={styles.score}>
          <p className={styles.scoreLabel}>Served from cache</p>
          <p className={styles.scoreValue}>{score.cached}</p>
          <p className={styles.quiet}>Risk answers reused with no model call.</p>
        </div>
        <div className={styles.score}>
          <p className={styles.scoreLabel}>Decisions</p>
          <DonutChart
            data={(Object.keys(GATE) as GateKey[]).map((key) => ({ key, label: GATE[key].label, value: score.gates[key], color: GATE[key].color }))}
            label="Decisions by gate"
            unit="decisions"
            totalLabel="Decisions"
            size={112}
            thickness={16}
            groupBelow={0}
            emptyLabel="No decisions yet"
          />
        </div>
        <div className={styles.score}>
          <p className={styles.scoreLabel}>Delivered</p>
          <p className={styles.scoreValue}>{score.delivered}</p>
          <ul className={styles.breakdown}>
            {score.byAudience.map((audience) => <li key={audience.key}><span>{audience.label}</span><span>{audience.value}</span></li>)}
          </ul>
        </div>
        <div className={styles.score}>
          <p className={styles.scoreLabel}>Event to last delivery</p>
          <p className={styles.scoreValue}>{score.seconds === null ? "—" : score.seconds.toFixed(1)}{score.seconds === null ? null : <span className={styles.scoreUnit}>s</span>}</p>
          <p className={styles.quiet}>For the most recent event that was delivered.</p>
        </div>
      </div>

      {/* Trace */}
      {traceError && entries.length === 0 ? <ErrorState error={traceError} onRetry={() => void loadTrace(true)} title="The trace didn't load" /> : null}
      {!traceLoaded ? <Panel><Skeleton label="Loading the trace" lines={5} /></Panel> : null}
      {empty && !traceError ? (
        <Panel><EmptyState icon={<Mascot pose="sleepy" size={40} />} title="Nothing running yet" description="Seed passengers to start." label="No trace yet" /></Panel>
      ) : null}

      {entries.length > 0 ? (
        <div className={styles.trace}>
          <Panel label="Events">
            <PanelHeader
              title="Events"
              hint="Newest first. Pick one to see its steps."
              action={<Button size="sm" variant={paused ? "primary" : "secondary"} aria-pressed={paused} onClick={togglePause}>{paused ? `Resume${newCount ? ` · ${newCount} new` : ""}` : "Pause"}</Button>}
            />
            <ul className={styles.events}>
              {events.map((event) => (
                <li key={event.key}>
                  <button type="button" className={styles.eventRow} aria-pressed={event.key === selectedKey} onClick={() => pick(event.key)}>
                    <span className={styles.eventTop}>
                      <span className={styles.eventTitle}>{event.title}</span>
                      <time className={styles.eventTime}>{clockTime(event.at)}</time>
                    </span>
                    <span className={styles.facts}>
                      {event.counts.map((item) => <Chip key={item.stage}>{STAGE[item.stage].label} {item.count}</Chip>)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel label="What happened">
            <PanelHeader title="What happened" hint={selected ? `${selected.title} · ${selected.entries.length} steps, in order` : "Pick an event."} />
            {selected ? (
              <ol className={styles.entries}>
                {selected.entries.map((entry) => {
                  const meta = STAGE[entry.stage] ?? { label: humanize(entry.stage), Icon: Radio };
                  return (
                    <li key={entry.id} className={styles.entry}>
                      <span className={styles.entryIcon} aria-hidden="true"><meta.Icon width={14} height={14} /></span>
                      <div className={styles.entryBody}>
                        <div className={styles.entryTop}>
                          <span className={styles.stage}>{meta.label}</span>
                          <span className={styles.entryTitle}>{entry.title}</span>
                          <time className={styles.eventTime}>{clockTime(timeOf(entry))}</time>
                        </div>
                        <EntryDetail entry={entry} />
                      </div>
                    </li>
                  );
                })}
              </ol>
            ) : null}
          </Panel>
        </div>
      ) : null}
        </div>
      </details>
    </>
  );
}
