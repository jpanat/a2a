from moltbook.a2a.schema import AgentCard, AgentSkill, Message, Task, TaskState, TaskStatus, TextPart


def test_message_text_joins_parts():
    msg = Message(role="user", parts=[TextPart(text="hello"), TextPart(text="world")])
    assert msg.text == "hello\nworld"


def test_task_final_text_from_status_message():
    reply = Message(role="agent", parts=[TextPart(text="done")])
    task = Task(status=TaskStatus(state=TaskState.COMPLETED, message=reply))
    assert task.final_text == "done"


def test_task_final_text_empty_without_message():
    task = Task(status=TaskStatus(state=TaskState.WORKING))
    assert task.final_text == ""


def test_agent_card_roundtrip():
    card = AgentCard(
        name="Researcher",
        description="desc",
        url="http://x/agents/researcher",
        skills=[AgentSkill(id="research", name="Research", description="d", tags=["research"])],
    )
    dumped = card.model_dump()
    assert AgentCard.model_validate(dumped) == card
