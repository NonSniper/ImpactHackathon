import os
import tempfile

# Set before importing the application, which creates its engine at import time.
test_db = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
test_db.close()
os.environ["DATABASE_URL"] = f"sqlite:///{test_db.name}"

from fastapi.testclient import TestClient
from app.database import Base, engine
from app.main import app


def test_task_lifecycle():
    Base.metadata.create_all(engine)
    try:
        with TestClient(app) as client:
            assert client.get("/api/health").json() == {"status": "ok"}
            assert client.get("/api/tasks").json() == []
            assert client.post("/api/tasks", json={"title": "   "}).status_code == 422
            created = client.post("/api/tasks", json={"title": "  First task  "})
            assert created.status_code == 201
            task = created.json()
            assert task["title"] == "First task"
            assert task["completed"] is False
            updated = client.patch(f"/api/tasks/{task['id']}", json={"completed": True})
            assert updated.json()["completed"] is True
            assert len(client.get("/api/tasks").json()) == 1
            assert client.delete(f"/api/tasks/{task['id']}").status_code == 204
            assert client.get("/api/tasks").json() == []
            assert client.delete(f"/api/tasks/{task['id']}").status_code == 404
    finally:
        Base.metadata.drop_all(engine)
        engine.dispose()
        os.unlink(test_db.name)
