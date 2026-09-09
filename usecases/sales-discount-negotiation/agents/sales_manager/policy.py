"""Sales Manager (deal-desk approver) policy -- transport-free, unit-testable.

The manager never talks to the buyer. It only ever answers its peer, the
Seller agent, when the Seller asks for extra discount authority on a
specific deal. The manager applies its own margin/strategic-account rules
and may grant less than requested -- it is a negotiation of one, not a
rubber stamp.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class ManagerProfile:
    standard_cap: float = 18.0  # discount cap for a routine deal (%)
    strategic_cap: float = 26.0  # discount cap for a strategic deal (%)
    hard_cap: float = 30.0  # absolute ceiling regardless of context (%)
    strategic_seats_threshold: int = 200
    strategic_term_threshold: int = 2  # years


class ManagerPolicy:
    def __init__(self, profile: ManagerProfile):
        self.profile = profile

    def evaluate(self, requested_pct: float, deal_context: dict) -> tuple[float, str]:
        seats = deal_context.get("seats", 0)
        term_years = deal_context.get("term_years", 0)
        strategic = (
            seats >= self.profile.strategic_seats_threshold
            and term_years >= self.profile.strategic_term_threshold
        )
        applicable_cap = min(
            self.profile.strategic_cap if strategic else self.profile.standard_cap,
            self.profile.hard_cap,
        )
        granted = min(requested_pct, applicable_cap)
        tier = "strategic" if strategic else "standard"
        if granted < requested_pct:
            rationale = (
                f"Deal ({seats} seats, {term_years}yr) qualifies for {tier} authority; "
                f"approving {granted:.1f}% instead of the requested {requested_pct:.1f}% "
                f"to protect margin (cap {applicable_cap:.1f}%)."
            )
        else:
            rationale = (
                f"Deal ({seats} seats, {term_years}yr) qualifies for {tier} authority; "
                f"approving the full {granted:.1f}% requested (cap {applicable_cap:.1f}%)."
            )
        return granted, rationale
