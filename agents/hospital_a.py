"""
Hospital A Agent

Reports on the sending hospital's bed availability, equipment status,
and current ICU census. Initiates the transfer request.
"""

from __future__ import annotations
from typing import Any
from .base import BaseAgent


TOOLS = [
    {
        "name": "check_bed_availability",
        "description": "Check current ICU and step-down bed availability at Hospital A",
        "input_schema": {
            "type": "object",
            "properties": {
                "unit_type": {
                    "type": "string",
                    "enum": ["icu", "step_down", "general"],
                    "description": "Type of unit to check",
                },
            },
            "required": ["unit_type"],
        },
    },
    {
        "name": "get_equipment_status",
        "description": "Check if specialized equipment is available or required for transfer",
        "input_schema": {
            "type": "object",
            "properties": {
                "equipment_type": {
                    "type": "string",
                    "description": "e.g. 'ventilator', 'ECMO', 'vasopressor_pump'",
                },
            },
            "required": ["equipment_type"],
        },
    },
]

# Mock data representing current Hospital A state
_BED_DATA = {
    "icu": {
        "total_beds": 12,
        "occupied": 12,
        "available": 0,
        "pending_discharge": 1,
        "note": "At full capacity; pending discharge expected in 4-6 hours",
    },
    "step_down": {
        "total_beds": 20,
        "occupied": 18,
        "available": 2,
        "pending_discharge": 0,
    },
    "general": {
        "total_beds": 60,
        "occupied": 44,
        "available": 16,
        "pending_discharge": 3,
    },
}

_EQUIPMENT_DATA = {
    "ventilator": {
        "available_units": 1,
        "in_use": 8,
        "total": 9,
        "transport_capable": True,
        "note": "1 transport ventilator available for transfer",
    },
    "ecmo": {
        "available_units": 0,
        "in_use": 1,
        "total": 1,
        "transport_capable": False,
        "note": "ECMO not available; patient not currently on ECMO",
    },
    "vasopressor_pump": {
        "available_units": 3,
        "in_use": 5,
        "total": 8,
        "transport_capable": True,
        "note": "Transport-capable pumps available",
    },
}


class HospitalAAgent(BaseAgent):
    role = "hospital_a"
    local_ontology = {
        "critical": "Patient is ICU-level; on vasopressors or intubated",
        "available": "Bed is physically empty and housekeeping-cleared",
        "approved": "Attending physician has signed transfer order",
        "urgent": "Transfer needed today to free ICU capacity",
    }
    tools = TOOLS
    system_prompt = (
        "You are the transfer coordination representative for Hospital A (sending hospital). "
        "Your job is to accurately report the patient's current clinical status, confirm that "
        "the transfer is medically necessary due to capacity constraints, and verify what "
        "equipment will travel with the patient. Be factual and concise."
    )

    def handle_tool_call(self, name: str, inputs: dict) -> Any:
        if name == "check_bed_availability":
            unit = inputs.get("unit_type", "icu")
            return _BED_DATA.get(unit, {"error": f"Unknown unit type: {unit}"})

        elif name == "get_equipment_status":
            equip = inputs.get("equipment_type", "").lower().replace(" ", "_")
            return _EQUIPMENT_DATA.get(equip, {
                "available_units": 1,
                "transport_capable": True,
                "note": f"Equipment '{equip}' status: available for transport",
            })

        return super().handle_tool_call(name, inputs)
