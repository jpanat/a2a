"""
Coordination Supervisor Agent

Orchestrates the multi-agent loop. Queries all specialist agents, synthesizes
their assessments, checks for consensus, and drives convergence on a final
TransferDecision within a bounded number of rounds.
"""

from __future__ import annotations
import json
from dataclasses import dataclass, field
from typing import Any, Optional
import anthropic

from policy import AccessControlledContext
from .hospital_a import HospitalAAgent
from .hospital_b import HospitalBAgent
from .icu_capacity import ICUCapacityAgent
from .ambulance import AmbulanceDispatchAgent
from .insurance import InsuranceValidatorAgent
from .specialist import SpecialistAvailabilityAgent
from .risk import RiskAssessmentAgent

MODEL = "claude-haiku-4-5-20251001"
MAX_ROUNDS = 5


@dataclass
class AgentAssessment:
    role: str
    round_number: int
    feasible: Optional[bool]
    assessment: str
    confidence: float
    details: dict = field(default_factory=dict)


@dataclass
class TransferDecision:
    approved: bool
    confidence: float
    summary: str
    transport_mode: str
    receiving_unit: str
    estimated_transport_time_minutes: int
    specialist_coverage: str
    insurance_status: str
    risk_score: float
    risk_category: str
    precautions: list[str]
    blockers: list[str]
    rounds_to_convergence: int
    agent_assessments: list[AgentAssessment]
    override_used: bool = False


