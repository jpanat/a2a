"""
Ambulance Dispatch Agent

Estimates transport time between hospitals, determines the vehicle type
needed (ALS vs BLS vs critical care transport), and confirms crew availability.
"""

from __future__ import annotations
from typing import Any
from .base import BaseAgent


TOOLS = [
    {
        "name": "estimate_transport_time",
        "description": "Estimate transport time and route between Hospital A and Hospital B",
        "input_schema": {
            "type": "object",
            "properties": {
                "transport_mode": {
                    "type": "string",
                    "enum": ["ground_als", "ground_bls", "air_helicopter", "critical_care_transport"],
                    "description": "Mode of transport",
                },
                "lights_and_siren": {
                    "type": "boolean",
                    "description": "Whether lights-and-siren (emergent) transport is needed",
                },
            },
            "required": ["transport_mode"],
        },
    },
    {
        "name": "check_crew_availability",
        "description": "Check which transport crews and vehicles are currently available",
        "input_schema": {
            "type": "object",
            "properties": {
                "crew_level": {
                    "type": "string",
                    "enum": ["als", "bls", "critical_care", "flight"],
                    "description": "Required crew certification level",
                },
            },
            "required": ["crew_level"],
        },
    },
]

_TRANSPORT_TIMES = {
    "ground_als": {
        "estimated_minutes": 28,
        "lights_siren_minutes": 22,
        "distance_miles": 14.2,
        "route": "I-95 N to Exit 44, Hospital B main entrance",
        "traffic_factor": "moderate",
    },
    "ground_bls": {
        "estimated_minutes": 32,
        "lights_siren_minutes": 25,
        "distance_miles": 14.2,
        "route": "I-95 N to Exit 44, Hospital B main entrance",
        "traffic_factor": "moderate",
    },
    "air_helicopter": {
        "estimated_minutes": 12,
        "lights_siren_minutes": 12,
        "distance_miles": 11.8,
        "route": "Direct flight path",
        "weather_clearance": "ceiling 2800ft, VFR approved",
        "note": "Helipad at Hospital B operational",
    },
    "critical_care_transport": {
        "estimated_minutes": 35,
        "lights_siren_minutes": 28,
        "distance_miles": 14.2,
        "route": "I-95 N to Exit 44, Hospital B main entrance",
        "note": "CCT vehicle with RN+paramedic crew; can manage vented patients",
    },
}

_CREW_DATA = {
    "als": {
        "units_available": 2,
        "nearest_unit_eta_minutes": 8,
        "crew_composition": "Paramedic + EMT-B",
        "ventilator_capable": False,
        "vasopressor_capable": True,
        "note": "ALS crew can manage stable intubated patient short-distance",
    },
    "bls": {
        "units_available": 3,
        "nearest_unit_eta_minutes": 5,
        "crew_composition": "EMT-B + EMT-B",
        "ventilator_capable": False,
        "vasopressor_capable": False,
        "note": "BLS insufficient for this patient acuity",
    },
    "critical_care": {
        "units_available": 1,
        "nearest_unit_eta_minutes": 12,
        "crew_composition": "CCT-RN + Paramedic",
        "ventilator_capable": True,
        "vasopressor_capable": True,
        "note": "CCT crew: preferred for vented ICU-level transport",
    },
    "flight": {
        "units_available": 1,
        "nearest_unit_eta_minutes": 15,
        "crew_composition": "Flight RN + Flight Paramedic",
        "ventilator_capable": True,
        "vasopressor_capable": True,
        "weather_approved": True,
        "note": "Flight crew available; faster but not required given ground option",
    },
}


class AmbulanceDispatchAgent(BaseAgent):
    role = "ambulance"
    local_ontology = {
        "critical": "ALS crew and advanced airway equipment required",
        "available": "Unit is in service, fueled, and crew is on duty",
        "urgent": "Lights-and-siren transport; ETA under 30 minutes",
    }
    tools = TOOLS
    system_prompt = (
        "You are the ambulance dispatch coordinator. Your job is to determine the "
        "appropriate transport mode for this patient (ALS ground, CCT, or air), "
        "estimate transport time, and confirm crew availability. "
        "For ICU-level patients on mechanical ventilation, always recommend CCT or flight crew. "
        "Provide specific ETA estimates and crew type in your assessment."
    )

    def handle_tool_call(self, name: str, inputs: dict) -> Any:
        if name == "estimate_transport_time":
            mode = inputs.get("transport_mode", "ground_als")
            return _TRANSPORT_TIMES.get(mode, {
                "estimated_minutes": 30,
                "distance_miles": 14,
                "note": f"Estimated for {mode}",
            })

        elif name == "check_crew_availability":
            level = inputs.get("crew_level", "als").lower()
            return _CREW_DATA.get(level, {
                "units_available": 1,
                "nearest_unit_eta_minutes": 15,
                "note": f"{level} crew available",
            })

        return super().handle_tool_call(name, inputs)
