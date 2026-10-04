"""clef-flash through typesafe-sdk, pointed at the local server by MODEL_BASE_URL.

Three question sets, each one call:
  ask_risk      (Call A) -> the connection's risk level. The caller caches it.
  ask_ops       -> the connection-level ops action. Never cached.
  ask_passenger (Call B) -> every per-passenger decision. Never cached.

The state never contains a name, a phone number or any identifier: only a time-margin band,
counts, flags and, when the passenger consented, the assistance need they declared.
"""
import logging
from dataclasses import dataclass

from typesafe_sdk import AsyncTypeSafeClient, Choice, Noul, RetryPolicy, Score

from ..core.settings import get_settings

# The SDK can log request bodies at debug level; keep it quiet so states never reach the logs.
logging.getLogger("typesafe_sdk").setLevel(logging.WARNING)

LEVELS = ["safe", "tight", "at_risk", "lost"]


@dataclass
class Answer:
    answer: str
    confidence: float
    probabilities: dict[str, float]


# Measured against the local clef-flash (2026-10-03): it judges categories well but compares raw
# numbers poorly (a 4-minute buffer was rated safe). So the code bins the buffer into a named
# time margin (core.buffer.margin_band) and the model judges from the band plus context.
RISK = Score(
    instructions={
        "question": "Rate the risk that this flight connection is missed.",
        "how": "Start from time_margin. Move one level worse if terminal_change is true or queue_trend is growing. Never move better than time_margin allows.",
    },
    criteria=[
        {"level": "safe", "time_margin": "comfortable", "what": "No action needed."},
        {"level": "tight", "time_margin": "small", "what": "Makeable with little slack."},
        {"level": "at_risk", "time_margin": "negative_or_near_zero", "what": "Missed without help."},
        {"level": "lost", "time_margin": "far_too_short", "what": "Cannot be made even with help."},
    ],
)

# booking is "single_ticket" (both flights on one booking: the airline protects the connection, bags are
# checked through, rebooking is owed) or "separate_tickets" (self-transfer: the passenger collects and
# re-checks the bag, and the airline owes neither a hold nor a rebooking).
OPS = Choice(
    instructions={
        "question": "What should the airline ops controller do about this connection?",
        "how": "Use risk_level first, then protected_group (how many passengers are on one booking). Passengers who booked separately never count toward a hold or a rebooking.",
    },
    criteria={
        "none": {"when": "risk_level is safe"},
        "monitor": {"when": "risk_level is tight, whatever protected_group is"},
        "hold_flight": {"when": "risk_level is at_risk and protected_group is many: a short hold saves many people"},
        "escort": {"when": "risk_level is at_risk and protected_group is few: ground help is enough"},
        "rebook": {"when": "risk_level is lost and protected_group is few or many"},
        "notify_only": {"when": "risk_level is at_risk or lost and protected_group is none: everyone is on separate tickets, so warn them early but take no airline action"},
    },
)

PASSENGER = {
    "needs_assistance": Noul(instructions="Does this passenger need physical assistance to make the transfer? Answer yes only if declared_assistance names a need. Never infer one."),
    "assistance_type": Choice(
        instructions="Which assistance should be arranged for this passenger?",
        criteria={
            "none": {"when": "declared_assistance is none"},
            "wheelchair": {"when": "declared_assistance is wheelchair"},
            "buggy": {"when": "declared_assistance is buggy"},
            "escort": {"when": "declared_assistance is escort"},
            "step_free_route": {"when": "declared_assistance is step_free_route"},
        },
    ),
    "crew_priority_deplane": Noul(instructions={"question": "Should the cabin crew call this passenger off the aircraft first?", "yes_when": "risk_level is tight or at_risk, for either booking type", "no_when": "risk_level is safe (not needed) or lost (it would not help)"}),
    "ground_dispatch": Choice(
        instructions="Which ground resource should be sent for this passenger?",
        criteria={
            "none": {"when": "risk_level is safe or lost; or risk_level is tight with no declared assistance and no terminal change; or booking is separate_tickets with no declared assistance (the passenger must collect a bag and go landside, so an airside escort does not help)"},
            "buggy": {"when": "declared_assistance is wheelchair or buggy; or booking is single_ticket and risk_level is at_risk within one terminal"},
            "bus": {"when": "booking is single_ticket, terminal_change is true and risk_level is tight or at_risk"},
            "fast_track_escort": {"when": "booking is single_ticket, risk_level is at_risk and the queue is the main delay"},
        },
    ),
    "request_fast_track": Noul(instructions={"question": "Should the airline request a fast-track lane from the airport for this passenger?", "yes_when": "booking is single_ticket and risk_level is at_risk", "no_when": "risk_level is safe, tight or lost; or booking is separate_tickets (the airline does not request it for a self-transfer)"}),
    "message_template": Choice(
        instructions="Which message should the passenger receive now?",
        criteria={
            "on_track": {"when": "risk_level is safe"},
            "hurry": {"when": "booking is single_ticket, risk_level is tight and no assistance is declared"},
            "called_off_first": {"when": "booking is single_ticket, risk_level is at_risk and no assistance is declared"},
            "assistance_coming": {"when": "an assistance need is declared and risk_level is tight or at_risk"},
            "rebooked": {"when": "booking is single_ticket and risk_level is lost: the airline arranges a new flight"},
            "self_transfer_hurry": {"when": "booking is separate_tickets, risk_level is tight or at_risk and no assistance is declared: remind them to collect and re-check the bag"},
            "self_transfer_missed": {"when": "booking is separate_tickets and risk_level is lost: the airline will not rebook, they must contact the onward airline"},
        },
    ),
}

