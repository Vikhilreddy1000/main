def resolve_schema(schema: dict, spec: dict):
    if not isinstance(schema, dict):
        return schema
 
    if "$ref" in schema:
        resolved = resolve_ref(schema["$ref"], spec)
        return resolve_schema(resolved, spec)
 
    resolved_schema = {}
    for key, value in schema.items():
        if isinstance(value, dict):
            resolved_schema[key] = resolve_schema(value, spec)
        elif isinstance(value, list):
            resolved_schema[key] = [
                resolve_schema(item, spec) if isinstance(item, dict) else item
                for item in value
            ]
        else:
            resolved_schema[key] = value
 
    return resolved_schema





import yaml
import json
from typing import Dict, Any, List
from langchain.schema import SystemMessage, HumanMessage


# ===============================
# SCHEMA RESOLUTION HELPERS
# ===============================

def resolve_ref(ref: str, spec: dict) -> dict:
    """
    Resolves $ref like:
    #/components/schemas/User
    """
    if not ref.startswith("#/"):
        raise ValueError(f"Only local refs supported. Got: {ref}")

    parts = ref.lstrip("#/").split("/")
    result = spec

    for part in parts:
        if part not in result:
            raise KeyError(f"Invalid ref path: {ref}")
        result = result[part]

    return result


def resolve_schema(schema: dict, spec: dict):
    """
    Recursively resolves $ref inside schema.
    """
    if not isinstance(schema, dict):
        return schema

    if "$ref" in schema:
        resolved = resolve_ref(schema["$ref"], spec)
        return resolve_schema(resolved, spec)

    resolved_schema = {}

    for key, value in schema.items():
        if isinstance(value, dict):
            resolved_schema[key] = resolve_schema(value, spec)
        elif isinstance(value, list):
            resolved_schema[key] = [
                resolve_schema(item, spec) if isinstance(item, dict) else item
                for item in value
            ]
        else:
            resolved_schema[key] = value

    return resolved_schema


# ===============================
# MAIN BDD GENERATION NODE
# ===============================

class BDDGenerationNode:

    MAX_REFINEMENT_ROUNDS = 2

    def __init__(self, llm, judge_llm):
        self.llm = llm
        self.judge_llm = judge_llm

    # ---------------------------
    # ENTRYPOINT
    # ---------------------------
    async def __call__(self, state):
        openapi_yaml = getattr(state, "analysis", None)

        if not openapi_yaml:
            raise ValueError("OpenAPI spec missing in state.analysis")

        spec_dict = yaml.safe_load(openapi_yaml)

        # Resolve full spec once
        spec_dict = resolve_schema(spec_dict, spec_dict)

        feature_text = await self._generate_all_endpoints(spec_dict)

        state.feature_text = feature_text
        return state

    # ---------------------------
    # SPLIT ENDPOINTS
    # ---------------------------
    def _split_by_paths(self, spec: Dict[str, Any]) -> List[Dict]:
        paths = spec.get("paths", {})
        chunks = []

        for path, methods in paths.items():
            chunks.append({
                "path": path,
                "methods": methods
            })

        return chunks

    # ---------------------------
    # GENERATE ALL ENDPOINTS
    # ---------------------------
    async def _generate_all_endpoints(self, spec: dict) -> str:
        endpoint_chunks = self._split_by_paths(spec)

        all_features = []

        for endpoint in endpoint_chunks:
            feature = await self._generate_with_feedback_loop(endpoint)
            all_features.append(feature)

        return "\n\n".join(all_features)

    # ---------------------------
    # FEEDBACK LOOP (PER ENDPOINT)
    # ---------------------------
    async def _generate_with_feedback_loop(self, endpoint_chunk: dict) -> str:

        feature_text = await self._generate_initial_bdd(endpoint_chunk)

        for _ in range(self.MAX_REFINEMENT_ROUNDS):

            judge_result = await self._judge_bdd(endpoint_chunk, feature_text)
            missing = judge_result.get("missing_endpoints", [])

            if judge_result.get("verdict") == "PASS" and not missing:
                return feature_text

            # regenerate ONLY this endpoint
            feature_text = await self._refine_bdd(endpoint_chunk, feature_text)

        return feature_text

    # ---------------------------
    # INITIAL GENERATION
    # ---------------------------
    async def _generate_initial_bdd(self, endpoint_chunk: dict) -> str:

        messages = [
            SystemMessage(content="Generate comprehensive BDD Gherkin scenarios."),
            HumanMessage(content=json.dumps(endpoint_chunk, indent=2))
        ]

        result = await self.llm.invoke(messages)

        return result.content.strip()

    # ---------------------------
    # REFINE
    # ---------------------------
    async def _refine_bdd(self, endpoint_chunk: dict, feature_text: str) -> str:

        messages = [
            SystemMessage(content="Improve the BDD scenarios."),
            HumanMessage(
                content=f"""
Endpoint:
{json.dumps(endpoint_chunk, indent=2)}

Current BDD:
{feature_text}

Fix missing coverage and improve completeness.
"""
            )
        ]

        result = await self.llm.invoke(messages)

        return result.content.strip()

    # ---------------------------
    # JUDGE
    # ---------------------------
    async def _judge_bdd(self, endpoint_chunk: dict, feature_text: str) -> dict:

        messages = [
            SystemMessage(content="Judge whether BDD fully covers the endpoint."),
            HumanMessage(
                content=f"""
Endpoint:
{json.dumps(endpoint_chunk, indent=2)}

BDD:
{feature_text}

Return JSON:
{{
  "verdict": "PASS" or "FAIL",
  "missing_endpoints": []
}}
"""
            )
        ]

        result = await self.judge_llm.invoke(messages)

        response = result.content

        try:
            start = response.find("{")
            end = response.rfind("}")
            parsed = json.loads(response[start:end+1])
            return parsed
        except Exception:
            return {
                "verdict": "FAIL",
                "missing_endpoints": ["parsing_error"]
            }
