"""The state given to clef-flash: what the model is asked to judge.

Following the model's own guidance, a state is one structured object with named parts: the facts
(the connection, the transfer, the passenger) and the policy those facts are judged against. The
questions (model/client.py) then ask for judgments about that material.

Two rules hold for every state:
  * No raw minutes. The model compares numbers poorly, so the code bins the time buffer into a
    named margin (core/buffer.py) and says in words what the band means.
  * No identity. No name, phone, ID or seat: only what the judgment needs.
"""
from ..core.settings import get_settings


def margin_meaning(margin: str) -> str:
    s = get_settings()
    return {
        "comfortable": f"{s.rule_safe_min} minutes or more to spare after the transfer",
        "small": f"between {s.rule_tight_min} and {s.rule_safe_min - 1} minutes to spare",
        "negative_or_near_zero": f"under {s.rule_tight_min} minutes to spare, or up to {-s.rule_risk_min} minutes short",
        "far_too_short": f"more than {-s.rule_risk_min} minutes short",
    }[margin]


def risk_state(*, margin: str, terminal_change: bool, queue_trend: str, inbound_status: str, outbound_status: str, airport: str) -> dict:
    return {
        "connection": {
            "transfer_airport": airport,
            "inbound_flight": {"status": inbound_status},
            "outbound_flight": {"status": outbound_status},
        },
        "transfer": {
            "time_margin": margin,
            "time_margin_means": margin_meaning(margin),
            "terminal_change": terminal_change,
            "queue_trend": queue_trend,
            # Named outright, so the model does not have to spot them among the other fields.
            "aggravating_factors": [name for name, present in (("terminal_change", terminal_change), ("growing_queue", queue_trend == "growing")) if present],
        },
        "policy": [
            "time_margin sets the starting level: comfortable is safe, small is tight, negative_or_near_zero is at_risk, far_too_short is lost.",
            "If aggravating_factors is empty, the answer is the starting level.",
            "If aggravating_factors lists anything, the answer is one level worse than the starting level: safe becomes tight, tight becomes at_risk, at_risk becomes lost.",
        ],
    }


def ops_state(*, risk_level: str, protected_passengers: int, self_transfer_passengers: int, outbound_status: str) -> dict:
    """Deliberately flat and short. Measured (scripts/eval_state.py): nested, or with a policy list
    added, this question got 8 to 10 of 12 right; in this shape, 12 of 12. More context is not always better."""
    return {
        "risk_level": risk_level,
        # The count as a named group: the model judges categories better than it compares numbers.
        # none: 0 passengers on one booking. few: 1 to 4. many: 5 or more.
        "protected_group": "none" if protected_passengers == 0 else "few" if protected_passengers < 5 else "many",
        "protected_passengers": protected_passengers,
        "self_transfer_passengers": self_transfer_passengers,
        "outbound_status": outbound_status,
    }


def passenger_state(*, risk_level: str, booking: str, declared_assistance: str | None, terminal_change: bool) -> dict:
    return {
        "passenger": {
            "booking": booking,
            "booking_means": "both flights on one booking, the airline protects the connection" if booking == "single_ticket" else "flights booked separately: the passenger collects and re-checks the bag, and the airline will not rebook",
            "declared_assistance": declared_assistance or "none",
        },
        "connection": {"risk_level": risk_level, "terminal_change": terminal_change},
        "policy": [
            "Cabin crew call a passenger off first when the connection is tight or at risk, whatever the booking.",
            "Airside ground help (bus, fast-track escort) and fast-track requests are for single_ticket passengers only.",
            "A fast-track lane is requested for a single_ticket passenger whose connection is at_risk. Not when it is safe, tight or lost.",
            "A declared assistance need is always met, whatever the booking.",
            "A lost connection is rebooked by the airline only for single_ticket passengers.",
        ],
    }
