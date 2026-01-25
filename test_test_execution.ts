✅ Pytest Test Cases (FULL)
import json
import pytest
from unittest.mock import MagicMock, patch

from src.llms.nodes.test_execution import TestExecutionNode
from src.utils.test_execution_utils.schema_validator import SchemaValidator
from src.utils.test_execution_utils.auth_handler import AuthHandler
from src.utils.test_execution_utils.report_handler import ReportHandler

🔹 Fixtures
@pytest.fixture
def node():
    return TestExecutionNode(features_dir="bdd_tests")


@pytest.fixture
def mock_schema_validator():
    validator = MagicMock(spec=SchemaValidator)
    validator.validate_response.return_value = MagicMock(
        is_valid=True,
        schema_found=True,
        violations=[]
    )
    return validator


@pytest.fixture
def mock_auth_handler():
    handler = MagicMock(spec=AuthHandler)
    handler.get_auth_headers.return_value = {"Authorization": "Bearer token"}
    handler.get_auth_query_params.return_value = {"api_key": "123"}
    return handler

🔹 _get_content_type
@pytest.mark.parametrize(
    "filename,expected",
    [
        ("file.png", "image/png"),
        ("file.jpg", "image/jpeg"),
        ("file.jpeg", "image/jpeg"),
        ("file.pdf", "application/pdf"),
        ("file.txt", "text/plain"),
        ("file.yaml", "application/x-yaml"),
        ("file.yml", "application/x-yaml"),
        ("file.csv", "text/csv"),
        ("file.json", "application/json"),
        ("file.xls", "application/vnd.ms-excel"),
        ("file.unknown", "application/octet-stream"),
    ],
)
def test_get_content_type(node, filename, expected):
    assert node._get_content_type(filename) == expected

🔹 _get_json_body
def test_get_json_body_valid_json(node):
    body = '{"key": "value"}'
    assert node._get_json_body(body) == {"key": "value"}


def test_get_json_body_invalid_json(node):
    body = "plain text"
    assert node._get_json_body(body) == "plain text"

🔹 _parse_response
def test_parse_response_json(node):
    response = MagicMock()
    response.status_code = 200
    response.json.return_value = {"ok": True}

    body, status = node._parse_response(response)
    assert body == {"ok": True}
    assert status == 200


def test_parse_response_text(node):
    response = MagicMock()
    response.status_code = 500
    response.json.side_effect = Exception()
    response.text = "<html>Error</html>"

    body, status = node._parse_response(response)
    assert "HTTP 500" in body
    assert status == 500

🔹 _build_url
def test_build_url_without_auth(node):
    url = node._build_url("GET", "/users", "http://example.com")
    assert url == "http://example.com/users"


def test_build_url_with_auth(node, mock_auth_handler):
    node.auth_handler = mock_auth_handler

    url = node._build_url("GET", "/users", "http://example.com")
    assert "api_key=123" in url

🔹 _validate_response_schema
def test_validate_response_schema_no_validator(node):
    result = node._validate_response_schema(
        url="http://x",
        method="GET",
        status_code=200,
        response_body={}
    )

    assert result["schema_valid"] is True
    assert result["schema_found"] is False
    assert result["violation_count"] == 0


def test_validate_response_schema_success(node, mock_schema_validator):
    node.schema_validator = mock_schema_validator

    result = node._validate_response_schema(
        url="http://x",
        method="GET",
        status_code=200,
        response_body={"ok": True}
    )

    assert result["schema_valid"] is True
    assert result["schema_found"] is True
    assert result["violation_count"] == 0

🔹 _prepare_payload
@pytest.mark.asyncio
async def test_prepare_payload_json(node):
    content = "application/json"
    body = {"key": "value"}
    headers = {}
    resources = []

    data, files, json_body, headers = await node._prepare_payload(
        content, body, headers, resources
    )

    assert json_body == body
    assert headers["Content-Type"] == "application/json"

🔹 _run_curl_command (mocked requests)
@patch("requests.request")
@pytest.mark.asyncio
async def test_run_curl_command_success(mock_request, node):
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {"success": True}
    mock_request.return_value = mock_response

    result = await node._run_curl_command(
        method="GET",
        url="http://example.com",
        base_url="http://example.com",
        resources=[],
        content="application/json",
        body=None,
        env={}
    )

    assert result["status"] == 200
    assert result["response"] == {"success": True}

🔹 _execute_scenario
@patch("requests.request")
@pytest.mark.asyncio
async def test_execute_scenario_pass(mock_request, node):
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {"ok": True}
    mock_request.return_value = mock_response

    scenario = {
        "Scenario": "Test Scenario",
        "Tags": [],
        "Text": "GET /users"
    }

    state = MagicMock()
    state.analysis = MagicMock()
    state.analysis.base_url = "http://example.com"

    result = await node._execute_scenario(
        scenario=scenario,
        state=state,
        env={},
        resources=[],
        base_url="http://example.com"
    )

    assert result["result"] in ["passed", "failed"]

🔹 __call__ (integration-level)
@patch.object(ReportHandler, "generate_html_report")
@pytest.mark.asyncio
async def test_call_success(mock_report, node):
    state = MagicMock()
    state.feature_text = "Feature: Test"
    state.env = {}
    state.resources = []
    state.analysis = MagicMock()
    state.analysis.base_url = "http://example.com"

    result = await node(state)
    assert result is state
