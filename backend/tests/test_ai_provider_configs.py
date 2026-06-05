def test_ai_provider_configs_are_user_isolated(client, create_user_and_token):
    _, token_a = create_user_and_token("a@example.com")
    _, token_b = create_user_and_token("b@example.com")

    create_response = client.post(
        "/api/ai-configs",
        headers={"Authorization": f"Bearer {token_a}"},
        json={
            "provider_type": "openai_compatible",
            "base_url": "https://api.example.com/v1",
            "model_name": "example-model",
            "api_key": "secret-key",
            "is_active": True,
        },
    )
    assert create_response.status_code == 201

    configs_a = client.get(
        "/api/ai-configs", headers={"Authorization": f"Bearer {token_a}"}
    )
    configs_b = client.get(
        "/api/ai-configs", headers={"Authorization": f"Bearer {token_b}"}
    )

    assert len(configs_a.json()) == 1
    assert configs_b.json() == []
    assert "api_key" not in configs_a.json()[0]


def test_ai_provider_config_update_and_delete_are_user_isolated(
    client, create_user_and_token
):
    _, token_a = create_user_and_token("owner@example.com")
    _, token_b = create_user_and_token("other@example.com")

    create_response = client.post(
        "/api/ai-configs",
        headers={"Authorization": f"Bearer {token_a}"},
        json={
            "provider_type": "openai_compatible",
            "base_url": "https://api.example.com/v1",
            "model_name": "example-model",
            "api_key": "secret-key",
            "is_active": True,
        },
    )
    config_id = create_response.json()["id"]

    other_update = client.put(
        f"/api/ai-configs/{config_id}",
        headers={"Authorization": f"Bearer {token_b}"},
        json={"model_name": "other-model"},
    )
    assert other_update.status_code == 404

    owner_update = client.put(
        f"/api/ai-configs/{config_id}",
        headers={"Authorization": f"Bearer {token_a}"},
        json={"model_name": "updated-model"},
    )
    assert owner_update.status_code == 200
    assert owner_update.json()["model_name"] == "updated-model"
    assert "api_key" not in owner_update.json()
    assert "api_key_encrypted" not in owner_update.json()

    other_delete = client.delete(
        f"/api/ai-configs/{config_id}",
        headers={"Authorization": f"Bearer {token_b}"},
    )
    assert other_delete.status_code == 404

    owner_delete = client.delete(
        f"/api/ai-configs/{config_id}",
        headers={"Authorization": f"Bearer {token_a}"},
    )
    assert owner_delete.status_code == 204

    configs_a = client.get(
        "/api/ai-configs", headers={"Authorization": f"Bearer {token_a}"}
    )
    assert configs_a.json() == []
