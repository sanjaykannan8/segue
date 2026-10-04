"""Measure the model on cases with known right answers: flat state against structured state.

    uv run python scripts/eval_state.py

Needs the clef-flash server at MODEL_BASE_URL. Prints accuracy and mean confidence for each
question, for both state shapes. Use it again whenever the questions, the state or the
confidence gates change.
"""
import asyncio
import sys
from itertools import product

from segue.model import client as m
from segue.model import state as st

sys.stdout.reconfigure(encoding="utf-8")
LEVELS = ["safe", "tight", "at_risk", "lost"]
MARGINS = ["comfortable", "small", "negative_or_near_zero", "far_too_short"]


def risk_cases():
    for (i, margin), tc, queue in product(enumerate(MARGINS), (False, True), ("steady", "growing")):
        expected = LEVELS[min(3, i + (1 if tc or queue == "growing" else 0))]
        flat = {"time_margin": margin, "terminal_change": tc, "queue_trend": queue, "inbound_status": "en-route", "outbound_status": "scheduled"}
        rich = st.risk_state(margin=margin, terminal_change=tc, queue_trend=queue, inbound_status="en-route", outbound_status="scheduled", airport="DXB")
        yield flat, rich, expected


def ops_cases():
    table = [("safe", 6, 2, "none"), ("tight", 6, 2, "monitor"), ("tight", 0, 3, "monitor"), ("at_risk", 14, 0, "hold_flight"), ("at_risk", 5, 3, "hold_flight"), ("at_risk", 4, 4, "escort"),
             ("at_risk", 1, 6, "escort"), ("at_risk", 0, 5, "notify_only"), ("lost", 3, 2, "rebook"), ("lost", 1, 0, "rebook"), ("lost", 0, 4, "notify_only"), ("safe", 0, 4, "none")]
    for level, protected, self_transfer, expected in table:
        flat = {"risk_level": level, "protected_group": "none" if protected == 0 else "few" if protected < 5 else "many", "protected_passengers": protected, "self_transfer_passengers": self_transfer, "outbound_status": "scheduled"}
        rich = st.ops_state(risk_level=level, protected_passengers=protected, self_transfer_passengers=self_transfer, outbound_status="scheduled")
        yield flat, rich, expected


def passenger_cases():
    for level, booking, assistance in product(("tight", "at_risk", "lost"), ("single_ticket", "separate_tickets"), (None, "wheelchair")):
        single = booking == "single_ticket"
        if assistance and level != "lost":
            message = "assistance_coming"
        elif level == "lost":
            message = "rebooked" if single else "self_transfer_missed"
        elif single:
            message = "hurry" if level == "tight" else "called_off_first"
        else:
            message = "self_transfer_hurry"
        expected = {
            "crew_priority_deplane": "yes" if level in ("tight", "at_risk") else "no",
            "request_fast_track": "yes" if single and level == "at_risk" else "no",
            "needs_assistance": "yes" if assistance else "no",
            "assistance_type": assistance or "none",
            "message_template": message,
        }
        flat = {"risk_level": level, "booking": booking, "declared_assistance": assistance or "none", "terminal_change": False}
        rich = st.passenger_state(risk_level=level, booking=booking, declared_assistance=assistance, terminal_change=False)
        yield flat, rich, expected


async def main():
    scores: dict[tuple[str, str], list[tuple[bool, float]]] = {}
    misses: list[str] = []

    def record(shape, question, answer, expected, case):
        scores.setdefault((question, shape), []).append((answer.answer == expected, answer.confidence))
        if answer.answer != expected:
            misses.append(f"  {shape:<10} {question:<22} expected {expected:<20} got {answer.answer:<20} conf {answer.confidence:.2f}  {case}")

    for flat, rich, expected in risk_cases():
        for shape, state in (("flat", flat), ("structured", rich)):
            record(shape, "risk_level", await m.ask_risk(state), expected, {k: flat[k] for k in ("time_margin", "terminal_change", "queue_trend")})
    for flat, rich, expected in ops_cases():
        for shape, state in (("flat", flat), ("structured", rich)):
            record(shape, "ops_action", await m.ask_ops(state), expected, {k: flat[k] for k in ("risk_level", "protected_passengers", "self_transfer_passengers")})
    for flat, rich, expected in passenger_cases():
        for shape, state in (("flat", flat), ("structured", rich)):
            answers = await m.ask_passenger(state)
            for question, want in expected.items():
                record(shape, question, answers[question], want, {k: flat[k] for k in ("risk_level", "booking", "declared_assistance")})

    print(f"{'question':<24}{'cases':>6}   {'flat: right':>12} {'conf':>6}   {'structured: right':>18} {'conf':>6}")
    total = {"flat": [0, 0], "structured": [0, 0]}
    for question in dict.fromkeys(q for q, _ in scores):
        row = f"{question:<24}{len(scores[(question, 'flat')]):>6}   "
        for shape in ("flat", "structured"):
            results = scores[(question, shape)]
            right = sum(ok for ok, _ in results)
            total[shape][0] += right
            total[shape][1] += len(results)
            confidence = sum(c for _, c in results) / len(results)
            row += f"{right:>8}/{len(results):<3} {confidence:>6.2f}   " + ("      " if shape == "flat" else "")
        print(row)
    print(f"{'TOTAL':<24}{total['flat'][1]:>6}   " + "   ".join(f"{shape}: {right}/{count} ({right / count:.0%})" for shape, (right, count) in total.items()))
    if misses:
        print("\nWrong answers:")
        print("\n".join(misses))


if __name__ == "__main__":
    asyncio.run(main())
