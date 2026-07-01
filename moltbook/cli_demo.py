"""Runnable demo: spins up the A2A gateway for all agents, creates a Moltbook
space (mocked Webex by default, real Webex if WEBEX_* env vars are set), has
two humans post entries, and prints the resulting Webex transcript plus the
Moltbook entry/comment threads.

Run with:  python -m moltbook.cli_demo
"""
from __future__ import annotations

import asyncio

import uvicorn

from moltbook.a2a.server import build_app
from moltbook.agents.registry import build_agents
from moltbook.core import Moltbook, MoltbookEntry
from moltbook.webex.factory import build_webex_client

HOST = "127.0.0.1"
PORT = 8000
BASE_URL = f"http://{HOST}:{PORT}"


async def _run_server(app) -> tuple[uvicorn.Server, asyncio.Task]:
    config = uvicorn.Config(app, host=HOST, port=PORT, log_level="warning")
    server = uvicorn.Server(config)
    task = asyncio.create_task(server.serve())
    while not server.started:
        await asyncio.sleep(0.05)
    return server, task


def _print_transcript(title: str, messages) -> None:
    print(f"\n=== Webex Space: {title} ===")
    for m in messages:
        tag = "\U0001F916" if m.is_bot else "\U0001F9D1"
        print(f"{tag} {m.author}: {m.text}")


def _print_entry(entry: MoltbookEntry) -> None:
    print(f"\n--- Moltbook entry by {entry.author}: {entry.text}")
    for c in entry.comments:
        print(f"    ↳ {c.author}: {c.text}")


async def main() -> None:
    agents = build_agents(BASE_URL)
    webex = build_webex_client(agents)
    moltbook = Moltbook(webex=webex, agents=agents, a2a_base_url=BASE_URL)

    app = build_app({a.id: a for a in agents}, moltbook.make_ctx)
    server, server_task = await _run_server(app)

    try:
        title = "Moltbook - Team Alpha"
        await moltbook.setup_space(title, humans=["Alice", "Bob"])

        print("Moltbook space is live with agents:", ", ".join(f"{a.avatar} {a.name}" for a in agents))

        entry1 = await moltbook.submit_human_entry(
            "Alice",
            "Can we research the best caching strategy for our API and write a quick Python example?",
        )
        entry2 = await moltbook.submit_human_entry(
            "Bob",
            "At a high level, what's a good caching strategy for a read-heavy API?",
        )

        transcript = await moltbook.webex.transcript(moltbook.space_id)
        _print_transcript(title, transcript)

        _print_entry(entry1)
        _print_entry(entry2)
    finally:
        server.should_exit = True
        await server_task
        await moltbook.aclose()


if __name__ == "__main__":
    asyncio.run(main())
