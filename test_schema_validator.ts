import pytest
from typing import Any, Dict

from src.utils.test_execution_utils.schema_validator import (
    SchemaViolation,
    ValidationResult,
    SchemaValidator,
    JSONSCHEMA_AVAILABLE,
)

# ----------------------------
# Fixtures
# ----------------------------

@pytest.fixture
def minimal_openapi_spec():
    return {
        "openapi": "3.0.0",
        "paths": {
            "/users/{id}": {
                "get": {
                    "responses": {
                        "200": {
                            "content": {
                                "application/json": {
                                    "schema": {
                                        "type": "object",
                                        "properties": {
                                            "id": {"type": "integer"},
                                            "name": {"type": "string"},
                                        },
                                        "required": ["id", "name"],
                                    }
                                }
                            }
                        }
                    }
                }
            }
        },
        "components": {
            "schemas": {}
        },
    }


@pytest.fixture
def validator(minimal_openapi_spec):
    return SchemaValidator(minimal_openapi_spec)


# ----------------------------
# Model tests
# ----------------------------

def test_schema_violation_to_dict():
    v = SchemaViolation(
        path="/id",
        message="Invalid type",
        expected="integer",
        actual="string",
        severity="error",
    )

    result = v.to_dict()

    assert result == {
        "path": "/id",
        "message": "Invalid type",
        "expected": "integer",
        "actual": "string",
        "severity": "error",
    }


def test_validation_result_to_dict():
    vr = ValidationResult(
        is_valid=False,
        violations=[
            SchemaViolation(
                path="/name",
                message="Missing field",
                expected="string",
                actual="null",
            )
        ],
        schema_found=True,
    )

    result = vr.to_dict()

    assert result["is_valid"] is False
    assert result["schema_found"] is True
    assert result["violation_count"] == 1
    assert result["violations"][0]["path"] == "/name"


# ----------------------------
# Path helpers
# ----------------------------

def test_normalize_path_basic(validator):
    assert validator._normalize_path("/users/1") == "/users/1"


def test_normalize_path_trailing_slash(validator):
    assert validator._normalize_path("/users/1/") == "/users/1"


def test_match_path_direct(validator):
    assert validator._match_path("/users/1") == "/users/{id}"


def test_match_path_not_found(validator):
    assert validator._match_path("/unknown") is None


# ----------------------------
# Schema resolution
# ----------------------------

def test_resolve_ref_local_schema(validator):
    schema = {
        "$ref": "#/components/schemas/Test"
    }

    validator.schemas["Test"] = {"type": "string"}

    resolved = validator._resolve_ref(schema)

    assert resolved == {"type": "string"}


def test_expand_schema_simple_object(validator):
    schema = {
        "type": "object",
        "properties": {
            "a": {"type": "string"}
        }
    }

    expanded = validator._expand_schema(schema)

    assert expanded["properties"]["a"]["type"] == "string"


def test_is_nullable_true():
    validator = SchemaValidator({"paths": {}, "components": {}})
    assert validator._is_nullable({"nullable": True}) is True


def test_is_nullable_false():
    validator = SchemaValidator({"paths": {}, "components": {}})
    assert validator._is_nullable({"type": "string"}) is False


# ----------------------------
# Schema navigation
# ----------------------------

def test_get_schema_for_path_success(validator):
    schema = validator._get_schema_for_path(
        validator.spec,
        ["users", "{id}"]
    )

    assert schema is not None


def test_get_schema_for_path_failure(validator):
    schema = validator._get_schema_for_path(
        validator.spec,
        ["invalid"]
    )

    assert schema is None


# ----------------------------
# Request schema
# ----------------------------

def test_get_request_schema_not_present(validator):
    schema = validator._get_request_schema(
        "/users/1",
        "get"
    )

    assert schema is None


# ----------------------------
# Response schema
# ----------------------------

def test_get_response_schema_success(validator):
    schema = validator._get_response_schema(
        "/users/1",
        "get",
        200
    )

    assert schema is not None
    assert schema["type"] == "object"


def test_get_response_schema_invalid_status(validator):
    schema = validator._get_response_schema(
        "/users/1",
        "get",
        404
    )

    assert schema is None


# ----------------------------
# Violations
# ----------------------------

def test_get_violation_required_missing(validator):
    error = validator._get_violation(
        error_type="required",
        path="/name",
        schema_node={"required": ["name"]},
        instance={}
    )

    assert error.message == "Required field missing"
    assert error.severity == "error"


def test_get_violation_type_mismatch(validator):
    error = validator._get_violation(
        error_type="type",
        path="/id",
        schema_node={"type": "integer"},
        instance="abc"
    )

    assert "Expected type" in error.message


# ----------------------------
# JSON Schema validation
# ----------------------------

@pytest.mark.skipif(not JSONSCHEMA_AVAILABLE, reason="jsonschema not installed")
def test_run_validation_valid_payload(validator):
    schema = {
        "type": "object",
        "properties": {
            "id": {"type": "integer"}
        },
        "required": ["id"]
    }

    violations = validator._run_validation(schema, {"id": 1})

    assert violations == []


@pytest.mark.skipif(not JSONSCHEMA_AVAILABLE, reason="jsonschema not installed")
def test_run_validation_invalid_payload(validator):
    schema = {
        "type": "object",
        "properties": {
            "id": {"type": "integer"}
        },
        "required": ["id"]
    }

    violations = validator._run_validation(schema, {"id": "abc"})

    assert len(violations) == 1
    assert violations[0].severity == "error"


# ----------------------------
# Public APIs
# ----------------------------

def test_validate_request_success(validator):
    result = validator.validate_request(
        endpoint="/users/1",
        method="get",
        request_body=None
    )

    assert isinstance(result, ValidationResult)
    assert result.schema_found is True


def test_validate_response_success(validator):
    result = validator.validate_response(
        endpoint="/users/1",
        method="get",
        status_code=200,
        response_body={"id": 1, "name": "John"}
    )

    assert result.is_valid is True
    assert result.violation_count == 0


def test_validate_response_failure(validator):
    result = validator.validate_response(
        endpoint="/users/1",
        method="get",
        status_code=200,
        response_body={"id": "bad"}
    )

    assert result.is_valid is False
    assert result.violation_count > 0


# ----------------------------
# Report formatting
# ----------------------------

def test_format_violations_for_report_empty():
    html = SchemaValidator.format_violations_for_report([])
    assert "Schema Valid" in html


def test_format_violations_for_report_non_empty():
    violations = [
        SchemaViolation(
            path="/id",
            message="Invalid type",
            expected="integer",
            actual="string",
        )
    ]

    html = SchemaValidator.format_violations_for_report(violations)
    assert "Schema Violation" in html
    assert "/id" in html
