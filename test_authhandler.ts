import json
import base64
import pytest

from utils.test_execution_utils.auth_handler import AuthHandler
🔧 Fixtures
@pytest.fixture
def empty_env():
    return json.dumps({})
@pytest.fixture
def bearer_env():
    return json.dumps({
        "AUTH_BEARER_TOKEN": "verylongbearertokenvalue1234567890"
    })
@pytest.fixture
def api_key_header_env():
    return json.dumps({
        "AUTH_API_KEY": "apikey123",
        "AUTH_API_KEY_HEADER": "X-CUSTOM-KEY",
        "AUTH_API_KEY_IN": "header"
    })
@pytest.fixture
def api_key_query_env():
    return json.dumps({
        "API_KEY": "apikey123",
        "API_KEY_IN": "query"
    })
@pytest.fixture
def basic_auth_env():
    return json.dumps({
        "AUTH_BASIC_USERNAME": "admin",
        "AUTH_BASIC_PASSWORD": "secret"
    })
🧪 __init__ + detection
def test_init_with_empty_env(empty_env):
    auth = AuthHandler(empty_env)
    assert auth.auth_type is None
    assert auth.auth_config == {}
def test_detects_bearer_auth(bearer_env):
    auth = AuthHandler(bearer_env)
    assert auth.auth_type == "bearer"
    assert auth.auth_config["token"].startswith("verylong")
def test_detects_api_key_auth(api_key_header_env):
    auth = AuthHandler(api_key_header_env)
    assert auth.auth_type == "apikey"
    assert auth.auth_config["key"] == "apikey123"
    assert auth.auth_config["header"] == "X-CUSTOM-KEY"
    assert auth.auth_config["in"] == "header"
def test_detects_basic_auth(basic_auth_env):
    auth = AuthHandler(basic_auth_env)
    assert auth.auth_type == "basic"
    assert auth.auth_config["username"] == "admin"
    assert auth.auth_config["password"] == "secret"
def test_priority_bearer_over_apikey():
    env = json.dumps({
        "AUTH_BEARER_TOKEN": "token",
        "AUTH_API_KEY": "apikey"
    })
    auth = AuthHandler(env)
    assert auth.auth_type == "bearer"
🧪 _get_env_value
def test_get_env_value_first_match():
    auth = AuthHandler(json.dumps({}))
    env = {"A": None, "B": "value"}
    assert auth._get_env_value(["A", "B"], env) == "value"
def test_get_env_value_none():
    auth = AuthHandler(json.dumps({}))
    assert auth._get_env_value(["X", "Y"], {}) is None
🧪 get_auth_headers
Bearer
def test_get_auth_headers_bearer(bearer_env):
    auth = AuthHandler(bearer_env)
    headers = auth.get_auth_headers()
    assert headers["Authorization"].startswith("Bearer ")
API key (header)
def test_get_auth_headers_api_key_header(api_key_header_env):
    auth = AuthHandler(api_key_header_env)
    headers = auth.get_auth_headers()
    assert headers["X-CUSTOM-KEY"] == "apikey123"
API key (query → no headers)
def test_get_auth_headers_api_key_query(api_key_query_env):
    auth = AuthHandler(api_key_query_env)
    headers = auth.get_auth_headers()
    assert headers == {}
Basic
def test_get_auth_headers_basic(basic_auth_env):
    auth = AuthHandler(basic_auth_env)
    headers = auth.get_auth_headers()

    encoded = base64.b64encode(b"admin:secret").decode()
    assert headers["Authorization"] == f"Basic {encoded}"
🧪 get_auth_query_params
def test_get_auth_query_params_api_key_query(api_key_query_env):
    auth = AuthHandler(api_key_query_env)
    params = auth.get_auth_query_params()
    assert params["api_key"] == "apikey123"
def test_get_auth_query_params_header_key(api_key_header_env):
    auth = AuthHandler(api_key_header_env)
    params = auth.get_auth_query_params()
    assert params == {}
def test_get_auth_query_params_no_auth(empty_env):
    auth = AuthHandler(empty_env)
    assert auth.get_auth_query_params() == {}
🧪 get_auth_summary
def test_get_auth_summary_bearer(bearer_env):
    auth = AuthHandler(bearer_env)
    summary = auth.get_auth_summary()
    assert "Bearer Token" in summary
    assert "..." in summary
def test_get_auth_summary_api_key(api_key_header_env):
    auth = AuthHandler(api_key_header_env)
    summary = auth.get_auth_summary()
    assert "API Key" in summary
    assert "X-CUSTOM-KEY" in summary
def test_get_auth_summary_basic(basic_auth_env):
    auth = AuthHandler(basic_auth_env)
    summary = auth.get_auth_summary()
    assert summary == "Basic Auth: admin:****"
def test_get_auth_summary_none(empty_env):
    auth = AuthHandler(empty_env)
    assert auth.get_auth_summary() == "No authentication configured"
🧪 is_authenticated
def test_is_authenticated_true(bearer_env):
    auth = AuthHandler(bearer_env)
    assert auth.is_authenticated() is True
def test_is_authenticated_false(empty_env):
    auth = AuthHandler(empty_env)
    assert auth.is_authenticated() is False
🧪 get_auth_type
def test_get_auth_type_bearer(bearer_env):
    auth = AuthHandler(bearer_env)
    assert auth.get_auth_type() == "bearer"
def test_get_auth_type_none(empty_env):
    auth = AuthHandler(empty_env)
    assert auth.get_auth_type() is None
