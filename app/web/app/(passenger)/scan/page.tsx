"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, ScanLine } from "lucide-react";
import { Alert } from "@/components/arc/alert/alert";
import { Badge } from "@/components/arc/badge/badge";
import { Button } from "@/components/arc/button/button";
import { Input } from "@/components/arc/input/input";
import { Select } from "@/components/arc/select/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/arc/tabs/tabs";
import { HeaderLink, PassengerShell } from "@/components/segue/passenger-shell";
import { PassScanner } from "@/components/segue/pass-scanner";
import { ErrorState, Fact, FormError, LoadingPanel, Panel } from "@/components/segue/ui";
import { api, isStatus, useResource, type AssistanceType, type Flight, type FlightInput, type ManualFlight } from "@/lib/api";
import { isFlightIata, normalizeFlightIata, type Bcbp } from "@/lib/bcbp";
import { ASSISTANCE_OPTIONS, flightLabel, formatDateTime, localInputToIso } from "@/lib/format";
import styles from "../passenger.module.css";

type LegKey = "inbound" | "outbound";
type Check = { state: "found"; iata: string; flight: Flight } | { state: "manual"; iata: string };
type ManualForm = { origin: string; dest: string; sched_dep: string; sched_arr: string; dep_terminal: string; arr_terminal: string };

const LEGS: { key: LegKey; title: string; label: string; placeholder: string }[] = [
  { key: "inbound", title: "First flight", label: "Inbound flight number", placeholder: "EK 512" },
  { key: "outbound", title: "Connecting flight", label: "Outbound flight number", placeholder: "BA 108" },
];
const emptyManual: ManualForm = { origin: "", dest: "", sched_dep: "", sched_arr: "", dep_terminal: "", arr_terminal: "" };

function manualProblem(form: ManualForm): string | null {
  if (!/^[A-Za-z]{3}$/.test(form.origin.trim()) || !/^[A-Za-z]{3}$/.test(form.dest.trim())) return "Use the three-letter airport codes, like DXB.";
  const dep = localInputToIso(form.sched_dep), arr = localInputToIso(form.sched_arr);
  if (!dep || !arr) return "Add the scheduled departure and arrival times.";
  if (arr <= dep) return "Arrival must be after departure.";
  return null;
}

function toManual(form: ManualForm): ManualFlight {
  return {
    origin: form.origin.trim().toUpperCase(),
    dest: form.dest.trim().toUpperCase(),
    sched_dep: localInputToIso(form.sched_dep) ?? "",
    sched_arr: localInputToIso(form.sched_arr) ?? "",
    ...(form.dep_terminal.trim() ? { dep_terminal: form.dep_terminal.trim() } : {}),
    ...(form.arr_terminal.trim() ? { arr_terminal: form.arr_terminal.trim() } : {}),
  };
}

