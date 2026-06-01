"""
Base Agent

Provides the BaseAgent class that all specialist agents inherit from.
Each agent has a role, a local ontology, and a reason() method that
calls Claude with tool use to produce a structured assessment.
"""

from __future__ import annotations
import json
from typing import Any, Optional
import anthropic

MODEL = "claude-haiku-4-5-20251001"


class BaseAgent:
    """
    Base class for all hospital transfer coordination agents.

    Subclasses override:
      - role: str — the agent's role name (matches policy.py keys)
      - local_ontology: dict[str, str] — term definitions local to this agent
      - tools: list[dict] — Claude tool definitions specific to this agent
      - handle_tool_call(name, inputs) -> Any — mock tool implementations
      - system_prompt: str — role-specific system prompt
    """

    role: str = "base"
    local_ontology: dict[str, str] = {}
    tools: list[dict] = []
    system_prompt: str = "You are a hospital transfer coordination agent."

    def __init__(self):
        self.client = anthropic.Anthropic()
        self._last_raw_response: Optional[str] = None

    def handle_tool_call(self, name: str, inputs: dict) -> Any:
        """Override in subclasses to implement mock tool logic."""
        return {"error": f"Tool '{name}' not implemented in {self.__class__.__name__}"}

    def reason(
        self,
        context_summary: str,
        shared_ontology: dict[str, str],
        additional_context: str = "",
    ) -> dict[str, Any]:
        """
        Call Claude with the agent's tools to produce a structured assessment.

        Returns a dict with at minimum:
          - feasible: bool | None
          - assessment: str
          - details: dict
          - confidence: float (0-1)
        """
        ontology_text = "\n".join(
            f"  {term}: {defn}" for term, defn in shared_ontology.items()
        )

        extra_section = ("ADDITIONAL CONTEXT:\n" + additional_context) if additional_context else ""
        user_message = f"""You are evaluating a hospital patient transfer request.

SHARED OPERATIONAL DEFINITIONS (use these precisely):
{ontology_text}

PATIENT CONTEXT (your authorized view):
{context_summary}

{extra_section}

Use your available tools to gather the information you need, then provide your assessment.
Your assessment must include:
1. Whether transfer is FEASIBLE from your domain's perspective (yes/no/conditional)
2. Key findings from your domain
3. Any blockers or concerns
4. Your confidence level (0-1)

Be specific and operational. Reference the shared definitions when using key terms."""

        messages = [{"role": "user", "content": user_message}]

        # Agentic tool-use loop
        max_tool_rounds = 4
        for _ in range(max_tool_rounds):
            try:
                response = self.client.messages.create(
                    model=MODEL,
                    max_tokens=1024,
                    system=self.system_prompt,
                    tools=self.tools if self.tools else anthropic.NOT_GIVEN,
                    messages=messages,
                )
            except anthropic.APIError as e:
                return {
                    "feasible": None,
                    "assessment": f"API error: {e}",
                    "details": {},
                    "confidence": 0.0,
                    "role": self.role,
                }

            # Append assistant response
            messages.append({"role": "assistant", "content": response.content})

            # Check stop reason
            if response.stop_reason == "end_turn":
                # Extract text from final response
                final_text = ""
                for block in response.content:
                    if hasattr(block, "text"):
                        final_text += block.text

                self._last_raw_response = final_text
                return self._parse_assessment(final_text)

            elif response.stop_reason == "tool_use":
                # Process all tool calls
                tool_results = []
                for block in response.content:
                    if block.type == "tool_use":
                        result = self.handle_tool_call(block.name, block.input)
                        tool_results.append({
                            "type": "tool_result",
                            "tool_use_id": block.id,
                            "content": json.dumps(result),
                        })

                if tool_results:
                    messages.append({"role": "user", "content": tool_results})
            else:
                # Unexpected stop reason — try to extract any text
                break

        # Fallback if loop exhausted
        return {
            "feasible": None,
            "assessment": "Assessment incomplete — max tool rounds reached",
            "details": {},
            "confidence": 0.0,
            "role": self.role,
        }

    def _parse_assessment(self, text: str) -> dict[str, Any]:
        """
        Parse the agent's free-text response into a structured assessment dict.
        Looks for keywords to determine feasibility and confidence.
        """
        lower = text.lower()

        # Determine feasibility
        feasible: Optional[bool] = None
        if any(w in lower for w in ["not feasible", "infeasible", "cannot", "unable", "blocked", "deny", "denied"]):
            feasible = False
        elif any(w in lower for w in ["feasible", "approved", "confirmed", "ready", "available", "can proceed"]):
            feasible = True

        # Extract confidence — look for "confidence: 0.X" or "X%" patterns
        confidence = 0.75  # default
        import re
        conf_match = re.search(r"confidence[:\s]+([0-9.]+)", lower)
        if conf_match:
            try:
                confidence = float(conf_match.group(1))
                if confidence > 1.0:
                    confidence /= 100.0
            except ValueError:
                pass

        return {
            "feasible": feasible,
            "assessment": text.strip(),
            "details": {},
            "confidence": confidence,
            "role": self.role,
        }
