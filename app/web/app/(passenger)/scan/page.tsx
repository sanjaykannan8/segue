"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ScanLine } from "lucide-react";
import { Alert } from "@/components/arc/alert/alert";
import { Button } from "@/components/arc/button/button";
import { Input } from "@/components/arc/input/input";
import { Select } from "@/components/arc/select/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/arc/tabs/tabs";
import { choiceSummary, choiceToInput, FlightPicker, type FlightChoice } from "@/components/segue/flight-picker";
import { HeaderLink, PassengerShell } from "@/components/segue/passenger-shell";
import { PassScanner } from "@/components/segue/pass-scanner";
import { ErrorState, FormError, LoadingPanel, Panel } from "@/components/segue/ui";
import { api, isStatus, useResource, type AssistanceType } from "@/lib/api";
import type { Bcbp } from "@/lib/bcbp";
import { ASSISTANCE_OPTIONS, flightLabel } from "@/lib/format";
import styles from "../passenger.module.css";

export default function ScanPage() {
  const router = useRouter();
  const me = useResource(api.me);
  const [tab, setTab] = useState("manual");
  const [inbound, setInbound] = useState<FlightChoice | null>(null);
  const [outbound, setOutbound] = useState<FlightChoice | null>(null);
  const [prefill, setPrefill] = useState<{ inbound?: string; outbound?: string; stamp: number }>({ stamp: 0 });
  const [seat, setSeat] = useState("");
  const [assistance, setAssistance] = useState<AssistanceType>("none");
  const [scanned, setScanned] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<unknown>(null);

  // No session yet: the notice and consent come first.
  const unauthorized = isStatus(me.error, 401);
  useEffect(() => { if (unauthorized) router.replace("/"); }, [unauthorized, router]);

  const canShareAssistance = me.data?.consents.some((c) => c.purpose === "assistance" && !c.withdrawn_at) ?? false;
  const first = inbound ? choiceSummary(inbound) : null;

  function onScan(pass: Bcbp) {
    const [one, two] = pass.legs;
    if (!one) return;
    setInbound(null);
    setOutbound(null);
    setPrefill((now) => ({ inbound: one.flightIata, outbound: two?.flightIata, stamp: now.stamp + 1 }));
    if (one.seat) setSeat(one.seat);
    setScanned(pass.legs.map((leg) => `${flightLabel(leg.flightIata)} ${leg.from} to ${leg.to}`).join(", "));
    setTab("manual");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!inbound || !outbound) return;
    setBusy(true);
    setSubmitError(null);
    try {
      await api.createItinerary({
        inbound: choiceToInput(inbound),
        outbound: choiceToInput(outbound),
        ...(seat.trim() ? { seat: seat.trim().toUpperCase() } : {}),
        ...(canShareAssistance ? { assistance } : {}),
      });
      router.push("/trip");
    } catch (error) {
      setSubmitError(error);
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
    <PassengerShell title="Add your trip" intro="Pick your two flights, or scan your boarding pass." action={<HeaderLink href="/privacy">Your data</HeaderLink>}>
      {me.data.has_itinerary ? (
        <Alert tone="info" title="You already have a trip">
          <Link href="/trip">Go to your trip</Link>
        </Alert>
      ) : null}

      <Panel>
        {/* Both panels stay mounted (forceMount) and the idle one is hidden, so the card always takes its height
            from the content on show and grows with it; nothing animates or pins the panel height. */}
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList aria-label="How to add your trip">
            <TabsTrigger value="manual">Find flights</TabsTrigger>
            <TabsTrigger value="scan">Scan pass</TabsTrigger>
          </TabsList>

          <TabsContent value="scan" forceMount className={styles.tabPanel}>
            {tab === "scan" ? <PassScanner onScan={onScan} /> : null}
          </TabsContent>

          <TabsContent value="manual" forceMount className={styles.tabPanel}>
            <form className={styles.steps} onSubmit={submit} noValidate>
              {scanned ? (
                <p className={styles.scanned} role="status">
                  <ScanLine width={18} height={18} aria-hidden="true" />
                  <span>Read from your pass: {scanned}. Confirm each flight below.</span>
                </p>
              ) : null}

              <FlightPicker
                key={`in-${prefill.stamp}`}
                step={1}
                title="Your first flight"
                value={inbound}
                onChange={(choice) => { setInbound(choice); setOutbound(null); }}
                prefillNumber={prefill.inbound}
              />

              {inbound && first ? (
                <>
                  <hr className={styles.divider} style={{ margin: 0 }} />
                  <FlightPicker
                    key={`out-${prefill.stamp}-${first.iata}-${first.dest}`}
                    step={2}
                    title="Your connecting flight"
                    value={outbound}
                    onChange={setOutbound}
                    from={/^[A-Z]{3}$/.test(first.dest) ? { airport: first.dest, after: first.arr } : undefined}
                    prefillNumber={prefill.outbound}
                  />
                </>
              ) : null}

              {inbound && outbound ? (
                <>
                  <hr className={styles.divider} style={{ margin: 0 }} />
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
                  <Button type="submit" size="lg" loading={busy} className={styles.full}>Add this trip</Button>
                </>
              ) : null}
            </form>
          </TabsContent>
        </Tabs>
      </Panel>

      <p className={styles.muted} style={{ textAlign: "center" }}>We only use your flights to watch this connection.</p>
    </PassengerShell>
  );
}
