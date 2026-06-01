"""
Insurance Validator Agent

Checks patient insurance coverage for the transfer and receiving facility,
flags if emergency override is needed for pre-authorization requirements.
"""

from __future__ import annotations
from typing import Any
from .base import BaseAgent


TOOLS = [
    {
        "name": "check_coverage",
        "description": "Check if patient's insurance covers ICU care at Hospital B",
        "input_schema": {
            "type": "object",
            "properties": {
                "insurance_id": {
                    "type": "string",
                    "description": "Patient insurance ID",
                },
                "service_type": {
                    "type": "string",
                    "description": "Type of service: 'icu_admission', 'critical_care_transport', 'specialist_consult'",
                },
                "receiving_facility_tier": {
                    "type": "string",
                    "enum": ["in_network", "out_of_network", "unknown"],
                    "description": "Network status of receiving facility",
                },
            },
            "required": ["insurance_id", "service_type"],
        },
    },
    {
        "name": "request_emergency_authorization",
        "description": "Flag that emergency authorization is needed and document it",
        "input_schema": {
            "type": "object",
            "properties": {
                "reason": {
                    "type": "string",
                    "description": "Clinical reason requiring emergency override of pre-auth",
                },
                "service_type": {
                    "type": "string",
                    "description": "Service requiring authorization",
                },
            },
            "required": ["reason", "service_type"],
        },
    },
]

_COVERAGE_DATA = {
    "INS-7734221": {
        "plan_name": "BlueCross Premier PPO",
        "status": "active",
        "icu_covered": True,
        "hospital_b_in_network": True,
        "pre_auth_required": True,
        "pre_auth_waived_for_emergency": True,
        "transport_covered": True,
        "transport_limit_miles": 50,
        "deductible_met": True,
        "out_of_pocket_remaining": 450.00,
        "note": "In-network plan; emergency transfers covered with retroactive auth within 48h",
    },
}

_DEFAULT_COVERAGE = {
    "plan_name": "Standard Coverage Plan",
    "status": "active",
    "icu_covered": True,
    "hospital_b_in_network": True,
    "pre_auth_required": True,
    "pre_auth_waived_for_emergency": True,
    "transport_covered": True,
    "note": "Emergency transfer covered; retroactive authorization required within 48 hours",
}


class InsuranceValidatorAgent(BaseAgent):
    role = "insurance_validator"
    local_ontology = {
        "approved": "Prior authorization obtained or emergency exemption documented",
        "compatible": "Service is covered under patient's plan at receiving facility",
        "urgent": "Retroactive authorization may be needed; proceed and document",
    }
    tools = TOOLS
    system_prompt = (
        "You are the insurance and authorization validator. Your job is to confirm "
        "that the patient's insurance covers ICU care at Hospital B, check transport "
        "coverage, and identify whether emergency authorization procedures apply. "
        "For life-threatening emergencies, coverage validation should never block transfer — "
        "instead flag retroactive authorization requirements. Be specific about coverage status."
    )

    def handle_tool_call(self, name: str, inputs: dict) -> Any:
        if name == "check_coverage":
            ins_id = inputs.get("insurance_id", "")
            coverage = _COVERAGE_DATA.get(ins_id, _DEFAULT_COVERAGE)
            service = inputs.get("service_type", "icu_admission")
            result = dict(coverage)
            result["queried_service"] = service
            result["covered"] = coverage.get("icu_covered", True)
            return result

        elif name == "request_emergency_authorization":
            return {
                "authorization_reference": "EMERG-AUTH-2024-0847",
                "status": "documented",
                "retroactive_window_hours": 48,
                "documentation_required": [
                    "Attending physician attestation of emergent nature",
                    "Transfer summary within 24 hours",
                    "Receiving facility admission note",
                ],
                "note": (
                    f"Emergency authorization documented for: {inputs.get('reason', 'emergency transfer')}. "
                    "Retroactive review within 48 hours."
                ),
            }

        return super().handle_tool_call(name, inputs)
