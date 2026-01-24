import json
import xml.etree.ElementTree as ET
from report_handler import ReportHandler



def test_init_sets_auth_handler(mock_auth_handler):
    handler = ReportHandler(mock_auth_handler)
    assert handler.auth_handler == mock_auth_handler


import pytest

@pytest.mark.parametrize(
    "status,expected",
    [
        (200, "status-success"),
        (201, "status-success"),
        (404, "status-client"),
        (400, "status-client"),
        (500, "status-server"),
        ("N/A", "status-unknown"),
        (None, "status-unknown"),
    ]
)
def test_get_status_class(handler=None, status=None, expected=None):
    handler = ReportHandler(None)
    assert handler.get_status_class_for_html(status) == expected



import pytest

@pytest.mark.parametrize(
    "result,expected_class,expected_label",
    [
        ("passed", "result-badge result-passed", "PASSED"),
        ("failed", "result-badge result-failed", "FAILED"),
        ("N/A", "result-badge", "N/A"),
        (None, "result-badge", "N/A"),
    ]
)
def test_get_result_attributes(result, expected_class, expected_label):
    handler = ReportHandler(None)
    result_class, result_label = handler.get_result_attributes(result)
    assert result_class == expected_class
    assert result_label == expected_label




def test_schema_cell_no_schema():
    handler = ReportHandler(None)
    cell = handler.get_schema_cell_for_html(
        schema_found=False,
        schema_valid=False,
        violations=[]
    )
    assert "No schema" in cell


def test_schema_cell_valid():
    handler = ReportHandler(None)
    cell = handler.get_schema_cell_for_html(
        schema_found=True,
        schema_valid=True,
        violations=[]
    )
    assert "Valid" in cell


def test_schema_cell_invalid_with_violations():
    handler = ReportHandler(None)
    cell = handler.get_schema_cell_for_html(
        schema_found=True,
        schema_valid=False,
        violations=["field missing", "wrong type", "extra"]
    )
    assert "Invalid" in cell
    assert "field missing" in cell



def test_get_responses_for_html(sample_results):
    handler = ReportHandler(None)
    html_rows = handler.get_responses_for_html(0, sample_results[0])

    assert "<tr>" in html_rows
    assert "Get users" in html_rows
    assert "/api/users" in html_rows


from unittest.mock import patch

def test_generate_html_report(sample_results, mock_auth_handler):
    handler = ReportHandler(mock_auth_handler)

    with patch("report_handler.common.calculate_openapi_coverage") as mock_cov:
        mock_cov.return_value = ("80%", ["POST /missing"])

        html = handler.generate_html_report(
            state={},
            data={"results": sample_results}
        )

    assert "API Test Execution Report" in html
    assert "Get users" in html
    assert "Create user" in html
    assert "POST /missing" in html
    assert "Bearer token present" in html



def test_generate_junit_xml_report(sample_results, mock_auth_handler):
    handler = ReportHandler(mock_auth_handler)

    xml_content = handler.generate_junit_xml_report(sample_results)

    assert xml_content is not None
    root = ET.fromstring(xml_content)
    assert root.tag == "testsuite"
    assert int(root.attrib["tests"]) == 2


def test_generate_junit_xml_report_exception(monkeypatch, sample_results):
    handler = ReportHandler(None)

    def broken_tostring(*args, **kwargs):
        raise Exception("boom")

    monkeypatch.setattr(ET, "tostring", broken_tostring)

    result = handler.generate_junit_xml_report(sample_results)
    assert result is None


def test_html_without_auth(sample_results, unauth_auth_handler):
    handler = ReportHandler(unauth_auth_handler)

    html = handler.generate_html_report(
        state={},
        data={"results": sample_results}
    )

    assert "No authentication" in html







Common fixtures & mocks.

import pytest
from unittest.mock import Mock

@pytest.fixture
def mock_auth_handler():
    auth = Mock()
    auth.is_authenticated.return_value = True
    auth.get_auth_summary.return_value = "Bearer token present"
    return auth


@pytest.fixture
def unauth_auth_handler():
    auth = Mock()
    auth.is_authenticated.return_value = False
    auth.get_auth_summary.return_value = "No authentication"
    return auth


@pytest.fixture
def sample_results():
    return [
        {
            "scenario": "Get users",
            "method": "GET",
            "url": "/api/users",
            "status_code": 200,
            "response": {"id": 1},
            "request_body": None,
            "schema_validation": {
                "schema_found": True,
                "schema_valid": True,
                "violations": []
            },
            "result": "passed"
        },
        {
            "scenario": "Create user",
            "method": "POST",
            "url": "/api/users",
            "status_code": 400,
            "response": {"error": "bad request"},
            "request_body": {"name": ""},
            "schema_validation": {
                "schema_found": True,
                "schema_valid": False,
                "violations": ["name is required"]
            },
            "result": "failed"
        }
    ]
