"""
Risk Assessment Agent

Scores the overall transfer risk given patient condition, transport time,
receiving capability, and staffing. Produces a risk score and recommendation.
"""

from __future__ import annotations
from typing import Any
from .base import BaseAgent


TOOLS = [
    {
        "name": "calculate_transfer_risk_score",
        "description": "Calculate a standardized transfer risk score based on patient and logistics factors",
        "input_schema": {
            "type": "object",
            "properties": {
                "patient_acuity": {
                    "type": "integer",
                    "description": "Acuity score 1-10",
                },
                "transport_time_minutes": {
                    "type": "integer",
                    "description": "Estimated transport time in minutes",
                },
                "crew_level": {
                    "type": "string",
                    "enum": ["bls", "als", "critical_care", "flight"],
                    "description": "Transport crew certification level",
                },
                "patient_on_ventilator": {
                    "type": "boolean",
                },
                "patient_on_vasopressors": {
                    "type": "boolean",
                },
                "receiving_icu_available": {
                    "type": "boolean",
                },
                "specialist_available": {
                    "type": "boolean",
                },
            },
            "required": [
                "patient_acuity", "transport_time_minutes", "crew_level",
                "patient_on_ventilator", "patient_on_vasopressors",
            ],
        },
    },
    {
        "name": "compare_risk_transfer_vs_stay",
        "description": "Compare risk of transfer vs keeping patient at current facility",
        "input_schema": {
            "type": "object",
            "properties": {
                "transfer_risk_score": {
                    "type": "number",
                    "description": "Calculated transfer risk score (0-10)",
                },
                "current_facility_risk_factors": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Risk factors at current facility (e.g. 'icu_at_capacity', 'no_intensivist')",
                },
            },
            "required": ["transfer_risk_score", "current_facility_risk_factors"],
        },
    },
]


def _compute_risk(
    acuity: int,
    transport_minutes: int,
    crew: str,
    on_vent: bool,
    on_vasopressors: bool,
    icu_available: bool = True,
    specialist_available: bool = True,
) -> dict:
    score = 0.0

    # Acuity contribution (0-4 points)
    score += min(acuity / 10 * 4, 4)

    # Transport time contribution (0-2 points)
    if transport_minutes <= 15:
        score += 0.5
    elif transport_minutes <= 30:
        score += 1.0
    elif transport_minutes <= 60:
        score += 1.5
    else:
        score += 2.0

    # Crew level risk modifier
    crew_modifier = {"bls": 2.0, "als": 1.0, "critical_care": 0.5, "flight": 0.3}
    score += crew_modifier.get(crew, 1.0)

    # Ventilator (+1 if crew not CCT/flight)
    if on_vent and crew not in ("critical_care", "flight"):
        score += 1.0
    elif on_vent:
        score += 0.3

    # Vasopressors
    if on_vasopressors:
        score += 0.5

    # Receiving readiness (negative if not available)
    if not icu_available:
        score += 1.5
    if not specialist_available:
        score += 1.0

    score = round(min(score, 10.0), 1)

    if score <= 3:
        category = "LOW"
        recommendation = "Proceed with standard transport protocols"
    elif score <= 6:
        category = "MODERATE"
        recommendation = "Proceed with CCT crew; continuous monitoring; physician escort consider"
    elif score <= 8:
        category = "HIGH"
        recommendation = "Proceed only with CCT or flight crew; attending escort strongly recommended"
    else:
        category = "VERY HIGH"
        recommendation = "Transfer only if current facility risk is greater; consider stabilization first"

    return {
        "risk_score": score,
        "risk_category": category,
        "recommendation": recommendation,
        "mortality_risk_transport_pct": round(score * 1.5, 1),
        "components": {
            "acuity_contribution": round(min(acuity / 10 * 4, 4), 1),
            "transport_time_contribution": round(
                0.5 if transport_minutes <= 15 else 1.0 if transport_minutes <= 30 else 1.5, 1
            ),
            "crew_level_modifier": crew_modifier.get(crew, 1.0),
            "ventilator_risk": on_vent,
            "vasopressor_risk": on_vasopressors,
        },
    }


class RiskAssessmentAgent(BaseAgent):
    role = "risk_assessment"
    local_ontology = {
        "critical": "Transfer risk score >= 8/10; mortality risk >15% during transport",
        "urgent": "Transfer risk score 5-7/10; recommend expedited but stable transport",
        "compatible": "Receiving facility risk profile is lower than current facility",
    }
    tools = TOOLS
    system_prompt = (
        "You are the transfer risk assessment specialist. Your job is to calculate "
        "an evidence-based risk score for this transfer and compare it against the risk "
        "of keeping the patient at the current facility. Use the risk scoring tool, then "
        "evaluate whether transfer risk is acceptable given the clinical circumstances. "
        "Your final verdict must be: TRANSFER RECOMMENDED, TRANSFER WITH PRECAUTIONS, or "
        "TRANSFER NOT RECOMMENDED. Always explain your reasoning."
    )

    def handle_tool_call(self, name: str, inputs: dict) -> Any:
        if name == "calculate_transfer_risk_score":
            return _compute_risk(
                acuity=inputs.get("patient_acuity", 8),
                transport_minutes=inputs.get("transport_time_minutes", 30),
                crew=inputs.get("crew_level", "als"),
                on_vent=inputs.get("patient_on_ventilator", False),
                on_vasopressors=inputs.get("patient_on_vasopressors", False),
                icu_available=inputs.get("receiving_icu_available", True),
                specialist_available=inputs.get("specialist_available", True),
            )

        elif name == "compare_risk_transfer_vs_stay":
            transfer_risk = inputs.get("transfer_risk_score", 5.0)
            stay_factors = inputs.get("current_facility_risk_factors", [])
            stay_risk_score = 3.0
            high_risk_factors = ["icu_at_capacity", "no_intensivist", "equipment_unavailable"]
            for factor in stay_factors:
                if factor in high_risk_factors:
                    stay_risk_score += 2.0
                else:
                    stay_risk_score += 0.5
            stay_risk_score = round(min(stay_risk_score, 10.0), 1)
            return {
                "transfer_risk_score": transfer_risk,
                "stay_risk_score": stay_risk_score,
                "net_benefit_of_transfer": round(stay_risk_score - transfer_risk, 1),
                "recommendation": (
                    "TRANSFER RECOMMENDED — transfer risk lower than stay risk"
                    if stay_risk_score > transfer_risk
                    else "REASSESS — transfer risk may exceed stay risk"
                ),
                "current_facility_risk_factors": stay_factors,
            }

        return super().handle_tool_call(name, inputs)
