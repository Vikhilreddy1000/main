import pytest
import asyncio
import yaml
from unittest.mock import AsyncMock, MagicMock, patch

from bdd_generation import BDDGenerationNode


@pytest.fixture
def node():
    node = BDDGenerationNode()
    node.llm = AsyncMock()
    return node


# =========================================================
# resolve_ref
# =========================================================

@pytest.mark.asyncio
async def test_resolve_ref_valid(node):
    spec = {
        "components": {
            "schemas": {
                "User": {"type": "object"}
            }
        }
    }

    ref = "#/components/schemas/User"

    result = await node.resolve_ref(ref, spec)

    assert result == {"type": "object"}


@pytest.mark.asyncio
async def test_resolve_ref_invalid_prefix(node):
    spec = {}
    ref = "http://external.com/schema"

    with pytest.raises(ValueError):
        await node.resolve_ref(ref, spec)


@pytest.mark.asyncio
async def test_resolve_ref_invalid_path(node):
    spec = {"components": {}}
    ref = "#/components/schemas/Invalid"

    with pytest.raises(KeyError):
        await node.resolve_ref(ref, spec)


# =========================================================
# resolve_schema
# =========================================================

@pytest.mark.asyncio
async def test_resolve_schema_with_ref(node):
    spec = {
        "components": {
            "schemas": {
                "User": {"type": "object"}
            }
        }
    }

    schema = {"$ref": "#/components/schemas/User"}

    result = await node.resolve_schema(schema, spec)

    assert result == {"type": "object"}


@pytest.mark.asyncio
async def test_resolve_schema_nested(node):
    spec = {
        "components": {
            "schemas": {
                "User": {"type": "object"}
            }
        }
    }

    schema = {
        "properties": {
            "user": {"$ref": "#/components/schemas/User"}
        }
    }

    result = await node.resolve_schema(schema, spec)

    assert result["properties"]["user"] == {"type": "object"}


@pytest.mark.asyncio
async def test_resolve_schema_non_dict(node):
    result = await node.resolve_schema("string", {})
    assert result == "string"


# =========================================================
# _split_by_paths
# =========================================================

@pytest.mark.asyncio
async def test_split_by_paths(node):
    spec = {
        "paths": {
            "/users": {"get": {}},
            "/orders": {"post": {}}
        }
    }

    chunks = await node._split_by_paths(spec)

    assert len(chunks) == 2
    assert {"path": "/users", "methods": {"get": {}}} in chunks


# =========================================================
# _generate_initial_bdd
# =========================================================

@pytest.mark.asyncio
async def test_generate_initial_bdd_success(node):
    node.llm.ainvoke.return_value = MagicMock(
        content="```gherkin\nFeature: Test\n```"
    )

    with patch("bdd_generation.PromptLoader") as mock_loader:
        mock_loader.return_value.prompt_loader.return_value = "prompt"

        result = await node._generate_initial_bdd({"path": "/users"})

    assert "Feature: Test" in result


@pytest.mark.asyncio
async def test_generate_initial_bdd_invalid_prompt(node):
    with patch("bdd_generation.PromptLoader") as mock_loader:
        mock_loader.return_value.prompt_loader.return_value = None

        with pytest.raises(ValueError):
            await node._generate_initial_bdd({"path": "/users"})


# =========================================================
# _generate_all_endpoints_parallel
# =========================================================

@pytest.mark.asyncio
async def test_generate_all_endpoints_parallel(node):
    spec = {
        "paths": {
            "/users": {"get": {}},
            "/orders": {"post": {}}
        }
    }

    async def mock_generate(endpoint):
        return f"Feature for {endpoint['path']}"

    node._generate_initial_bdd = mock_generate

    result = await node._generate_all_endpoints_parallel(spec)

    assert "Feature for /users" in result
    assert "Feature for /orders" in result


# =========================================================
# __call__
# =========================================================

@pytest.mark.asyncio
async def test_call_success(node):
    state = MagicMock()
    state.analysis = yaml.dump({
        "paths": {
            "/users": {"get": {}}
        }
    })

    node._generate_all_endpoints_parallel = AsyncMock(
        return_value="Feature: Users"
    )

    result = await node(state)

    assert result.feature_text == "Feature: Users"


@pytest.mark.asyncio
async def test_call_missing_analysis(node):
    state = MagicMock()
    state.analysis = None

    node._mock_bdd_generator = AsyncMock(return_value="Mock Feature")

    result = await node(state)

    assert result.feature_text == "Mock Feature"
