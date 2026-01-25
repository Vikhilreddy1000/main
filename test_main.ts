import pytest
from fastapi.testclient import TestClient
from unittest.mock import AsyncMock, MagicMock

from src.main import app  # adjust import

@pytest.fixture
def client():
    return TestClient(app)

@pytest.fixture
def mock_job_service(monkeypatch):
    service = AsyncMock()
    monkeypatch.setattr("src.services.job_service", service)
    return service

@pytest.fixture
def mock_auth(monkeypatch):
    monkeypatch.setattr(
        "src.auth.auth_service.get_current_user",
        lambda: {"id": "test-user"}
    )


def test_status_display_completed():
    from src.utils.status import _bdd_test_generation_status_display

    result = _bdd_test_generation_status_display("COMPLETED", "job-1")
    assert result["status_display"] == "COMPLETED"
def test_status_display_failed():
    from src.utils.status import _bdd_test_generation_status_display

    result = _bdd_test_generation_status_display("FAILED", "job-1")
    assert "FAILED" in result["status_display"]


/generatebdd – success path
def test_generate_bdd_success(client, mock_job_service):
    mock_job_service.create_job.return_value = "job-123"

    response = client.post(
        "/generatebdd",
        json={"specContent": "openapi: 3.0.0"}
    )

    assert response.status_code == 200
    assert response.json()["job_id"] == "job-123"

/generatebdd – service not initialized
def test_generate_bdd_service_not_initialized(client, monkeypatch):
    monkeypatch.setattr("src.api.job_service", None)

    response = client.post("/generatebdd", json={})

    assert response.status_code == 503

4️⃣ Tests for background job execution
generate_bdd_scenarios_job
import pytest

@pytest.mark.asyncio
async def test_generate_bdd_job_success(monkeypatch):
    from src.jobs.generate_bdd import generate_bdd_scenarios_job

    job_service = AsyncMock()
    job_service.start_job.return_value = None
    job_service.update_job_progress.return_value = None
    job_service.complete_job.return_value = None

    result = await generate_bdd_scenarios_job(
        job_id="job-1",
        files=[],
        specContent="spec",
        job_service=job_service
    )

    assert result is not None
    job_service.complete_job.assert_called_once()

Failure path
@pytest.mark.asyncio
async def test_generate_bdd_job_failure(monkeypatch):
    from src.jobs.generate_bdd import generate_bdd_scenarios_job

    job_service = AsyncMock()
    job_service.start_job.side_effect = Exception("boom")

    with pytest.raises(Exception):
        await generate_bdd_scenarios_job(
            job_id="job-1",
            files=[],
            specContent="spec",
            job_service=job_service
        )

5️⃣ Tests for status endpoint
/generatebdd/status
def test_get_job_status_completed(client, mock_job_service):
    mock_job_service.get_job_status.return_value = {
        "status": "COMPLETED",
        "result": {"feature_text": "Feature: test"}
    }

    response = client.post(
        "/generatebdd/status",
        json={"job_id": "job-1"}
    )

    assert response.status_code == 200
    assert response.json()["status"] == "COMPLETED"

Job not found
def test_get_job_status_not_found(client, mock_job_service):
    mock_job_service.get_job_status.return_value = None

    response = client.post(
        "/generatebdd/status",
        json={"job_id": "missing"}
    )

    assert response.status_code == 404

6️⃣ Tests for cancel job
Successful cancel
@pytest.mark.asyncio
async def test_cancel_job_success(client, mock_job_service):
    mock_job_service.cancel_job.return_value = True

    response = client.post(
        "/generatebdd/cancel",
        json={"job_id": "job-1"}
    )

    assert response.status_code == 200
    assert response.json()["status"] == "CANCELLED"

Already completed job
def test_cancel_completed_job(client, mock_job_service):
    mock_job_service.get_job_status.return_value = {"status": "COMPLETED"}

    response = client.post(
        "/generatebdd/cancel",
        json={"job_id": "job-1"}
    )

    assert response.status_code == 409

7️⃣ Tests for error handlers
Validation error
def test_validation_error(client):
    response = client.post("/generatebdd", json={})
    assert response.status_code == 422

Internal server error
def test_internal_error(client, monkeypatch):
    def boom(*args, **kwargs):
        raise RuntimeError("fail")

    monkeypatch.setattr("src.api.generate_bdd", boom)

    response = client.post("/generatebdd", json={"specContent": "x"})
    assert response.status_code == 500
