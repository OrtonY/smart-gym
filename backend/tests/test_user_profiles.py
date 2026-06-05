from __future__ import annotations


def test_user_can_only_read_own_profile(client, create_user_and_token):
    user_a, token_a = create_user_and_token("a@example.com")
    user_b, token_b = create_user_and_token("b@example.com")

    response = client.put(
        "/api/users/me/profile",
        headers={"Authorization": f"Bearer {token_a}"},
        json={"height_cm": 180, "weight_kg": 75, "fitness_goal": "增肌"},
    )
    assert response.status_code == 200

    updated_response = client.put(
        "/api/users/me/profile",
        headers={"Authorization": f"Bearer {token_a}"},
        json={"height_cm": 181, "weight_kg": 74, "fitness_goal": "减脂"},
    )
    assert updated_response.status_code == 200

    own = client.get(
        "/api/users/me/profile",
        headers={"Authorization": f"Bearer {token_a}"},
    )
    other = client.get(
        "/api/users/me/profile",
        headers={"Authorization": f"Bearer {token_b}"},
    )

    assert own.json()["height_cm"] == 181
    assert own.json()["weight_kg"] == 74
    assert own.json()["fitness_goal"] == "减脂"
    assert other.json() == {}
