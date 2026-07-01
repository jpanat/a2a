from __future__ import annotations

import re

from moltbook.a2a.schema import AgentSkill
from moltbook.agents.base import Agent, AgentContext

_STOPWORDS = {
    "the", "and", "for", "that", "with", "have", "this", "from", "your",
    "about", "into", "quick", "some", "high", "level", "good", "what's",
    "please", "can", "could", "would", "should", "we", "our", "a", "an",
}


def _keywords(text: str, limit: int = 5) -> list[str]:
    words = re.findall(r"[a-zA-Z']{5,}", text.lower())
    seen: list[str] = []
    for w in words:
        if w not in _STOPWORDS and w not in seen:
            seen.append(w)
    return seen[:limit]


class ResearcherAgent(Agent):
    id = "researcher"
    name = "Ada (Researcher)"
    avatar = "\U0001F50E"
    description = "Gathers background information and synthesizes findings across agents."
    skills = [
        AgentSkill(
            id="research",
            name="Research",
            description="Look into a topic and summarize findings",
            tags=["research", "find", "summarize", "investigate", "compare", "strategy"],
        ),
    ]

    _CODE_TRIGGERS = ("build", "write a script", "implement", "code", "function", "python")

    async def handle(self, text: str, ctx: AgentContext) -> str:
        findings = self._research(text)
        await ctx.notify(self, findings)

        if not any(kw in text.lower() for kw in self._CODE_TRIGGERS):
            return findings

        code_task = await ctx.call_agent("coder", text, ctx)
        code_snippet = code_task.final_text

        review_task = await ctx.call_agent("reviewer", code_snippet, ctx)
        review_notes = review_task.final_text

        summary = self._synthesize(findings, code_snippet, review_notes)
        await ctx.notify(self, summary)
        return summary

    def _research(self, text: str) -> str:
        keywords = _keywords(text)
        bullets = "\n".join(f"- Explored angle: **{k}**" for k in keywords) or "- Reviewed general background material."
        return (
            f"\U0001F4CB Findings on “{text.strip()}”:\n{bullets}\n"
            "- Recommendation: start with the simplest approach that meets the requirement, "
            "then iterate."
        )

    def _synthesize(self, findings: str, code_snippet: str, review_notes: str) -> str:
        return (
            "✅ Synthesis: combined the research findings with Coder's implementation "
            f"and Reviewer's feedback.\n\n{review_notes}\n\nSee the snippet above for the "
            "proposed implementation."
        )


class CoderAgent(Agent):
    id = "coder"
    name = "Cy (Coder)"
    avatar = "\U0001F4BB"
    description = "Writes small implementation snippets for tasks delegated by other agents."
    skills = [
        AgentSkill(
            id="write-code",
            name="Write code",
            description="Draft an implementation snippet for a task",
            tags=["build", "code", "implement", "script", "python", "function"],
        ),
    ]

    async def handle(self, text: str, ctx: AgentContext) -> str:
        snippet = self._write_snippet(text)
        await ctx.notify(self, snippet)
        return snippet

    def _write_snippet(self, task: str) -> str:
        keywords = _keywords(task, limit=1)
        fn_name = keywords[0] if keywords else "solve"
        return (
            "```python\n"
            f"# {task.strip()}\n"
            f"def {fn_name}():\n"
            "    \"\"\"Prototype implementation -- replace with real logic.\"\"\"\n"
            "    result = None\n"
            "    return result\n"
            "```"
        )


class ReviewerAgent(Agent):
    id = "reviewer"
    name = "Reva (Reviewer)"
    avatar = "✅"
    description = "Reviews code or proposals for quality before they're shared back."
    skills = [
        AgentSkill(
            id="review",
            name="Review",
            description="Review a snippet or proposal and flag issues",
            tags=["review", "check", "audit", "quality"],
        ),
    ]

    async def handle(self, text: str, ctx: AgentContext) -> str:
        notes = self._review(text)
        await ctx.notify(self, notes)
        return notes

    def _review(self, snippet: str) -> str:
        notes = []
        if "def " not in snippet:
            notes.append("No function definition found -- consider wrapping the logic in a function.")
        if '"""' not in snippet:
            notes.append("Missing a docstring.")
        if "test" not in snippet.lower():
            notes.append("No tests included yet -- add unit tests before merging.")

        verdict = "Looks good overall" if len(notes) <= 1 else "Needs a bit more work"
        bullet_notes = "\n".join(f"- {n}" for n in notes) or "- No issues found."
        return f"**Review: {verdict}**\n{bullet_notes}"
