import pytest

from app.core.storage import get_storage_path


def test_storage_path_stays_inside_backend_storage(tmp_path, monkeypatch):
    monkeypatch.setenv("LOCAL_STORAGE_DIR", str(tmp_path))

    path = get_storage_path("tutorials/demo.png")

    assert str(path).startswith(str(tmp_path))


def test_storage_path_rejects_parent_traversal(tmp_path, monkeypatch):
    monkeypatch.setenv("LOCAL_STORAGE_DIR", str(tmp_path))

    with pytest.raises(ValueError):
        get_storage_path("../outside.png")