_client: AsyncTypeSafeClient | None = None


def client() -> AsyncTypeSafeClient:
    global _client
    if _client is None:
        s = get_settings()
        _client = AsyncTypeSafeClient(api_key=s.model_api_key, base_url=s.model_base_url, model=s.model_name, timeout=s.model_timeout_s, retry=RetryPolicy(max_retries=1, timeout=s.model_timeout_s * 2))
    return _client


def _normalize(answer, criteria_labels: list[str] | None = None) -> Answer:
    if answer.type == "choice":
        return Answer(answer.choice, float(answer.confidence), {k: float(v) for k, v in answer.probabilities.items()})
    if answer.type == "score":
        probabilities = {criteria_labels[int(i)] if criteria_labels and int(i) < len(criteria_labels) else str(i): float(p) for i, p in answer.probabilities.items()}
        best = max(probabilities, key=probabilities.get)
        return Answer(best, float(answer.confidence), probabilities)
    yes = float(answer.noul)
    return Answer("yes" if yes >= 0.5 else "no", abs(yes - 0.5) * 2, {"yes": yes, "no": 1 - yes})


def _fake_risk(state: dict) -> Answer:
    """What the policy says, with no model call. For load tests of the pipeline itself."""
    transfer = state["transfer"]
    level = LEVELS[min(3, ["comfortable", "small", "negative_or_near_zero", "far_too_short"].index(transfer["time_margin"]) + (1 if transfer.get("aggravating_factors") else 0))]
    return Answer(level, 0.9, {level: 0.9})


def _fake_ops(state: dict) -> Answer:
    level, group = state["risk_level"], state["protected_group"]
    answer = "none" if level == "safe" else "monitor" if level == "tight" else "notify_only" if group == "none" else "rebook" if level == "lost" else "hold_flight" if group == "many" else "escort"
    return Answer(answer, 0.9, {answer: 0.9})


def _fake_passenger(state: dict) -> dict[str, Answer]:
    level, single = state["connection"]["risk_level"], state["passenger"]["booking"] == "single_ticket"
    declared = state["passenger"]["declared_assistance"]
    urgent = level in ("tight", "at_risk")
    if declared != "none" and urgent:
        message = "assistance_coming"
    elif level == "lost":
        message = "rebooked" if single else "self_transfer_missed"
    elif single:
        message = "hurry" if level == "tight" else "called_off_first"
    else:
        message = "self_transfer_hurry"
    one = lambda answer: Answer(answer, 0.9, {answer: 0.9})
    return {
        "needs_assistance": one("yes" if declared != "none" else "no"), "assistance_type": one(declared),
        "crew_priority_deplane": one("yes" if urgent else "no"),
        "ground_dispatch": one("buggy" if declared in ("wheelchair", "buggy") and urgent else "fast_track_escort" if single and level == "at_risk" else "none"),
        "request_fast_track": one("yes" if single and level == "at_risk" else "no"), "message_template": one(message),
    }


async def ask_risk(state: dict) -> Answer:
    if get_settings().model_fake:
        return _fake_risk(state)
    response = await client().system_one(state=state, questions={"risk_level": RISK})
    return _normalize(response.answers["risk_level"], LEVELS)


async def ask_ops(state: dict) -> Answer:
    if get_settings().model_fake:
        return _fake_ops(state)
    response = await client().system_one(state=state, questions={"ops_action": OPS})
    return _normalize(response.answers["ops_action"])


async def ask_passenger(state: dict) -> dict[str, Answer]:
    if get_settings().model_fake:
        return _fake_passenger(state)
    response = await client().system_one(state=state, questions=PASSENGER)
    return {name: _normalize(answer) for name, answer in response.answers.items()}


async def ping() -> str:
    """A one-question call, used by the health check."""
    if get_settings().model_fake:
        return "fake model (benchmark mode)"
    response = await client().system_one(state={"transfer": {"time_margin": "comfortable", "aggravating_factors": []}}, questions={"risk_level": RISK})
    return response.model