export default function ScanPage() {
  const router = useRouter();
  const me = useResource(api.me);
  const [tab, setTab] = useState("scan");
  const [numbers, setNumbers] = useState<Record<LegKey, string>>({ inbound: "", outbound: "" });
  const [checks, setChecks] = useState<Partial<Record<LegKey, Check>>>({});
  const [manual, setManual] = useState<Record<LegKey, ManualForm>>({ inbound: emptyManual, outbound: emptyManual });
  const [seat, setSeat] = useState("");
  const [assistance, setAssistance] = useState<AssistanceType>("none");
  const [scanned, setScanned] = useState<string | null>(null);
  const [errors, setErrors] = useState<Partial<Record<LegKey, string>>>({});
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<unknown>(null);

  // No session yet: the notice and consent come first.
  const unauthorized = isStatus(me.error, 401);
  useEffect(() => { if (unauthorized) router.replace("/"); }, [unauthorized, router]);

  const canShareAssistance = me.data?.consents.some((c) => c.purpose === "assistance" && !c.withdrawn_at) ?? false;
  const current = (key: LegKey) => { const check = checks[key]; return check && check.iata === normalizeFlightIata(numbers[key]) ? check : undefined; };
  const allChecked = LEGS.every(({ key }) => current(key));

  function onScan(pass: Bcbp) {
    const [first, second] = pass.legs;
    if (!first) return;
    setNumbers((now) => {
      if (second) return { inbound: first.flightIata, outbound: second.flightIata };
      if (!now.inbound || normalizeFlightIata(now.inbound) === first.flightIata) return { ...now, inbound: first.flightIata };
      return { ...now, outbound: first.flightIata };
    });
    if (first.seat && (second || !numbers.inbound || normalizeFlightIata(numbers.inbound) === first.flightIata)) setSeat(first.seat);
    setScanned(pass.legs.map((leg) => `${flightLabel(leg.flightIata)} ${leg.from} to ${leg.to}`).join(", "));
    setTab("manual");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitError(null);
    const nextErrors: Partial<Record<LegKey, string>> = {};
    for (const { key } of LEGS) if (!isFlightIata(numbers[key])) nextErrors[key] = "Enter a flight number like EK 512.";
    if (!nextErrors.inbound && !nextErrors.outbound && normalizeFlightIata(numbers.inbound) === normalizeFlightIata(numbers.outbound)) nextErrors.outbound = "This is the same as your first flight.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    setBusy(true);
    try {
      // Step 1: confirm any flight that has not been looked up yet.
      const pending = LEGS.filter(({ key }) => !current(key));
      if (pending.length) {
        const results = await Promise.all(pending.map(async ({ key }): Promise<[LegKey, Check]> => {
          const iata = normalizeFlightIata(numbers[key]);
          try {
            const { flight } = await api.lookupFlight(iata);
            return [key, { state: "found", iata, flight }];
          } catch (error) {
            if (isStatus(error, 404)) return [key, { state: "manual", iata }];
            throw error;
          }
        }));
        setChecks((now) => ({ ...now, ...Object.fromEntries(results) }));
        return; // The passenger reviews what we found before the trip is added.
      }

      // Step 2: add the trip.
      const manualErrors: Partial<Record<LegKey, string>> = {};
      const input = {} as Record<LegKey, FlightInput>;
      for (const { key } of LEGS) {
        const check = current(key)!;
        if (check.state === "manual") {
          const problem = manualProblem(manual[key]);
          if (problem) manualErrors[key] = problem;
          input[key] = { flight_iata: check.iata, manual: toManual(manual[key]) };
        } else input[key] = { flight_iata: check.iata };
      }
      if (Object.keys(manualErrors).length) { setErrors(manualErrors); return; }
      await api.createItinerary({
        inbound: input.inbound,
        outbound: input.outbound,
        ...(seat.trim() ? { seat: seat.trim().toUpperCase() } : {}),
        ...(canShareAssistance ? { assistance } : {}),
      });
      router.push("/trip");
    } catch (error) {
      setSubmitError(error);
    } finally {
      setBusy(false);
    }
  }

  if (me.loading || unauthorized) {
    return <PassengerShell title="Add your trip"><LoadingPanel label="Loading" lines={4} /></PassengerShell>;
  }
  if (!me.data) {
    return <PassengerShell title="Add your trip"><ErrorState error={me.error} onRetry={() => void me.reload()} /></PassengerShell>;
  }

  return (
    <PassengerShell title="Add your trip" intro="Scan your boarding pass, or type in your two flights." action={<HeaderLink href="/privacy">Your data</HeaderLink>}>
      {me.data.has_itinerary ? (
        <Alert tone="info" title="You already have a trip">
          <Link href="/trip">Go to your trip</Link>
        </Alert>
      ) : null}

      <Panel>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList aria-label="How to add your trip">
            <TabsTrigger value="scan">Scan pass</TabsTrigger>
            <TabsTrigger value="manual">Type it in</TabsTrigger>
          </TabsList>

          <TabsContent value="scan">
            <div className={styles.tabPanel}>{tab === "scan" ? <PassScanner onScan={onScan} /> : null}</div>
          </TabsContent>

          <TabsContent value="manual">
            <form className={`${styles.stack} ${styles.tabPanel}`} onSubmit={submit} noValidate>
              {scanned ? (
                <p className={styles.scanned} role="status">
                  <ScanLine width={18} height={18} aria-hidden="true" />
                  <span>Read from your pass: {scanned}. Check it and fill in what&apos;s missing.</span>
                </p>
              ) : null}

              {LEGS.map(({ key, title, label, placeholder }) => {
                const check = current(key);
                return (
                  <fieldset key={key} className={styles.stack} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
                    <legend className={styles.legend}>{title}</legend>
                    <Input
                      label={label}
                      placeholder={placeholder}
                      autoCapitalize="characters"
                      autoComplete="off"
                      spellCheck={false}
                      value={numbers[key]}
                      onChange={(event) => { setNumbers((now) => ({ ...now, [key]: event.target.value })); setErrors((now) => ({ ...now, [key]: undefined })); }}
                      error={check?.state === "manual" ? undefined : errors[key]}
                    />

                    {check?.state === "found" ? (
                      <div className={styles.confirm}>
                        <div className={styles.confirmTop}>
                          <span className={styles.confirmFlight}>{flightLabel(check.flight.flight_iata)}</span>
                          <Badge size="sm" tone="info">Flight found</Badge>
                        </div>
                        <p className={styles.route}>
                          <span>{check.flight.origin}</span>
                          <ArrowRight width={18} height={18} aria-label="to" />
                          <span>{check.flight.dest}</span>
                        </p>
                        <dl className={styles.times}>
                          <Fact label="Departs">{formatDateTime(check.flight.est_dep ?? check.flight.sched_dep)}</Fact>
                          <Fact label="Arrives">{formatDateTime(check.flight.est_arr ?? check.flight.sched_arr)}</Fact>
                        </dl>
                      </div>
                    ) : null}

                    {check?.state === "manual" ? (
                      <div className={styles.manual}>
                        <p className={styles.muted}>We couldn&apos;t find {flightLabel(check.iata)}. Add its details from your ticket.</p>
                        <div className={styles.row2}>
                          <Input label="From (airport code)" placeholder="MAA" maxLength={3} autoCapitalize="characters" value={manual[key].origin} onChange={(event) => setManual((now) => ({ ...now, [key]: { ...now[key], origin: event.target.value } }))} />
                          <Input label="To (airport code)" placeholder="DXB" maxLength={3} autoCapitalize="characters" value={manual[key].dest} onChange={(event) => setManual((now) => ({ ...now, [key]: { ...now[key], dest: event.target.value } }))} />
                        </div>
                        <Input label="Scheduled departure" type="datetime-local" value={manual[key].sched_dep} onChange={(event) => setManual((now) => ({ ...now, [key]: { ...now[key], sched_dep: event.target.value } }))} description="In your device's time zone." />
                        <Input label="Scheduled arrival" type="datetime-local" value={manual[key].sched_arr} onChange={(event) => setManual((now) => ({ ...now, [key]: { ...now[key], sched_arr: event.target.value } }))} />
                        <div className={styles.row2}>
                          <Input label="Departure terminal (optional)" value={manual[key].dep_terminal} onChange={(event) => setManual((now) => ({ ...now, [key]: { ...now[key], dep_terminal: event.target.value } }))} />
                          <Input label="Arrival terminal (optional)" value={manual[key].arr_terminal} onChange={(event) => setManual((now) => ({ ...now, [key]: { ...now[key], arr_terminal: event.target.value } }))} />
                        </div>
                        {errors[key] ? <p className={styles.fieldError} role="alert" style={{ marginTop: 0 }}>{errors[key]}</p> : null}
                      </div>
                    ) : null}
                  </fieldset>
                );
              })}

              <Input label="Seat on your first flight (optional)" placeholder="12A" autoCapitalize="characters" autoComplete="off" value={seat} onChange={(event) => setSeat(event.target.value)} description="Helps the crew let you off first if time is short." />

              {canShareAssistance ? (
                <Select
                  label="Assistance need"
                  value={assistance}
                  onValueChange={(value) => setAssistance(value as AssistanceType)}
                  options={ASSISTANCE_OPTIONS}
                  description="Shared only with ops, crew and ground staff."
                />
              ) : null}

              <FormError error={submitError} />
              <Button type="submit" size="lg" loading={busy} className={styles.full}>{allChecked ? "Add this trip" : "Check flights"}</Button>
            </form>
          </TabsContent>
        </Tabs>
      </Panel>

      <p className={styles.muted} style={{ textAlign: "center" }}>We only use your flights to watch this connection.</p>
    </PassengerShell>
  );
}
