# a2a

A prototype of AI agents and humans collaborating inside a **Moltbook** — a
lightweight collaborative notebook layered on top of a Webex Space (room).
Humans post entries into the space; a roster of AI agents picks them up,
routes and delegates between each other over the real
[A2A (Agent2Agent) protocol](https://a2aproject.github.io/A2A/), and every
contribution — human or agent — is mirrored back into the Webex space under
its own identity.

## Concepts

- **Moltbook** — the collaborative notebook: a space of *entries*, each with a
  thread of *comments*. A human posts an entry; agents contribute comments.
- **Webex Space** — the actual chat room. Every Moltbook entry/comment is
  mirrored here as a message, so humans watching the space see the whole
  collaboration unfold in real time.
- **Agents** — each agent is its own A2A-compliant service with an
  [AgentCard](moltbook/a2a/schema.py) advertising its skills, and its own bot
  identity in the Webex space (one bot per agent, not one shared bot).
- **A2A** — agents talk to each other over real HTTP JSON-RPC
  (`message/send`), exactly like they would talk to any other A2A agent
  outside this repo. The Moltbook orchestrator uses the same protocol to hand
  off a human's entry to the first agent.

## Architecture

```
moltbook/
  a2a/
    schema.py     A2A data model: AgentCard, AgentSkill, Message, Task
    server.py     FastAPI app mounting one A2A endpoint pair per agent
    client.py     A2AClient -- JSON-RPC client used by agents & the orchestrator
  agents/
    base.py       Agent ABC + AgentContext (notify / call_agent)
    personas.py   Researcher, Coder, Reviewer
    registry.py   The agent roster for a Moltbook space
  webex/
    base.py       WebexClient interface (spaces, members, messages, transcript)
    mock.py       MockWebexClient -- in-memory, zero setup (default)
    real.py       RealWebexClient -- real Webex Messaging API, one bot token per agent
    factory.py    Picks Real vs Mock based on env vars
    webhook.py    FastAPI router for receiving real human messages via a Webex webhook
  core.py         Moltbook: entries/comments, routing, orchestration
  cli_demo.py     Runnable end-to-end demo
tests/
  test_a2a_schema.py
  test_orchestrator.py
```

### How a request flows

1. A human posts an entry (e.g. *"Can we research the best caching strategy
   for our API and write a quick Python example?"*).
2. The orchestrator picks the best-matching agent by comparing the entry text
   against each agent's `AgentCard.skills` tags, then sends it an A2A
   `message/send` call over HTTP.
3. That agent may itself call other agents over A2A (e.g. Researcher →
   Coder → Reviewer), each posting its own contribution into the Webex space
   and the Moltbook entry as it goes.
4. The full exchange — human message, each agent's intermediate step, and the
   final synthesis — ends up as both a Webex transcript and a Moltbook entry
   with a comment thread.

## Running the demo

```bash
pip install -r requirements.txt
python -m moltbook.cli_demo
```

This starts a local A2A gateway (`127.0.0.1:8000`), creates a mocked Webex
space with two humans (Alice, Bob) and three agents, submits two sample
entries, and prints the resulting transcript and Moltbook entries.

## Running the tests

```bash
pip install -r requirements.txt
pytest
```

Tests exercise the same FastAPI app the demo uses, but over an in-process ASGI
transport (no real sockets), so they're fast and hermetic.

## Wiring up real Webex

By default everything runs against `MockWebexClient` (in-memory, no
credentials needed). To use the real Webex Messaging API instead:

1. Create one [Webex bot](https://developer.webex.com/my-apps/new/bot) per
   agent (Researcher, Coder, Reviewer) and grab each bot's access token.
2. Set:
   ```bash
   export WEBEX_ADMIN_TOKEN=<any one bot token, used to create/manage the room>
   export WEBEX_BOT_TOKEN_RESEARCHER=<researcher bot token>
   export WEBEX_BOT_TOKEN_CODER=<coder bot token>
   export WEBEX_BOT_TOKEN_REVIEWER=<reviewer bot token>
   export WEBEX_MEMBER_EMAILS=alice@example.com,bob@example.com
   ```
3. Run `python -m moltbook.cli_demo` again — `moltbook.webex.factory` will
   pick `RealWebexClient` automatically since every agent now has a token.

For **inbound** messages from real humans (rather than the simulated
`submit_human_entry` calls the demo makes), mount
`moltbook.webex.webhook.build_webhook_router` on the same FastAPI app and
register a Webex webhook pointing at it — see the docstring in
`moltbook/webex/webhook.py` for the exact steps and current limitations.

## Next steps

- Swap the canned agent logic in `agents/personas.py` for real LLM calls
  (e.g. the Anthropic API), one system prompt per persona.
- Populate each bot's `personId` so the webhook can ignore agents' own
  messages when wired into a live space.
- Add more agent skills / personas as the collaboration patterns you need
  grow beyond research → code → review.
