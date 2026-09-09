"""Seller (account executive) negotiation policy -- transport-free, unit-testable.

The seller negotiates the deal with the buyer on its own, using only the
discount authority it holds. If the buyer's ask still exceeds that
authority as the deadline approaches, the seller consults its Sales
Manager peer directly (one A2A call, no broker) to request a higher
ceiling for *this specific deal*, then keeps negotiating with the buyer
using whatever ceiling the manager actually grants -- which may be less
than what it asked for.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Awaitable, Callable

from common.negotiation import ConcessionCurve, Offer, Tactic, price_for_discount

# (requested_discount_pct, deal_context) -> (granted_discount_pct, rationale)
AuthorityRequester = Callable[[float, dict], Awaitable[tuple[float, str]]]


@dataclass
class SellerProfile:
    list_price_per_seat: float = 500.0
    own_authority_ceiling: float = 15.0  # max discount the rep can approve alone (%)
    max_rounds: int = 8
    tactic: Tactic = Tactic.LINEAR
    escalate_after_round: int = 5  # consult the manager if still stuck past this round
    escalation_buffer: float = 2.0  # pad the ask above the buyer's current ask (%)


class SellerPolicy:
    def __init__(self, profile: SellerProfile, request_authority: AuthorityRequester):
        self.profile = profile
        self._request_authority = request_authority
        self.curve = ConcessionCurve(
            start=0.0,
            limit=profile.own_authority_ceiling,
            max_rounds=profile.max_rounds,
            tactic=profile.tactic,
        )
        self.escalated = False
        self.escalation_log: list[dict] = []

    async def respond(self, round_no: int, buyer_offer: Offer) -> tuple[str, Offer]:
        """Evaluate the buyer's ask and return ``(decision, seller_offer)``.

        ``decision`` is ``"counter"`` (seller proposes ``seller_offer``) or
        ``"accept"`` (seller's offer already matches or beats the buyer's ask,
        meaning the buyer will accept it).
        """
        if (
            not self.escalated
            and round_no >= self.profile.escalate_after_round
            and buyer_offer.discount_pct > self.curve.limit
        ):
            requested = min(buyer_offer.discount_pct + self.profile.escalation_buffer, 40.0)
            deal_context = {
                "seats": _seats_from_conditions(buyer_offer.conditions),
                "term_years": _term_from_conditions(buyer_offer.conditions),
                "current_round": round_no,
                "rounds_remaining": max(self.profile.max_rounds - round_no, 0),
                "buyer_ask_pct": buyer_offer.discount_pct,
            }
            granted, rationale = await self._request_authority(requested, deal_context)
            self.escalation_log.append(
                {
                    "requestedPct": requested,
                    "grantedPct": granted,
                    "rationale": rationale,
                    "round": round_no,
                }
            )
            self.curve.limit = max(self.curve.limit, granted)
            self.escalated = True

        max_i_can_offer = self.curve.value_at(round_no)
        # Never concede more than necessary to meet the buyer's current ask.
        offer_discount = min(max_i_can_offer, buyer_offer.discount_pct) if buyer_offer.discount_pct > 0 else max_i_can_offer
        offer_discount = max(offer_discount, 0.0)
        price = price_for_discount(self.profile.list_price_per_seat, offer_discount)
        decision = "accept" if offer_discount >= buyer_offer.discount_pct - 1e-9 else "counter"
        rationale = (
            f"Matching your ask at {offer_discount:.1f}% off."
            if decision == "accept"
            else f"Best I can do this round is {offer_discount:.1f}% off (authority ceiling {self.curve.limit:.1f}%)."
        )
        offer = Offer(
            round=round_no,
            sender="seller",
            discount_pct=offer_discount,
            unit_price=price,
            conditions=["subject to signed order form"],
            rationale=rationale,
        )
        return decision, offer


def _seats_from_conditions(conditions: list[str]) -> int:
    for c in conditions:
        if c.endswith("seats"):
            return int(c.split()[0])
    return 0


def _term_from_conditions(conditions: list[str]) -> int:
    for c in conditions:
        if "year" in c:
            return int(c.split("-")[0])
    return 0
