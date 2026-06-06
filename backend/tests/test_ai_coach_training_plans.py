from types import SimpleNamespace

from app.models.ai_conversation import AiConversation
from app.models.ai_message import AiMessage
from app.models.ai_provider_config import AiProviderConfig
from app.models.training_plan import TrainingPlan
from app.services import ai_service
from app.services.ai_service import _parse_ai_plan_content
from app.schemas.training_plans import TrainingPlanCreate
from app.services.ai_config_service import encrypt_api_key
from app.services.training_plan_service import create_training_plan


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _provider(user_id: int, is_active: bool = True) -> AiProviderConfig:
    return AiProviderConfig(
        user_id=user_id,
        provider_type="openai-compatible",
        base_url="https://example.test/v1",
        model_name="test-model",
        api_key_encrypted=encrypt_api_key("test-key"),
        is_active=is_active,
    )


def test_generate_training_plan_requires_current_user_provider_config(
    client, db_session, create_user_and_token, monkeypatch
):
    monkeypatch.setenv("SMART_GYM_AI_FAKE_RESPONSES", "true")
    other_user, _ = create_user_and_token("other-ai@example.com")
    _, token = create_user_and_token("current-ai@example.com")
    db_session.add(_provider(other_user.id))
    db_session.commit()

    response = client.post(
        "/api/ai-coach/training-plans/generate",
        headers=_auth(token),
        json={"prompt": "帮我生成力量训练课表"},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "AI provider config not found"
    assert db_session.query(TrainingPlan).count() == 0


def test_generate_training_plan_creates_plan_conversation_and_messages(
    client, db_session, create_user_and_token, monkeypatch
):
    monkeypatch.setenv("SMART_GYM_AI_FAKE_RESPONSES", "true")
    user, token = create_user_and_token("generate-ai@example.com")
    db_session.add(_provider(user.id))
    db_session.commit()

    response = client.post(
        "/api/ai-coach/training-plans/generate",
        headers=_auth(token),
        json={"prompt": "帮我生成力量训练课表", "title": "AI 力量课表"},
    )

    assert response.status_code == 201
    data = response.json()
    assert data["plan"]["title"] == "AI 力量课表"
    assert data["plan"]["source"] == "ai"
    assert data["plan"]["current_version"] == 1
    assert len(data["plan"]["items"]) == 3
    assert db_session.query(AiConversation).count() == 1
    assert db_session.query(AiMessage).count() == 2


def test_generate_training_plan_accepts_underscore_openai_compatible_provider(
    client, db_session, create_user_and_token, monkeypatch
):
    monkeypatch.setenv("SMART_GYM_AI_FAKE_RESPONSES", "true")
    user, token = create_user_and_token("underscore-provider@example.com")
    config = _provider(user.id)
    config.provider_type = "openai_compatible"
    db_session.add(config)
    db_session.commit()

    response = client.post(
        "/api/ai-coach/training-plans/generate",
        headers=_auth(token),
        json={"prompt": "帮我生成力量训练课表"},
    )

    assert response.status_code == 201
    assert response.json()["plan"]["source"] == "ai"


def test_ai_plan_parser_normalizes_common_provider_json_shapes():
    title, items = _parse_ai_plan_content(
        """
        ```json
        {
          "title": "Provider plan",
          "items": [
            {
              "day_of_week": "Monday",
              "sort_order": 0,
              "title": "Squat",
              "sets": "4",
              "reps": "10-12",
              "duration_minutes": null,
              "notes": "Controlled tempo"
            }
          ]
        }
        ```
        """
    )

    assert title == "Provider plan"
    assert items[0].day_of_week == 1
    assert items[0].reps == 10


def test_ai_plan_parser_accepts_date_only_items_and_zero_empty_fields():
    title, items = _parse_ai_plan_content(
        """
        {
          "title": "Date plan",
          "items": [
            {
              "scheduled_date": "2026年6月8日",
              "sort_order": 0,
              "title": "上肢训练",
              "sets": 0,
              "reps": "12次",
              "duration_minutes": 0,
              "exercise_id": 0,
              "workout_mode_id": 0,
              "notes": ["保持肩胛稳定"]
            }
          ]
        }
        """
    )

    assert title == "Date plan"
    assert items[0].scheduled_date.isoformat() == "2026-06-08"
    assert items[0].day_of_week == 1
    assert items[0].sets is None
    assert items[0].duration_minutes is None
    assert items[0].exercise_id is None
    assert items[0].notes == '["保持肩胛稳定"]'


def test_openai_compatible_provider_uses_openai_sdk(monkeypatch):
    config = _provider(user_id=1)
    captured: dict[str, object] = {}

    class FakeCompletions:
        def create(self, **kwargs):
            captured["create"] = kwargs
            return SimpleNamespace(
                choices=[
                    SimpleNamespace(
                        message=SimpleNamespace(
                            content=(
                                '{"title":"SDK plan","items":[{"day_of_week":1,'
                                '"sort_order":0,"title":"深蹲","sets":4,"reps":8}]}'
                            )
                        )
                    )
                ]
            )

    class FakeOpenAI:
        def __init__(self, **kwargs):
            captured["client"] = kwargs
            self.chat = SimpleNamespace(
                completions=FakeCompletions(),
            )

    monkeypatch.setattr(ai_service, "OpenAI", FakeOpenAI)

    title, items = ai_service._call_openai_compatible(config, "生成力量课表")

    assert title == "SDK plan"
    assert items[0].title == "深蹲"
    assert captured["client"]["base_url"] == "https://example.test/v1"
    assert captured["client"]["api_key"] == "test-key"
    assert captured["create"]["model"] == "test-model"
    assert captured["create"]["messages"][1]["content"] == "生成力量课表"


def test_ollama_provider_uses_ollama_sdk(monkeypatch):
    config = _provider(user_id=1)
    config.provider_type = "ollama"
    config.base_url = "http://ollama.test:11434"
    captured: dict[str, object] = {}

    class FakeOllamaClient:
        def __init__(self, **kwargs):
            captured["client"] = kwargs

        def chat(self, **kwargs):
            captured["chat"] = kwargs
            return SimpleNamespace(
                message=SimpleNamespace(
                    content=(
                        '{"title":"Ollama plan","items":[{"day_of_week":3,'
                        '"sort_order":0,"title":"有氧","duration_minutes":30}]}'
                    )
                )
            )

    monkeypatch.setattr(ai_service, "OllamaClient", FakeOllamaClient)

    title, items = ai_service._call_ollama(config, "生成恢复课表")

    assert title == "Ollama plan"
    assert items[0].duration_minutes == 30
    assert captured["client"] == {"host": "http://ollama.test:11434", "timeout": 60.0}
    assert captured["chat"]["model"] == "test-model"
    assert captured["chat"]["messages"][1]["content"] == "生成恢复课表"


def test_adjust_training_plan_creates_new_version_and_appends_messages(
    client, db_session, create_user_and_token, monkeypatch
):
    monkeypatch.setenv("SMART_GYM_AI_FAKE_RESPONSES", "true")
    user, token = create_user_and_token("adjust-ai@example.com")
    db_session.add(_provider(user.id))
    db_session.commit()
    plan = create_training_plan(
        db_session,
        user.id,
        TrainingPlanCreate(
            title="手动课表",
            items=[
                {
                    "day_of_week": 1,
                    "sort_order": 0,
                    "exercise_id": None,
                    "workout_mode_id": None,
                    "title": "深蹲",
                    "sets": 3,
                    "reps": 12,
                    "duration_minutes": None,
                    "notes": None,
                }
            ],
        ),
    )

    response = client.post(
        f"/api/ai-coach/training-plans/{plan.id}/adjust",
        headers=_auth(token),
        json={"message": "增加有氧恢复"},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["plan"]["current_version"] == 2
    assert data["plan"]["versions"][0]["source"] == "ai"
    assert db_session.query(AiConversation).count() == 1
    assert db_session.query(AiMessage).count() == 2


def test_adjust_training_plan_with_target_date_preserves_items_outside_window(
    client, db_session, create_user_and_token, monkeypatch
):
    monkeypatch.setenv("SMART_GYM_AI_FAKE_RESPONSES", "true")
    user, token = create_user_and_token("target-date-ai@example.com")
    db_session.add(_provider(user.id))
    db_session.commit()
    plan = create_training_plan(
        db_session,
        user.id,
        TrainingPlanCreate(
            title="日期课表",
            items=[
                {
                    "scheduled_date": "2026-06-08",
                    "day_of_week": 1,
                    "sort_order": 0,
                    "exercise_id": None,
                    "workout_mode_id": None,
                    "title": "窗口内旧计划",
                    "sets": 3,
                    "reps": 12,
                    "duration_minutes": None,
                    "notes": None,
                },
                {
                    "scheduled_date": "2026-06-20",
                    "day_of_week": 6,
                    "sort_order": 0,
                    "exercise_id": None,
                    "workout_mode_id": None,
                    "title": "窗口外保留",
                    "sets": None,
                    "reps": None,
                    "duration_minutes": 40,
                    "notes": None,
                },
            ],
        ),
    )

    response = client.post(
        f"/api/ai-coach/training-plans/{plan.id}/adjust",
        headers=_auth(token),
        json={"message": "调整目标日期训练", "target_date": "2026-06-08"},
    )

    assert response.status_code == 200
    items = response.json()["plan"]["items"]
    assert any(item["title"] == "窗口外保留" for item in items)
    assert any(item["scheduled_date"] == "2026-06-08" for item in items)


def test_adjust_training_plan_rejects_cross_user_access(
    client, db_session, create_user_and_token, monkeypatch
):
    monkeypatch.setenv("SMART_GYM_AI_FAKE_RESPONSES", "true")
    owner, _ = create_user_and_token("owner-adjust-ai@example.com")
    viewer, viewer_token = create_user_and_token("viewer-adjust-ai@example.com")
    db_session.add(_provider(viewer.id))
    db_session.commit()
    plan = create_training_plan(
        db_session,
        owner.id,
        TrainingPlanCreate(
            title="私有课表",
            items=[
                {
                    "day_of_week": 1,
                    "sort_order": 0,
                    "exercise_id": None,
                    "workout_mode_id": None,
                    "title": "深蹲",
                    "sets": 3,
                    "reps": 12,
                    "duration_minutes": None,
                    "notes": None,
                }
            ],
        ),
    )

    response = client.post(
        f"/api/ai-coach/training-plans/{plan.id}/adjust",
        headers=_auth(viewer_token),
        json={"message": "越权调整"},
    )

    assert response.status_code == 404
