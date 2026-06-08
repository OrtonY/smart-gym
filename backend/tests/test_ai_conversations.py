from app.models.ai_conversation import AiConversation
from app.models.ai_message import AiMessage
from app.services.ai_conversation_service import (
    get_user_conversation,
    list_conversation_messages,
)


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_list_ai_conversations_filters_by_user_and_topic(
    client, db_session, create_user_and_token
):
    owner, owner_token = create_user_and_token("conversation-owner@example.com")
    other, _ = create_user_and_token("conversation-other@example.com")
    owner_training = AiConversation(
        user_id=owner.id,
        topic="training_plan",
        training_plan_id=10,
    )
    owner_food = AiConversation(user_id=owner.id, topic="food_record")
    other_training = AiConversation(
        user_id=other.id,
        topic="training_plan",
        training_plan_id=10,
    )
    db_session.add_all([owner_training, owner_food, other_training])
    db_session.flush()
    db_session.add_all(
        [
            AiMessage(
                conversation_id=owner_training.id,
                role="user",
                content="生成训练计划",
            ),
            AiMessage(
                conversation_id=owner_food.id,
                role="user",
                content="识别午餐",
            ),
            AiMessage(
                conversation_id=other_training.id,
                role="user",
                content="其他用户",
            ),
        ]
    )
    db_session.commit()

    response = client.get(
        "/api/ai-conversations?topic=training_plan&training_plan_id=10",
        headers=_auth(owner_token),
    )

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["id"] == owner_training.id
    assert data[0]["topic"] == "training_plan"
    assert data[0]["last_message_preview"] == "生成训练计划"


def test_get_ai_conversation_returns_ordered_messages_and_rejects_other_user(
    client, db_session, create_user_and_token
):
    owner, owner_token = create_user_and_token("conversation-detail-owner@example.com")
    _, other_token = create_user_and_token("conversation-detail-other@example.com")
    conversation = AiConversation(user_id=owner.id, topic="food_record")
    db_session.add(conversation)
    db_session.flush()
    db_session.add_all(
        [
            AiMessage(conversation_id=conversation.id, role="user", content="第一句"),
            AiMessage(conversation_id=conversation.id, role="assistant", content="回复"),
        ]
    )
    db_session.commit()

    owner_response = client.get(
        f"/api/ai-conversations/{conversation.id}",
        headers=_auth(owner_token),
    )
    other_response = client.get(
        f"/api/ai-conversations/{conversation.id}",
        headers=_auth(other_token),
    )

    assert owner_response.status_code == 200
    assert [message["content"] for message in owner_response.json()["messages"]] == [
        "第一句",
        "回复",
    ]
    assert other_response.status_code == 404


def test_get_user_conversation_enforces_user_and_plan_scope(
    db_session, create_user_and_token
):
    owner, _ = create_user_and_token("conversation-service-owner@example.com")
    other, _ = create_user_and_token("conversation-service-other@example.com")
    owner_training = AiConversation(
        user_id=owner.id,
        topic="training_plan",
        training_plan_id=10,
    )
    owner_nutrition = AiConversation(
        user_id=owner.id,
        topic="nutrition_plan",
        nutrition_plan_id=20,
    )
    other_training = AiConversation(
        user_id=other.id,
        topic="training_plan",
        training_plan_id=10,
    )
    db_session.add_all([owner_training, owner_nutrition, other_training])
    db_session.commit()

    assert (
        get_user_conversation(
            db_session,
            owner.id,
            owner_training.id,
            "training_plan",
            training_plan_id=10,
        )
        == owner_training
    )
    assert (
        get_user_conversation(
            db_session,
            owner.id,
            owner_training.id,
            "training_plan",
            training_plan_id=11,
        )
        is None
    )
    assert (
        get_user_conversation(
            db_session,
            owner.id,
            owner_nutrition.id,
            "nutrition_plan",
            nutrition_plan_id=20,
        )
        == owner_nutrition
    )
    assert (
        get_user_conversation(
            db_session,
            owner.id,
            owner_nutrition.id,
            "training_plan",
            nutrition_plan_id=20,
        )
        is None
    )
    assert (
        get_user_conversation(
            db_session,
            other.id,
            owner_training.id,
            "training_plan",
            training_plan_id=10,
        )
        is None
    )


def test_list_conversation_messages_can_enforce_ownership(db_session, create_user_and_token):
    owner, _ = create_user_and_token("conversation-messages-owner@example.com")
    other, _ = create_user_and_token("conversation-messages-other@example.com")
    conversation = AiConversation(user_id=owner.id, topic="food_record")
    db_session.add(conversation)
    db_session.flush()
    db_session.add_all(
        [
            AiMessage(conversation_id=conversation.id, role="user", content="第一条"),
            AiMessage(conversation_id=conversation.id, role="assistant", content="第二条"),
        ]
    )
    db_session.commit()

    assert [message.content for message in list_conversation_messages(db_session, conversation.id)] == [
        "第一条",
        "第二条",
    ]
    assert [
        message.content
        for message in list_conversation_messages(
            db_session, conversation.id, user_id=owner.id
        )
    ] == ["第一条", "第二条"]
    assert list_conversation_messages(db_session, conversation.id, user_id=other.id) == []
