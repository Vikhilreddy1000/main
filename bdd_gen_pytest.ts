import pytest
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

from src.llms.nodes.bdd_generation import BDDGenerationNode

@pytest.fixture
def node(monkeypatch):
    mock_llm = AsyncMock()
    mock_judge_llm = AsyncMock()

    monkeypatch.setattr(
        "llms.llm_connector.load_llm",
        MagicMock(side_effect=[mock_llm, mock_judge_llm])
    )

    node = BDDGenerationNode()
    node.llm = mock_llm
    node.judge_llm = mock_judge_llm

    return node

@pytest.mark.asyncio
async def test_call_fallback_when_invalid_openapi(node):
    state = SimpleNamespace(analysis=None)

    result = await node(state)

    assert "Feature:" in result.feature_text
    assert "Scenario:" in result.feature_text



@pytest.mark.asyncio
async def test_generate_without_refinement(node):
    openapi = "openapi: 3.0.0\npaths: {}"
    state = SimpleNamespace(analysis=openapi)

    node.llm.ainvoke.return_value = SimpleNamespace(
        content="```gherkin\nFeature: Test\n```"
    )

    node.judge_llm.ainvoke.return_value = SimpleNamespace(
        content='{"verdict": "PASS", "missing_endpoints": []}'
    )

    result = await node(state)

    assert "Feature: Test" in result.feature_text



@pytest.mark.asyncio
async def test_generate_with_refinement(node):
    openapi = "openapi: 3.0.0\npaths: {}"
    state = SimpleNamespace(analysis=openapi)

    node.llm.ainvoke.side_effect = [
        SimpleNamespace(content="Feature: Initial"),
        SimpleNamespace(content="Feature: Refined"),
    ]

    node.judge_llm.ainvoke.side_effect = [
        SimpleNamespace(content='{"verdict": "FAIL", "missing_endpoints": [{"path":"/x","method":"GET"}]}'),
        SimpleNamespace(content='{"verdict": "PASS", "missing_endpoints": []}')
    ]

    result = await node(state)

    assert "Refined" in result.feature_text



@pytest.mark.asyncio
async def test_llm_error_fallback(node):
    openapi = "openapi: 3.0.0\npaths: {}"
    state = SimpleNamespace(analysis=openapi)

    node.llm.ainvoke.side_effect = Exception("LLM down")

    result = await node(state)

    assert "Feature:" in result.feature_text


@pytest.mark.asyncio
async def test_judge_invalid_json(node):
    with pytest.raises(ValueError):
        await node._judge_bdd("openapi", "feature text")