class CoordinationSupervisor:
    """
    Orchestrates all specialist agents in a multi-round convergence loop.
    Each round collects assessments from all agents, checks consensus,
    and if not reached, synthesizes context for the next round.
    """

    def __init__(self, context: AccessControlledContext, shared_ontology: dict[str, str], verbose: bool = True):
        self.context = context
        self.shared_ontology = shared_ontology
        self.verbose = verbose
        self.client = anthropic.Anthropic()

        # Instantiate all specialist agents
        self.agents = {
            "hospital_a": HospitalAAgent(),
            "hospital_b": HospitalBAgent(),
            "icu_capacity": ICUCapacityAgent(),
            "ambulance": AmbulanceDispatchAgent(),
            "insurance_validator": InsuranceValidatorAgent(),
            "specialist": SpecialistAvailabilityAgent(),
            "risk_assessment": RiskAssessmentAgent(),
        }

        self.all_assessments: list[AgentAssessment] = []

    def _print(self, msg: str) -> None:
        if self.verbose:
            print(msg)

    def _query_agent(
        self,
        agent_role: str,
        round_num: int,
        synthesis_context: str = "",
    ) -> AgentAssessment:
        """Query a single agent and return its assessment."""
        agent = self.agents[agent_role]
        context_summary = self.context.get_summary_text(agent_role)

        result = agent.reason(
            context_summary=context_summary,
            shared_ontology=self.shared_ontology,
            additional_context=synthesis_context,
        )

        return AgentAssessment(
            role=agent_role,
            round_number=round_num,
            feasible=result.get("feasible"),
            assessment=result.get("assessment", ""),
            confidence=result.get("confidence", 0.5),
            details=result.get("details", {}),
        )

    def _check_consensus(self, assessments: list[AgentAssessment]) -> tuple[bool, Optional[bool]]:
        """
        Check if all agents agree on feasibility.
        Returns (consensus_reached, consensus_value).
        Agents with feasible=None (uncertain) break consensus.
        """
        feasibilities = [a.feasible for a in assessments if a.feasible is not None]
        uncertain = [a for a in assessments if a.feasible is None]

        if not feasibilities:
            return False, None

        all_agree = len(set(feasibilities)) == 1
        no_uncertainty = len(uncertain) == 0

        return (all_agree and no_uncertainty), feasibilities[0] if all_agree else None

    def _synthesize_round(
        self,
        assessments: list[AgentAssessment],
        round_num: int,
    ) -> str:
        """
        Use Claude to synthesize round assessments into context for the next round.
        Highlights conflicts and unresolved issues.
        """
        summaries = []
        for a in assessments:
            verdict = "FEASIBLE" if a.feasible else ("NOT FEASIBLE" if a.feasible is False else "UNCERTAIN")
            summaries.append(
                f"[{a.role.upper()}] Verdict: {verdict} (confidence: {a.confidence:.0%})\n"
                f"  {a.assessment[:300]}..."
            )

        assessments_text = "\n\n".join(summaries)

        prompt = f"""You are coordinating a hospital transfer. After round {round_num}, here are agent assessments:

{assessments_text}

Identify:
1. Which agents are blocking or uncertain about the transfer
2. Key information gaps or conflicts between agents
3. Specific questions the blocking/uncertain agents need answered in the next round

Be concise — this synthesis will be passed back to agents as additional context.
Format as bullet points. Under 200 words."""

        try:
            response = self.client.messages.create(
                model=MODEL,
                max_tokens=400,
                messages=[{"role": "user", "content": prompt}],
            )
            return response.content[0].text.strip()
        except anthropic.APIError as e:
            return f"Synthesis failed: {e}. Agents should continue with available information."

    def _build_final_decision(
        self,
        all_assessments: list[AgentAssessment],
        rounds: int,
        override_used: bool,
    ) -> TransferDecision:
        """
        Use Claude to synthesize all agent assessments into a structured TransferDecision.
        """
        # Collect last assessment per agent
        latest: dict[str, AgentAssessment] = {}
        for a in all_assessments:
            if a.role not in latest or a.round_number > latest[a.role].round_number:
                latest[a.role] = a

        summaries = "\n\n".join(
            f"[{role.upper()}] feasible={a.feasible}, confidence={a.confidence:.0%}\n{a.assessment[:500]}"
            for role, a in latest.items()
        )

        prompt = f"""Based on all agent assessments for a hospital transfer coordination, produce a final structured decision.

AGENT ASSESSMENTS:
{summaries}

Produce a JSON object with exactly these fields:
{{
  "approved": true/false,
  "confidence": 0.0-1.0,
  "summary": "2-3 sentence executive summary",
  "transport_mode": "e.g. critical_care_transport or ground_als",
  "receiving_unit": "e.g. MICU",
  "estimated_transport_time_minutes": integer,
  "specialist_coverage": "Who covers on arrival",
  "insurance_status": "coverage status summary",
  "risk_score": float 0-10,
  "risk_category": "LOW/MODERATE/HIGH/VERY HIGH",
  "precautions": ["list", "of", "precautions"],
  "blockers": ["list of blockers, empty if approved"]
}}

Respond with ONLY valid JSON, no explanation."""

        try:
            response = self.client.messages.create(
                model=MODEL,
                max_tokens=800,
                messages=[{"role": "user", "content": prompt}],
            )
            raw = response.content[0].text.strip()
            # Strip markdown code fences if present
            if raw.startswith("```"):
                raw = raw.split("```")[1]
                if raw.startswith("json"):
                    raw = raw[4:]
            data = json.loads(raw.strip())
        except Exception as e:
            # Fallback decision if LLM call fails
            feasibilities = [a.feasible for a in latest.values() if a.feasible is not None]
            approved = bool(feasibilities) and all(feasibilities)
            data = {
                "approved": approved,
                "confidence": 0.6,
                "summary": f"Decision synthesized from {len(latest)} agents. Parse error: {e}",
                "transport_mode": "critical_care_transport",
                "receiving_unit": "MICU",
                "estimated_transport_time_minutes": 35,
                "specialist_coverage": "Intensivist in-house",
                "insurance_status": "Coverage confirmed",
                "risk_score": 5.0,
                "risk_category": "MODERATE",
                "precautions": ["Standard ICU transport protocols"],
                "blockers": [] if approved else ["See individual agent assessments"],
            }

        return TransferDecision(
            approved=data.get("approved", False),
            confidence=data.get("confidence", 0.5),
            summary=data.get("summary", ""),
            transport_mode=data.get("transport_mode", ""),
            receiving_unit=data.get("receiving_unit", ""),
            estimated_transport_time_minutes=data.get("estimated_transport_time_minutes", 0),
            specialist_coverage=data.get("specialist_coverage", ""),
            insurance_status=data.get("insurance_status", ""),
            risk_score=data.get("risk_score", 0.0),
            risk_category=data.get("risk_category", "UNKNOWN"),
            precautions=data.get("precautions", []),
            blockers=data.get("blockers", []),
            rounds_to_convergence=rounds,
            agent_assessments=all_assessments,
            override_used=override_used,
        )

    def coordinate(self, override_used: bool = False) -> TransferDecision:
        """
        Main coordination loop. Runs up to MAX_ROUNDS, checking for consensus
        after each round. Returns a TransferDecision.
        """
        self._print("\n" + "="*60)
        self._print("COORDINATION SUPERVISOR: STARTING MULTI-AGENT LOOP")
        self._print(f"Agents: {list(self.agents.keys())}")
        self._print(f"Max rounds: {MAX_ROUNDS}")
        self._print("="*60)

        synthesis_context = ""
        rounds_completed = 0

        for round_num in range(1, MAX_ROUNDS + 1):
            self._print(f"\n{'─'*60}")
            self._print(f"ROUND {round_num}/{MAX_ROUNDS}")
            self._print(f"{'─'*60}")

            round_assessments: list[AgentAssessment] = []

            for agent_role in self.agents:
                self._print(f"\n  Querying {agent_role.upper()}...")
                assessment = self._query_agent(agent_role, round_num, synthesis_context)
                round_assessments.append(assessment)
                self.all_assessments.append(assessment)

                verdict = (
                    "FEASIBLE" if assessment.feasible else
                    "NOT FEASIBLE" if assessment.feasible is False else
                    "UNCERTAIN"
                )
                self._print(f"  → {verdict} (confidence: {assessment.confidence:.0%})")
                # Print first 200 chars of assessment
                preview = assessment.assessment[:200].replace("\n", " ")
                self._print(f"     {preview}...")

            rounds_completed = round_num

            # Check consensus
            consensus, consensus_value = self._check_consensus(round_assessments)

            if consensus:
                verdict_str = "APPROVED" if consensus_value else "REJECTED"
                self._print(f"\n✓ CONSENSUS REACHED in round {round_num}: {verdict_str}")
                break
            else:
                # Count votes
                feasible_count = sum(1 for a in round_assessments if a.feasible is True)
                infeasible_count = sum(1 for a in round_assessments if a.feasible is False)
                uncertain_count = sum(1 for a in round_assessments if a.feasible is None)
                self._print(
                    f"\n  No consensus: {feasible_count} feasible, "
                    f"{infeasible_count} infeasible, {uncertain_count} uncertain"
                )

                if round_num < MAX_ROUNDS:
                    self._print("  Synthesizing for next round...")
                    synthesis_context = self._synthesize_round(round_assessments, round_num)
                    self._print(f"  Synthesis: {synthesis_context[:200]}...")
                else:
                    self._print(f"\n  Max rounds reached — proceeding to final decision")

        self._print(f"\n{'='*60}")
        self._print("BUILDING FINAL TRANSFER DECISION")
        self._print(f"{'='*60}")

        decision = self._build_final_decision(
            self.all_assessments, rounds_completed, override_used
        )
        return decision
