"""
Specialist Availability Agent

Confirms that the required specialist(s) can provide care upon the patient's
arrival at Hospital B, including privileges, response time, and capability.
"""

from __future__ import annotations
from typing import Any
from .base import BaseAgent


TOOLS = [
    {
        "name": "confirm_specialist_coverage",
        "description": "Confirm a specialist is available, credentialed, and can manage this diagnosis",
        "input_schema": {
            "type": "object",
            "properties": {
                "specialty": {
                    "type": "string",
                    "description": "Medical specialty (e.g. 'pulmonology', 'critical_care', 'cardiology')",
                },
                "diagnosis_category": {
                    "type": "string",
                    "description": "Primary diagnosis category (e.g. 'respiratory_failure', 'sepsis', 'cardiac')",
                },
            },
            "required": ["specialty", "diagnosis_category"],
        },
    },
    {
        "name": "check_handoff_readiness",
        "description": "Verify the receiving team is ready for clinical handoff",
        "input_schema": {
            "type": "object",
            "properties": {
                "estimated_arrival_minutes": {
                    "type": "integer",
                    "description": "Estimated time until patient arrives",
                },
            },
            "required": ["estimated_arrival_minutes"],
        },
    },
]

_SPECIALIST_COVERAGE = {
    "pulmonology": {
        "respiratory_failure": {
            "specialist": "Dr. Sarah Chen, MD — Pulmonology/Critical Care",
            "on_call": True,
            "response_time_minutes": 20,
            "privileges_confirmed": True,
            "experience_with_diagnosis": "Manages 15+ ventilated respiratory failure cases/month",
            "capable": True,
            "note": "Preferred specialist for this case; familiar with NIV weaning protocols",
        },
    },
    "critical_care": {
        "respiratory_failure": {
            "specialist": "Dr. Marcus Webb, MD — Intensivist",
            "on_call": True,
            "in_house": True,
            "response_time_minutes": 5,
            "privileges_confirmed": True,
            "capable": True,
            "note": "In-house intensivist; will be primary MICU physician",
        },
        "sepsis": {
            "specialist": "Dr. Marcus Webb, MD — Intensivist",
            "on_call": True,
            "in_house": True,
            "response_time_minutes": 5,
            "privileges_confirmed": True,
            "capable": True,
        },
    },
    "cardiology": {
        "respiratory_failure": {
            "specialist": "Dr. Linda Pham, MD — Cardiology",
            "on_call": True,
            "response_time_minutes": 45,
            "privileges_confirmed": True,
            "capable": True,
            "note": "Available if cardiac component identified; not primary for pure respiratory failure",
        },
    },
}


class SpecialistAvailabilityAgent(BaseAgent):
    role = "specialist"
    local_ontology = {
        "available": "Specialist is on-call, reachable, and can be at bedside within 1 hour",
        "compatible": "Specialist has privileges and capability to manage this diagnosis",
        "critical": "Specialist consultation required within 30 minutes of arrival",
    }
    tools = TOOLS
    system_prompt = (
        "You are the specialist availability coordinator. Your job is to confirm "
        "that appropriate specialists are available and credentialed at Hospital B "
        "to manage this patient's primary diagnosis. For respiratory failure, you must "
        "confirm both a pulmonologist and intensivist. Verify response times are compatible "
        "with the patient's acuity. Confirm the receiving team is ready for handoff."
    )

    def handle_tool_call(self, name: str, inputs: dict) -> Any:
        if name == "confirm_specialist_coverage":
            specialty = inputs.get("specialty", "").lower()
            dx = inputs.get("diagnosis_category", "").lower().replace(" ", "_")
            coverage = _SPECIALIST_COVERAGE.get(specialty, {}).get(dx, {
                "specialist": f"On-call {specialty} specialist",
                "on_call": True,
                "response_time_minutes": 30,
                "privileges_confirmed": True,
                "capable": True,
                "note": f"{specialty} available for {dx}",
            })
            return coverage

        elif name == "check_handoff_readiness":
            eta = inputs.get("estimated_arrival_minutes", 30)
            return {
                "receiving_team_notified": True,
                "bed_prepared": True,
                "ventilator_set_up": True,
                "pharmacy_alerted": True,
                "estimated_arrival_minutes": eta,
                "readiness_status": "READY" if eta >= 15 else "EXPEDITE_PREPARATION",
                "note": (
                    f"Receiving team has {eta} minutes to prepare. "
                    "Ventilator, IV lines, and monitoring ready. Pharmacy notified of current medications."
                ),
            }

        return super().handle_tool_call(name, inputs)
