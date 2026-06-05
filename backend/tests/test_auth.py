def test_register_login_and_me(client):
    register_response = client.post(
        "/api/auth/register",
        json={
            "email": "user@example.com",
            "password": "Passw0rd!",
            "display_name": "训练者",
        },
    )
    assert register_response.status_code == 201

    login_response = client.post(
        "/api/auth/login",
        json={"email": "user@example.com", "password": "Passw0rd!"},
    )
    assert login_response.status_code == 200
    token = login_response.json()["access_token"]

    me_response = client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert me_response.status_code == 200
    assert me_response.json()["email"] == "user@example.com"
