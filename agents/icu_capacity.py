"""
ICU Capacity Agent

Evaluates whether the receiving ICU bed meets the patient's acuity needs,
considering SOFA score, monitoring requirements, and staffing ratios.
"""

from __future__ import annotations
from typing import Any
from .base import BaseAgent


TOOLS = [
    {
        "name": "evaluate_acuity_match",
        "description": "Evaluate whether a receiving ICU can meet patient acuity requirements",
        "input_schema": {
            "type": "object",
            "properties": {
                "patient_acuity_score": {
                    "type": "integer",
                    "description": "Patient acuity score 1-10",
                },
                "required_interventions": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "List of interventions required (e.g. 'mechanical_ventilation', 'vasopressors')",
                },
                "receiving_unit": {
                    "type": "string",
                    "description": "Target receiving unit (e.g. 'micu', 'icu')",
                },
            },
            "required": ["patient_acuity_score", "required_interventions", "receiving_unit"],
        },
    },
    {
        "name": "check_monitoring_capability",
        "description": "Verify the ICU has the required monitoring equipment",
        "input_schema": {
            "type": "object",
            "properties": {
                "monitoring_needs": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Required monitoring types (e.g. 'arterial_line', 'pulmonary_artery_catheter')",
                },
                "unit": {"type": "string", "description": "ICU unit to check"},
            },
            "required": ["monitoring_needs", "unit"],
        },
    },
]

_UNIT_CAPABILITIES = {
    "micu": {
        "max_acuity_supported": 10,
        "ventilator_capable": True,
        "vasopressor_capable": True,
        "ecmo_capable": False,
        "nurse_ratio": "1:1 or 1:2",
        "respiratory_therapy_24h": True,
        "interventions_supported": [
            "mechanical_ventilation", "vasopressors", "hemodialysis",
            "bronchoscopy", "thoracentesis", "arterial_line",
            "central_venous_catheter", "intubation",
        ],
        "monitoring_available": [
            "continuous_telemetry", "arterial_line", "cvp",
            "end_tidal_co2", "pulmonary_artery_catheter",
        ],
    },
    "icu": {
        "max_acuity_supported": 10,
        "ventilator_capable": True,
        "vasopressor_capable": True,
        "ecmo_capable": True,
        "nurse_ratio": "1:1 or 1:2",
        "respiratory_therapy_24h": True,
        "interventions_supported": [
            "mechanical_ventilation", "vasopressors", "hemodialysis",
            "ecmo", "arterial_line", "central_venous_catheter",
        ],
        "monitoring_available": [
            "continuous_telemetry", "arterial_line", "cvp", "end_tidal_co2",
        ],
    },
}


def _evaluate_match(acuity: int, interventions: list[str], unit: str) -> dict:
    caps = _UNIT_CAPABILITIES.get(unit, _UNIT_CAPABILITIES["icu"])
    unsupported = [i for i in interventions if i not in caps["interventions_supported"]]
    return {
        "unit": unit,
        "acuity_within_capability": acuity <= caps["max_acuity_supported"],
        "unsupported_interventions": unsupported,
        "all_interventions_supported": len(unsupported) == 0,
        "nurse_ratio": caps["nurse_ratio"],
        "respiratory_therapy_24h": caps.get("respiratory_therapy_24h", False),
        "recommendation": (
            "COMPATIBLE" if acuity <= caps["max_acuity_supported"] and not unsupported
            else "NOT COMPATIBLE"
        ),
    }


class ICUCapacityAgent(BaseAgent):
    role = "icu_capacity"
    local_ontology = {
        "critical": "SOFA score >= 11 or single-organ failure requiring support",
        "available": "ICU bed open with 1:1 or 1:2 nursing ratio achievable",
        "compatible": "ICU can provide required monitoring and interventions",
        "urgent": "Patient should arrive within 2 hours to prevent deterioration",
    }
    tools = TOOLS
    system_prompt = (
        "You are an ICU capacity and acuity matching specialist. "
        "Your job is to determine whether the receiving ICU unit can safely support "
        "this patient's clinical needs — including ventilation, vasopressors, monitoring, "
        "and nursing ratios. You evaluate capability match, not just bed count. "
        "Provide a clear COMPATIBLE or NOT COMPATIBLE verdict with clinical rationale."
    )

    def handle_tool_call(self, name: str, inputs: dict) -> Any:
        if name == "evaluate_acuity_match":
            return _evaluate_match(
                inputs.get("patient_acuity_score", 8),
                inputs.get("required_interventions", []),
                inputs.get("receiving_unit", "micu"),
            )

        elif name == "check_monitoring_capability":
            unit = inputs.get("unit", "micu")
            caps = _UNIT_CAPABILITIES.get(unit, _UNIT_CAPABILITIES["icu"])
            needs = inputs.get("monitoring_needs", [])
            available_monitoring = caps.get("monitoring_available", [])
            unmet = [m for m in needs if m not in available_monitoring]
            return {
                "unit": unit,
                "monitoring_available": available_monitoring,
                "requested": needs,
                "unmet_needs": unmet,
                "all_needs_met": len(unmet) == 0,
            }

        return super().handle_tool_call(name, inputs)
