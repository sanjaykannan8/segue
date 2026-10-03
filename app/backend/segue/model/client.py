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

OPS = Choice(
    instructions={"question": "What should the airline ops controller do about this connection?", "how": "Use risk_level first, then how many passengers are on the connection."},
    criteria={
        "none": {"when": "risk_level is safe"},
        "monitor": {"when": "risk_level is tight"},
        "hold_flight": {"when": "risk_level is at_risk and passengers_on_connection is 5 or more: a short hold saves many people"},
        "escort": {"when": "risk_level is at_risk and passengers_on_connection is under 5: ground help is enough"},
        "rebook": {"when": "risk_level is lost"},
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
    "crew_priority_deplane": Noul(instructions={"question": "Should the cabin crew call this passenger off the aircraft first?", "yes_when": "risk_level is tight or at_risk", "no_when": "risk_level is safe (not needed) or lost (it would not help)"}),
    "ground_dispatch": Choice(
        instructions="Which ground resource should be sent for this passenger?",
        criteria={
            "none": {"when": "risk_level is safe or lost, or risk_level is tight with no declared assistance and no terminal change"},
            "buggy": {"when": "declared_assistance is wheelchair or buggy, or risk_level is at_risk within one terminal"},
            "bus": {"when": "terminal_change is true and risk_level is tight or at_risk"},
            "fast_track_escort": {"when": "risk_level is at_risk and the queue is the main delay"},
        },
    ),
    "request_fast_track": Noul(instructions={"question": "Should a fast-track lane be requested from the airport for this passenger?", "yes_when": "risk_level is at_risk", "no_when": "risk_level is safe, tight or lost"}),
    "message_template": Choice(
        instructions="Which message should the passenger receive now?",
        criteria={
            "on_track": {"when": "risk_level is safe"},
            "hurry": {"when": "risk_level is tight and no assistance is declared"},
            "called_off_first": {"when": "risk_level is at_risk and no assistance is declared"},
            "assistance_coming": {"when": "an assistance need is declared and risk_level is tight or at_risk"},
            "rebooked": {"when": "risk_level is lost"},
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


async def ask_risk(state: dict) -> Answer:
    response = await client().system_one(state=state, questions={"risk_level": RISK})
    return _normalize(response.answers["risk_level"], LEVELS)


async def ask_ops(state: dict) -> Answer:
    response = await client().system_one(state=state, questions={"ops_action": OPS})
    return _normalize(response.answers["ops_action"])


async def ask_passenger(state: dict) -> dict[str, Answer]:
    response = await client().system_one(state=state, questions=PASSENGER)
    return {name: _normalize(answer) for name, answer in response.answers.items()}


async def ping() -> str:
    """A one-question call, used by the health check."""
    response = await client().system_one(state={"time_margin": "comfortable"}, questions={"risk_level": RISK})
    return response.model
