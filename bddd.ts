import os
import re
import sys
import asyncio
from dotenv import load_dotenv
from langchain_openai import AzureChatOpenAI
from langchain.schema import SystemMessage, HumanMessage


class BDDGenerationNode:
    """
    Robust async BDD generator with 5 parallel agents.

    Responsibilities:
    1) Read OpenAPI from state.analysis
    2) Generate BDD in parallel (5 agents)
    3) Classify functional vs non-functional
    4) Write .feature files
    5) Store combined Gherkin in state.feature_text
    """

    def __init__(self, output_dir: str = "bdd_tests"):
        load_dotenv()
        self.output_dir = output_dir

        self.llm = AzureChatOpenAI(
            model="gpt-4o",
            temperature=0,
        )

    # ======================================================
    # ASYNC NODE ENTRY
    # ======================================================
    async def __call__(self, state):
        openapi_spec = getattr(state, "analysis", None)

        # ---------------------------
        # Sanity check OpenAPI
        # ---------------------------
        if isinstance(openapi_spec, str):
            looks_like_openapi = bool(
                re.search(r"openapi\s*:\s*3", openapi_spec, re.I)
            ) or ("paths:" in openapi_spec)
        else:
            looks_like_openapi = False

        if not looks_like_openapi:
            feature_text = self._mock_bdd_generator("")
            state.feature_text = feature_text
            return state

        # ---------------------------
        # Run 5 agents in parallel
        # ---------------------------
        try:
            results = await asyncio.gather(
                self._happy_agent(openapi_spec),
                self._edge_agent(openapi_spec),
                self._negative_agent(openapi_spec),
                self._security_agent(openapi_spec),
                self._performance_agent(openapi_spec),
                return_exceptions=True,
            )

            feature_text = "\n\n".join(
                r for r in results if isinstance(r, str) and r.strip()
            )

        except Exception as e:
            print(
                f"LLM Error in BDDGenerationNode: {e}",
                file=sys.stderr,
                flush=True,
            )
            feature_text = self._mock_bdd_generator(openapi_spec)

        # ---------------------------
        # Save & store in state
        # ---------------------------
        self._write_features(feature_text)
        state.feature_text = feature_text
        return state

    # ======================================================
    # SHARED ASYNC LLM CALL
    # ======================================================
    async def _run_llm(self, system_prompt: str, user_prompt: str) -> str:
        messages = [
            SystemMessage(content=system_prompt),
            HumanMessage(content=user_prompt),
        ]

        result = await asyncio.to_thread(self.llm.invoke, messages)
        return result.content.strip()

    # ======================================================
    # AGENTS
    # ======================================================
    async def _happy_agent(self, spec: str) -> str:
        return await self._run_llm(
            "Generate HAPPY PATH BDD scenarios.",
            f"OpenAPI Spec:\n{spec}\n\nStart with: Feature: Happy Path Scenarios",
        )

    async def _edge_agent(self, spec: str) -> str:
        return await self._run_llm(
            "Generate EDGE CASE BDD scenarios.",
            f"OpenAPI Spec:\n{spec}\n\nStart with: Feature: Edge Case Scenarios",
        )

    async def _negative_agent(self, spec: str) -> str:
        return await self._run_llm(
            "Generate NEGATIVE & ERROR BDD scenarios.",
            f"OpenAPI Spec:\n{spec}\n\nStart with: Feature: Negative & Error Scenarios",
        )

    async def _security_agent(self, spec: str) -> str:
        return await self._run_llm(
            "Generate SECURITY BDD scenarios (OWASP API Top 10). Include @security tag.",
            f"OpenAPI Spec:\n{spec}\n\nStart with: Feature: Security Testing",
        )

    async def _performance_agent(self, spec: str) -> str:
        return await self._run_llm(
            "Generate PERFORMANCE BDD scenarios. Include @performance tag.",
            f"OpenAPI Spec:\n{spec}\n\nStart with: Feature: Performance Baseline Testing",
        )

    # ======================================================
    # FEATURE FILE WRITER
    # ======================================================
    def _write_features(self, text: str):
        func_dir = os.path.join(self.output_dir, "functional")
        non_func_dir = os.path.join(self.output_dir, "non_functional")

        os.makedirs(func_dir, exist_ok=True)
        os.makedirs(non_func_dir, exist_ok=True)

        features = text.split("Feature:")

        for i, block in enumerate(features):
            if not block.strip():
                continue

            content = "Feature:" + block.strip()

            if "@security" in content or "@performance" in content:
                path = os.path.join(non_func_dir, f"nf_{i}.feature")
            else:
                path = os.path.join(func_dir, f"func_{i}.feature")

            with open(path, "w", encoding="utf-8") as f:
                f.write(content)

    # ======================================================
    # FALLBACK
    # ======================================================
    def _mock_bdd_generator(self, _):
        return """Feature: Mock
  Scenario: Placeholder
    Given OpenAPI is invalid
    Then BDD generation is skipped
"""
