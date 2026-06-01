"""
Hospital Transfer Coordination System — Demo

Scenario: 68-year-old patient in acute hypoxic respiratory failure at Hospital A
needs emergent ICU transfer to Hospital B due to capacity constraints.

Demonstrates:
  1. Semantic Negotiation — resolves conflicting agent ontologies
  2. PHI Minimization — role-based access control on patient context
  3. Multi-Agent Collective Reasoning — 7 agents coordinate via supervisor
  4. Policy & Access Control — emergency override, audit log
"""

import os
import sys

# Verify API key is present before importing anything that uses it
if not os.environ.get("ANTHROPIC_API_KEY"):
    print("ERROR: ANTHROPIC_API_KEY environment variable not set.")
    sys.exit(1)

from ontology import SemanticNegotiator, LOCAL_ONTOLOGIES
from policy import (
    PatientContext,
    AccessControlledContext,
    emergency_override,
    get_audit_log,
)
from agents.supervisor import CoordinationSupervisor


# ── Banner ─────────────────────────────────────────────────────────────────────

def print_banner():
    print("\n" + "█"*62)
    print("█  HOSPITAL TRANSFER COORDINATION SYSTEM                    █")
    print("█  Multi-Agent Demo                                         █")
    print("█"*62)
    print()


# ── Patient Setup ──────────────────────────────────────────────────────────────

def build_patient_context() -> PatientContext:
    """Build the demo patient — 68-year-old in respiratory failure."""
    return PatientContext(
        patient_id="PT-2024-004821",
        age=68,
        diagnosis="Acute hypoxic respiratory failure secondary to community-acquired pneumonia; "
                  "requiring mechanical ventilation (AC/VC mode, FiO2 0.65, PEEP 10). "
                  "SOFA score 9. Bilateral infiltrates on CXR.",
        vitals={
            "heart_rate": 112,
            "blood_pressure": "94/62",
            "respiratory_rate": 28,
            "spo2_percent": 91,
            "temperature_f": 101.8,
            "gcs": 13,
            "fio2": 0.65,
            "peep_cmh2o": 10,
        },
        current_medications=[
            "Norepinephrine 0.08 mcg/kg/min IV",
            "Piperacillin-tazobactam 3.375g IV q6h",
            "Vancomycin 1500mg IV q12h",
            "Propofol 20 mcg/kg/min IV",
            "Fentanyl 25 mcg/hr IV",
            "Pantoprazole 40mg IV daily",
            "Enoxaparin 40mg SQ daily",
        ],
        insurance_id="INS-7734221",
        insurance_status="active",
        hospital_a_internal_notes=(
            "CONFIDENTIAL: Patient's family has expressed concern about care quality. "
            "Risk management notified. Transfer partly driven by family request in addition "
            "to capacity. Do not share this with receiving hospital."
        ),
        next_of_kin={
            "name": "Robert Hartwell",
            "relationship": "son",
            "phone": "617-555-0194",
            "alt_phone": "617-555-0281",
        },
        transfer_reason=(
            "Hospital A ICU at full capacity (12/12 beds occupied). Patient requires "
            "continued mechanical ventilation and vasopressor support beyond current "
            "facility capability at census. Transfer to tertiary center with pulmonology "
            "and intensivist coverage."
        ),
        acuity_score=8,
    )


# ── Section Printers ──────────────────────────────────────────────────────────

def print_section(title: str):
    print(f"\n{'='*62}")
    print(f"  {title}")
    print(f"{'='*62}")


def print_access_control_demo(context: AccessControlledContext):
    """Show how different roles see different data."""
    print_section("ACCESS CONTROL DEMONSTRATION")

    demo_roles = ["ambulance", "insurance_validator", "hospital_b", "risk_assessment"]
    for role in demo_roles:
        view = context.get_view(role)
        print(f"\n  Role: {role.upper()}")
        print(f"  Fields visible ({len(view)}): {sorted(view.keys())}")
        # Show if PHI is hidden
        phi_fields = {"patient_id", "insurance_id", "next_of_kin", "hospital_a_internal_notes"}
        hidden_phi = phi_fields - set(view.keys())
        if hidden_phi:
            print(f"  PHI fields hidden: {sorted(hidden_phi)}")

    # Demonstrate emergency override
    print(f"\n  Demonstrating emergency_override context manager...")
    with emergency_override(
        reason="Insurance authorization check requires full patient identity for retroactive filing",
        requesting_role="insurance_validator",
    ):
        full_view = context.get_view("insurance_validator")
        print(f"  Under override — insurance_validator sees: {sorted(full_view.keys())}")


