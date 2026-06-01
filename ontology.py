"""
Semantic Negotiation Layer

Each agent role has local definitions for shared terms. The SemanticNegotiator
resolves conflicts between local definitions into canonical shared definitions,
using LLM arbitration when the canonical mapping doesn't fully cover a conflict.
"""

from dataclasses import dataclass, field
from typing import Optional
import anthropic
import json

MODEL = "claude-haiku-4-5-20251001"

@dataclass
class SemanticTerm:
    term: str
    local_definition: str
    role: str

# Canonical mappings for common terms — used before falling back to LLM arbitration
CANONICAL_MAPPINGS = {
    "critical": "Patient requires immediate life-sustaining intervention; any delay >15min risks irreversible harm or death",
    "available": "Resource is operationally ready, staffed, and can accept a new patient within 30 minutes",
    "approved": "All required authorizations (clinical, administrative, insurance) have been granted and documented",
    "compatible": "Resource meets all clinical, equipment, and staffing requirements for the patient's current acuity level",
    "urgent": "Patient condition requires action within 2-4 hours; deterioration likely without timely transfer",
}

# Local ontologies per agent role
LOCAL_ONTOLOGIES = {
    "hospital_a": {
        "critical": "Patient is ICU-level; on vasopressors or intubated",
        "available": "Bed is physically empty and housekeeping-cleared",
        "approved": "Attending physician has signed transfer order",
        "urgent": "Transfer needed today to free ICU capacity",
    },
    "hospital_b": {
        "critical": "Patient requires immediate specialist intervention",
        "available": "Bed is empty, nurse assigned, and accepting new admits",
        "approved": "Bed management, intensivist, and charge nurse all confirmed",
        "compatible": "Patient acuity matches our ICU capability tier",
        "urgent": "Transfer should occur within 4 hours",
    },
    "icu_capacity": {
        "critical": "SOFA score ≥ 11 or single-organ failure requiring support",
        "available": "ICU bed open with 1:1 or 1:2 nursing ratio achievable",
        "compatible": "ICU can provide required monitoring and interventions",
        "urgent": "Patient should arrive within 2 hours to prevent deterioration",
    },
    "ambulance": {
        "critical": "ALS crew and advanced airway equipment required",
        "available": "Unit is in service, fueled, and crew is on duty",
        "urgent": "Lights-and-siren transport; ETA under 30 minutes",
    },
    "insurance_validator": {
        "approved": "Prior authorization obtained or emergency exemption documented",
        "compatible": "Service is covered under patient's plan at receiving facility",
        "urgent": "Retroactive authorization may be needed; proceed and document",
    },
    "specialist": {
        "available": "Specialist is on-call, reachable, and can be at bedside within 1 hour",
        "compatible": "Specialist has privileges and capability to manage this diagnosis",
        "critical": "Specialist consultation required within 30 minutes of arrival",
    },
    "risk_assessment": {
        "critical": "Transfer risk score ≥ 8/10; mortality risk >15% during transport",
        "urgent": "Transfer risk score 5-7/10; recommend expedited but stable transport",
        "compatible": "Receiving facility risk profile is lower than current facility",
    },
    "supervisor": {
        "critical": "All agents agree patient is in immediate danger",
        "approved": "All required agents have confirmed feasibility",
        "urgent": "Coordination must complete within 60 minutes",
        "compatible": "Transfer plan satisfies all specialist and resource constraints",
    },
}


@dataclass
class NegotiationConflict:
    term: str
    definitions: dict[str, str]  # role -> local_definition
    canonical: Optional[str] = None
    resolved_definition: Optional[str] = None
    arbitration_used: bool = False


