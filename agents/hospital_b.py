"""
Hospital B Agent

Reports on the receiving hospital's capacity: ICU beds, specialist on-call,
and willingness/ability to accept the transfer.
"""

from __future__ import annotations
from typing import Any
from .base import BaseAgent


TOOLS = [
    {
        "name": "check_receiving_capacity",
        "description": "Check ICU and receiving unit capacity at Hospital B",
        "input_schema": {
            "type": "object",
            "properties": {
                "unit_type": {
                    "type": "string",
                    "enum": ["icu", "micu", "sicu", "step_down"],
                    "description": "Specific ICU type or unit to check",
                },
            },
            "required": ["unit_type"],
        },
    },
    {
        "name": "check_specialist_on_call",
        "description": "Check which specialists are currently on-call and available",
        "input_schema": {
            "type": "object",
            "properties": {
                "specialty": {
                    "type": "string",
                    "description": "Medical specialty needed, e.g. 'pulmonology', 'critical_care'",
                },
            },
            "required": ["specialty"],
        },
    },
]

_CAPACITY_DATA = {
    "icu": {
        "total_beds": 18,
        "occupied": 14,
        "available": 4,
        "nurse_ratio_achievable": True,
        "isolation_rooms_available": 2,
        "note": "4 ICU beds available; accepting transfers",
    },
    "micu": {
        "total_beds": 10,
        "occupied": 8,
        "available": 2,
        "nurse_ratio_achievable": True,
        "note": "Medical ICU has 2 beds; preferred for respiratory cases",
    },
    "sicu": {
        "total_beds": 8,
        "occupied": 8,
        "available": 0,
        "nurse_ratio_achievable": False,
        "note": "Surgical ICU at capacity",
    },
    "step_down": {
        "total_beds": 24,
        "occupied": 18,
        "available": 6,
        "nurse_ratio_achievable": True,
        "note": "Step-down available but insufficient for ICU-level acuity",
    },
}

_SPECIALIST_DATA = {
    "pulmonology": {
        "on_call": True,
        "physician": "Dr. Sarah Chen",
        "pager": "555-8821",
        "response_time_minutes": 20,
        "privileges_active": True,
        "note": "Pulmonologist on-call, can be at bedside within 20 minutes of arrival",
    },
    "critical_care": {
        "on_call": True,
        "physician": "Dr. Marcus Webb",
        "pager": "555-9034",
        "response_time_minutes": 15,
        "privileges_active": True,
        "note": "Intensivist in-house overnight; will be primary physician",
    },
    "cardiology": {
        "on_call": True,
        "physician": "Dr. Linda Pham",
        "pager": "555-7712",
        "response_time_minutes": 45,
        "privileges_active": True,
        "note": "Cardiologist on-call from home; 45 min response time",
    },
}


class HospitalBAgent(BaseAgent):
    role = "hospital_b"
    local_ontology = {
        "critical": "Patient requires immediate specialist intervention",
        "available": "Bed is empty, nurse assigned, and accepting new admits",
        "approved": "Bed management, intensivist, and charge nurse all confirmed",
        "compatible": "Patient acuity matches our ICU capability tier",
        "urgent": "Transfer should occur within 4 hours",
    }
    tools = TOOLS
    system_prompt = (
        "You are the transfer acceptance coordinator for Hospital B (receiving hospital). "
        "Your job is to confirm whether Hospital B can safely accept this transfer, "
        "identify the appropriate receiving unit, and verify specialist coverage. "
        "You must confirm bed availability AND staff readiness before approving acceptance."
    )

    def handle_tool_call(self, name: str, inputs: dict) -> Any:
        if name == "check_receiving_capacity":
            unit = inputs.get("unit_type", "icu")
            return _CAPACITY_DATA.get(unit, {"error": f"Unknown unit: {unit}"})

        elif name == "check_specialist_on_call":
            specialty = inputs.get("specialty", "").lower().replace(" ", "_")
            return _SPECIALIST_DATA.get(specialty, {
                "on_call": True,
                "physician": "Dr. On-Call Physician",
                "response_time_minutes": 30,
                "privileges_active": True,
                "note": f"{specialty} specialist available on-call",
            })

        return super().handle_tool_call(name, inputs)
