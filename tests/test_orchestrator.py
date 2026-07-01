import httpx
import pytest

from moltbook.a2a.server import build_app
from moltbook.agents.registry import build_agents
from moltbook.core import Moltbook
from moltbook.webex.mock import MockWebexClient

BASE_URL = "http://testserver"


def _build_moltbook() -> Moltbook:
    agents = build_agents(BASE_URL)
    moltbook = Moltbook(webex=MockWebexClient(), agents=agents, a2a_base_url=BASE_URL)
    app = build_app({a.id: a for a in agents}, moltbook.make_ctx)
    moltbook.set_http_client(httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url=BASE_URL))
    return moltbook


@pytest.mark.asyncio
async def test_code_request_delegates_across_all_three_agents():
    moltbook = _build_moltbook()
    await moltbook.setup_space("Test Space", humans=["Alice"])

    entry = await moltbook.submit_human_entry(
        "Alice", "Can we research the best caching strategy for our API and write a quick Python example?"
    )

    authors = [c.author for c in entry.comments]
    assert "Ada (Researcher)" in authors
    assert "Cy (Coder)" in authors
    assert "Reva (Reviewer)" in authors
    # Researcher must go first (routing), Coder before Reviewer (delegation order).
    assert authors.index("Ada (Researcher)") < authors.index("Cy (Coder)") < authors.index("Reva (Reviewer)")

    await moltbook.aclose()


@pytest.mark.asyncio
async def test_simple_question_routes_to_researcher_only():
    moltbook = _build_moltbook()
    await moltbook.setup_space("Test Space", humans=["Bob"])

    entry = await moltbook.submit_human_entry("Bob", "At a high level, what's a good caching strategy?")

    authors = {c.author for c in entry.comments}
    assert authors == {"Ada (Researcher)"}

    await moltbook.aclose()


@pytest.mark.asyncio
async def test_webex_transcript_mirrors_entry_comments():
    moltbook = _build_moltbook()
    await moltbook.setup_space("Test Space", humans=["Alice"])

    entry = await moltbook.submit_human_entry("Alice", "What's a good caching strategy?")
    transcript = await moltbook.webex.transcript(moltbook.space_id)

    assert transcript[0].author == "Alice"
    assert transcript[0].is_bot is False
    assert any(m.author == "Ada (Researcher)" and m.is_bot for m in transcript)
    assert len(transcript) == 1 + len(entry.comments)

    await moltbook.aclose()