class SemanticNegotiator:
    """
    Collects local term definitions from all agents, identifies conflicts,
    resolves them via canonical mapping or LLM arbitration, and produces
    a shared ontology all agents can use.
    """

    def __init__(self, verbose: bool = True):
        self.client = anthropic.Anthropic()
        self.verbose = verbose
        self.conflicts: list[NegotiationConflict] = []
        self.shared_ontology: dict[str, str] = {}
        self.resolution_log: list[str] = []

    def collect_definitions(self, roles: list[str]) -> dict[str, dict[str, str]]:
        """Gather local ontologies for the given roles."""
        return {role: LOCAL_ONTOLOGIES.get(role, {}) for role in roles}

    def find_conflicts(self, definitions: dict[str, dict[str, str]]) -> list[NegotiationConflict]:
        """Find terms defined differently across roles."""
        all_terms: dict[str, dict[str, str]] = {}
        for role, terms in definitions.items():
            for term, defn in terms.items():
                if term not in all_terms:
                    all_terms[term] = {}
                all_terms[term][role] = defn

        conflicts = []
        for term, role_defs in all_terms.items():
            if len(role_defs) > 1:
                # Check if definitions meaningfully differ
                unique_defs = set(role_defs.values())
                if len(unique_defs) > 1:
                    conflicts.append(NegotiationConflict(
                        term=term,
                        definitions=role_defs,
                        canonical=CANONICAL_MAPPINGS.get(term),
                    ))
        return conflicts

    def resolve_via_llm(self, conflict: NegotiationConflict) -> str:
        """Use Claude to arbitrate a conflict when canonical mapping is insufficient."""
        defs_text = "\n".join(
            f"  - {role}: '{defn}'" for role, defn in conflict.definitions.items()
        )
        prompt = f"""You are a medical terminology arbitrator for a hospital transfer coordination system.

The term "{conflict.term}" has conflicting local definitions across agents:
{defs_text}

{"The canonical system definition is: " + conflict.canonical if conflict.canonical else "No canonical definition exists."}

Produce a single, precise, operationally actionable shared definition that:
1. Captures the clinical intent common to all agent definitions
2. Is specific enough to avoid ambiguity during time-sensitive transfers
3. Is concise (one sentence, under 30 words)

Respond with ONLY the shared definition text, no explanation."""

        response = self.client.messages.create(
            model=MODEL,
            max_tokens=150,
            messages=[{"role": "user", "content": prompt}],
        )
        return response.content[0].text.strip()

    def negotiate(self, roles: list[str]) -> dict[str, str]:
        """
        Full negotiation pipeline: collect → find conflicts → resolve → return shared ontology.
        Returns the shared ontology dict.
        """
        if self.verbose:
            print("\n" + "="*60)
            print("SEMANTIC NEGOTIATION LAYER")
            print("="*60)

        definitions = self.collect_definitions(roles)
        self.conflicts = self.find_conflicts(definitions)

        if self.verbose:
            print(f"Found {len(self.conflicts)} semantic conflicts across {len(roles)} agents")

        for conflict in self.conflicts:
            if self.verbose:
                print(f"\n[CONFLICT] Term: '{conflict.term}'")
                for role, defn in conflict.definitions.items():
                    print(f"  {role:20s}: {defn}")

            # Use canonical mapping if it covers the term well
            if conflict.canonical:
                conflict.resolved_definition = conflict.canonical
                conflict.arbitration_used = False
                log_msg = f"  → RESOLVED via canonical mapping: {conflict.canonical}"
            else:
                # Fall back to LLM arbitration
                conflict.resolved_definition = self.resolve_via_llm(conflict)
                conflict.arbitration_used = True
                log_msg = f"  → RESOLVED via LLM arbitration: {conflict.resolved_definition}"

            if self.verbose:
                print(log_msg)
            self.resolution_log.append(f"'{conflict.term}': {log_msg}")
            self.shared_ontology[conflict.term] = conflict.resolved_definition

        # Also include terms only defined by one role (no conflict, just add them)
        all_definitions = self.collect_definitions(roles)
        all_terms: dict[str, dict[str, str]] = {}
        for role, terms in all_definitions.items():
            for term, defn in terms.items():
                if term not in all_terms:
                    all_terms[term] = {}
                all_terms[term][role] = defn

        for term, role_defs in all_terms.items():
            if term not in self.shared_ontology:
                # Single role defines it — use canonical or the single definition
                self.shared_ontology[term] = CANONICAL_MAPPINGS.get(term, list(role_defs.values())[0])

        if self.verbose:
            print(f"\n✓ Shared ontology established with {len(self.shared_ontology)} terms")
            print("="*60 + "\n")

        return self.shared_ontology

    def get_summary(self) -> str:
        """Human-readable summary of negotiation results."""
        lines = [f"Semantic Negotiation Summary ({len(self.conflicts)} conflicts resolved):"]
        for conflict in self.conflicts:
            method = "LLM arbitration" if conflict.arbitration_used else "canonical mapping"
            lines.append(f"  '{conflict.term}' → resolved via {method}")
            lines.append(f"    Shared: {conflict.resolved_definition}")
        return "\n".join(lines)