def print_final_decision(decision):
    """Print the final transfer decision in a clean format."""
    print_section("FINAL TRANSFER DECISION")

    status = "APPROVED" if decision.approved else "NOT APPROVED"
    print(f"\n  Decision:        {status}")
    print(f"  Confidence:      {decision.confidence:.0%}")
    print(f"  Rounds needed:   {decision.rounds_to_convergence}")
    print(f"  Override used:   {'YES' if decision.override_used else 'No'}")

    print(f"\n  Summary:")
    for line in decision.summary.split(". "):
        if line.strip():
            print(f"    {line.strip()}.")

    print(f"\n  Transport Plan:")
    print(f"    Mode:           {decision.transport_mode}")
    print(f"    Receiving unit: {decision.receiving_unit}")
    print(f"    ETA:            {decision.estimated_transport_time_minutes} minutes")
    print(f"    Specialist:     {decision.specialist_coverage}")

    print(f"\n  Risk Assessment:")
    print(f"    Score:          {decision.risk_score}/10")
    print(f"    Category:       {decision.risk_category}")

    print(f"\n  Insurance:")
    print(f"    {decision.insurance_status}")

    if decision.precautions:
        print(f"\n  Precautions ({len(decision.precautions)}):")
        for p in decision.precautions:
            print(f"    • {p}")

    if decision.blockers:
        print(f"\n  Blockers ({len(decision.blockers)}):")
        for b in decision.blockers:
            print(f"    ✗ {b}")

    # Agent vote summary
    print(f"\n  Agent Votes (final round):")
    latest: dict = {}
    for a in decision.agent_assessments:
        if a.role not in latest or a.round_number > latest[a.role].round_number:
            latest[a.role] = a
    for role, a in sorted(latest.items()):
        verdict = "YES" if a.feasible else ("NO" if a.feasible is False else "?")
        print(f"    [{verdict}] {role:22s} confidence={a.confidence:.0%}")


def print_semantic_summary(negotiator: SemanticNegotiator):
    """Print the semantic negotiation results."""
    print_section("SEMANTIC NEGOTIATION RESULTS")
    print(f"\n  Conflicts resolved: {len(negotiator.conflicts)}")
    print(f"  Shared ontology terms: {len(negotiator.shared_ontology)}")
    for conflict in negotiator.conflicts:
        method = "LLM arbitration" if conflict.arbitration_used else "canonical mapping"
        print(f"\n  Term: '{conflict.term}'  (method: {method})")
        print(f"  Roles with local definitions: {list(conflict.definitions.keys())}")
        print(f"  Resolved: {conflict.resolved_definition}")


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    print_banner()

    # 1. Build patient context
    print_section("SCENARIO SETUP")
    patient = build_patient_context()
    context = AccessControlledContext(patient)
    print(f"\n  Patient:   {patient.age}yo, {patient.diagnosis[:60]}...")
    print(f"  Acuity:    {patient.acuity_score}/10")
    print(f"  Vitals:    HR {patient.vitals['heart_rate']}, "
          f"BP {patient.vitals['blood_pressure']}, "
          f"SpO2 {patient.vitals['spo2_percent']}%, "
          f"FiO2 {patient.vitals['fio2']}")
    print(f"  Insurance: {patient.insurance_status} ({patient.insurance_id})")

    # 2. Demonstrate access control
    print_access_control_demo(context)

    # 3. Semantic negotiation
    print_section("RUNNING SEMANTIC NEGOTIATION")
    print("\n  Collecting local ontologies from all agent roles...")
    roles = list(LOCAL_ONTOLOGIES.keys())
    print(f"  Roles: {roles}")

    negotiator = SemanticNegotiator(verbose=True)
    shared_ontology = negotiator.negotiate(roles)

    # 4. Multi-agent coordination
    print_section("STARTING MULTI-AGENT COORDINATION")
    print(f"\n  Agents: HospitalA, HospitalB, ICUCapacity, Ambulance,")
    print(f"          InsuranceValidator, Specialist, RiskAssessment")
    print(f"  Supervisor: CoordinationSupervisor (max {5} rounds)")
    print(f"\n  Shared ontology in use ({len(shared_ontology)} terms): "
          f"{list(shared_ontology.keys())}")

    supervisor = CoordinationSupervisor(
        context=context,
        shared_ontology=shared_ontology,
        verbose=True,
    )

    decision = supervisor.coordinate(override_used=False)

    # 5. Final decision
    print_final_decision(decision)

    # 6. Semantic summary
    print_semantic_summary(negotiator)

    # 7. Audit log
    print_section("AUDIT LOG SUMMARY")
    audit_log = get_audit_log()
    entries = audit_log.get_entries()
    print(f"\n  Total audit entries: {len(entries)}")
    overrides = [e for e in entries if e.override_active]
    denials = [e for e in entries if e.fields_denied]
    print(f"  Emergency overrides: {len([e for e in entries if e.event_type == 'EMERGENCY_OVERRIDE_ACTIVATED'])}")
    print(f"  Access events with denials: {len(denials)}")
    print(f"\n  Sample denied-field events:")
    shown = 0
    for entry in denials[:4]:
        print(f"    Role {entry.role:20s} denied: {entry.fields_denied}")
        shown += 1

    print(f"\n  Full audit trail ({len(entries)} entries):")
    for entry in entries:
        override_flag = " [OVERRIDE]" if entry.override_active else ""
        print(f"    [{entry.timestamp[11:19]}] {entry.event_type:35s} | {entry.role}{override_flag}")

    print("\n" + "█"*62)
    print("█  COORDINATION COMPLETE                                    █")
    print("█"*62 + "\n")


if __name__ == "__main__":
    main()
