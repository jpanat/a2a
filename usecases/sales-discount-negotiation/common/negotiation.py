"""Shared bilateral-negotiation strategy used by every agent in this MAS.

Implements the time-dependent concession tactic from Faratin, Sierra &
Jennings, "Negotiation Decision Functions for Autonomous Agents"
(Robotics and Autonomous Systems, 24(3-4), 1998) -- the standard reference
model for automated bilateral negotiation.

A negotiator's offer at round ``r`` moves from a ``start`` value (its
opening ask) to a ``limit`` value (its walk-away reservation point) along:

    f(t)     = t ** (1 / beta)              # t in [0, 1], monotonic 0 -> 1
    value(t) = start + (limit - start) * f(t)

where ``t = round / max_rounds``. ``beta`` encodes the negotiator's
"tactic":

- ``beta < 1``  ("Boulware"): stays near ``start`` for most of the
  negotiation, then concedes sharply near the deadline.
- ``beta > 1``  ("Conceder"): concedes quickly early, then holds firm.
- ``beta == 1`` ("Linear"): concedes at a constant rate.

Two curves converge (a deal exists) exactly when one side's offer this
round is at least as generous as the other side's ask this round -- see
each agent's ``policy.py`` for how that comparison is made.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum


class Tactic(str, Enum):
    BOULWARE = "boulware"
    LINEAR = "linear"
    CONCEDER = "conceder"


# Smaller beta = holds the line longer before conceding.
TACTIC_BETA = {
    Tactic.BOULWARE: 0.2,
    Tactic.LINEAR: 1.0,
    Tactic.CONCEDER: 4.0,
}


@dataclass
class ConcessionCurve:
    """A monotonic concession from ``start`` to ``limit`` over ``max_rounds``."""

    start: float
    limit: float
    max_rounds: int
    tactic: Tactic = Tactic.LINEAR

    def value_at(self, round_no: int) -> float:
        if self.max_rounds <= 0:
            return self.limit
        t = min(round_no, self.max_rounds) / self.max_rounds
        beta = TACTIC_BETA[self.tactic]
        f = t ** (1 / beta)
        return self.start + (self.limit - self.start) * f


@dataclass
class Offer:
    round: int
    sender: str
    discount_pct: float
    unit_price: float
    conditions: list[str] = field(default_factory=list)
    rationale: str = ""

    def to_dict(self) -> dict:
        return {
            "round": self.round,
            "sender": self.sender,
            "discountPct": round(self.discount_pct, 2),
            "unitPrice": round(self.unit_price, 2),
            "conditions": self.conditions,
            "rationale": self.rationale,
        }

    @staticmethod
    def from_dict(d: dict) -> "Offer":
        return Offer(
            round=d["round"],
            sender=d["sender"],
            discount_pct=d["discountPct"],
            unit_price=d["unitPrice"],
            conditions=d.get("conditions", []),
            rationale=d.get("rationale", ""),
        )


def price_for_discount(list_price: float, discount_pct: float) -> float:
    return list_price * (1 - discount_pct / 100)
