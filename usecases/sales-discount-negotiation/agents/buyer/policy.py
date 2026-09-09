"""Buyer (procurement) negotiation policy -- transport-free, unit-testable."""

from __future__ import annotations

from dataclasses import dataclass

from common.negotiation import ConcessionCurve, Offer, Tactic, price_for_discount


@dataclass
class BuyerProfile:
    seats: int = 250
    term_years: int = 3
    list_price_per_seat: float = 500.0
    aspiration_discount: float = 30.0  # opening ask (%)
    reservation_discount: float = 20.0  # walk-away floor (%); won't accept less
    max_rounds: int = 8
    tactic: Tactic = Tactic.BOULWARE  # holds firm, concedes late


class BuyerPolicy:
    """Represents the buyer's side of the negotiation with the seller."""

    def __init__(self, profile: BuyerProfile):
        self.profile = profile
        self.curve = ConcessionCurve(
            start=profile.aspiration_discount,
            limit=profile.reservation_discount,
            max_rounds=profile.max_rounds,
            tactic=profile.tactic,
        )

    def _offer_for_round(self, round_no: int, rationale: str) -> Offer:
        discount = self.curve.value_at(round_no)
        price = price_for_discount(self.profile.list_price_per_seat, discount)
        conditions = [f"{self.profile.seats} seats", f"{self.profile.term_years}-year term"]
        return Offer(
            round=round_no,
            sender="buyer",
            discount_pct=discount,
            unit_price=price,
            conditions=conditions,
            rationale=rationale,
        )

    def opening_offer(self) -> Offer:
        return self._offer_for_round(
            0,
            rationale=(
                f"Benchmarked against competing quotes for {self.profile.seats} seats; "
                f"requesting {self.profile.aspiration_discount:.0f}% off list."
            ),
        )

    def respond(self, round_no: int, seller_offer: Offer) -> tuple[str, Offer | None]:
        """Evaluate the seller's offer for this round.

        Returns ``("accept", None)``, ``("reject", None)`` (walk away), or
        ``("counter", next_offer)``.
        """
        my_ask = self.curve.value_at(round_no)
        if seller_offer.discount_pct >= my_ask - 1e-9:
            return "accept", None
        if round_no >= self.profile.max_rounds:
            if seller_offer.discount_pct >= self.profile.reservation_discount - 1e-9:
                return "accept", None
            return "reject", None
        next_round = round_no + 1
        counter = self._offer_for_round(
            next_round,
            rationale=(
                f"Seller's {seller_offer.discount_pct:.1f}% is still short of our target; "
                f"revising ask for round {next_round}."
            ),
        )
        return "counter", counter
