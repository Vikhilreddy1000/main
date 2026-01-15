import os
import re
import sys
import json
from dotenv import load_dotenv
from langchain_core.messages import SystemMessage, HumanMessage
from langchain.agents import create_agent
from langchain_openai import AzureChatOpenAI

class BDDGenerationNode:
    """
    Robust BDD generator and feature splitter.

    Responsibilities:
    1) Take OpenAPI (from state.analysis)
    2) Ask LLM to convert it into Gherkin features
    3) Classify scenarios into:
       - functional
       - non_functional (@performance / @security)
    4) Write .feature files
    5) Store the whole combined Gherkin in state.feature_text
    """

    MAX_REFINEMENT_ROUNDS = 3

    def __init__(self, output_dir: str = "bdd_tests/features"):
        load_dotenv()
        self.output_dir = output_dir

        # ORIGINAL GENERATOR LLM (UNCHANGED)
        self.llm = AzureChatOpenAI(
            model="gpt-4o",
            temperature=0
        )

        # NEW: JUDGE LLM (STRICT)
        self.judge_llm = AzureChatOpenAI(
            model="gpt-4o",
            temperature=0
        )

    # -----------------------------
    # MAIN ENTRY (UNCHANGED FLOW)
    # -----------------------------
    def __call__(self, state):
        openapi_spec = getattr(state, "analysis", None)

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

        try:
            # 🔁 NEW: feedback loop wrapper
            feature_text = self._generate_with_feedback_loop(openapi_spec)

        except Exception as e:
            print(
                f"LLM Error in BDDGenerationNode: {e}",
                file=sys.stderr,
                flush=True
            )
            feature_text = self._mock_bdd_generator(openapi_spec)

        state.feature_text = feature_text
        return state

    # -----------------------------
    # ORIGINAL GENERATION (UNCHANGED)
    # -----------------------------
    def _generate_initial_bdd(self, openapi_spec: str) -> str:
        rendered_prompt = PromptLoader.prompt_loader(
            "bdd/bdd_generation.jinja"
        )

        messages = [
            SystemMessage(content=rendered_prompt),
            HumanMessage(
                content=f"""
Your job is to convert the given OpenAPI 3.0 specification into comprehensive BDD Gherkin scenarios.

OPENAPI SPEC:
{openapi_spec}
"""
            )
        ]

        agent = create_agent(
            model=self.llm,
            system_prompt=rendered_prompt
        )

        result = agent.invoke({"messages": messages})

        if isinstance(result, dict) and "messages" in result:
            ai_messages = [
                msg for msg in result["messages"]
                if getattr(msg, "type", None) == "ai"
                or msg.__class__.__name__ == "AIMessage"
            ]
            return ai_messages[-1].content.strip() if ai_messages else ""

        if hasattr(result, "content"):
            return result.content.strip()

        if isinstance(result, str):
            return result.strip()

        return str(result or "").strip()

    # -----------------------------
    # NEW: FEEDBACK LOOP CONTROLLER
    # -----------------------------
    def _generate_with_feedback_loop(self, openapi_spec: str) -> str:
        feature_text = self._generate_initial_bdd(openapi_spec)

        for iteration in range(self.MAX_REFINEMENT_ROUNDS):
            judge_result = self._judge_bdd(openapi_spec, feature_text)

            if judge_result.get("verdict") == "PASS":
                return feature_text

            refinement_prompt = f"""
You previously generated the following Gherkin:

{feature_text}

The QA Judge identified the following issues:
{json.dumps(judge_result.get("issues", []), indent=2)}

Apply these refinement instructions STRICTLY:
{judge_result.get("refinement_instructions", "")}

Rules:
- Do NOT remove valid scenarios
- Add missing scenarios
- Fix incorrect paths, methods, responses
- Preserve required tags
- Output ONLY valid Gherkin (no explanations)

Return corrected Gherkin only.
"""

            feature_text = self.llm.invoke(
                [HumanMessage(content=refinement_prompt)]
            ).content.strip()

        return feature_text

    # -----------------------------
    # NEW: JUDGE LOGIC
    # -----------------------------
    def _judge_bdd(self, openapi_spec: str, feature_text: str) -> dict:
        judge_prompt = """
You are a strict BDD QA auditor.

INPUTS:
1. OpenAPI 3.0 specification
2. Generated Gherkin feature text

TASK:
- Verify coverage of ALL:
  - paths
  - HTTP methods
  - request bodies
  - response status codes
- Detect:
  - missing endpoints
  - hallucinated endpoints
  - incorrect responses
  - missing tags
  - incomplete scenario coverage

OUTPUT FORMAT (STRICT JSON ONLY):
{
  "verdict": "PASS" | "FAIL",
  "issues": [
    {
      "type": "missing_endpoint | incorrect_response | hallucination | missing_scenario",
      "description": "clear explanation",
      "location": "path + method if applicable"
    }
  ],
  "refinement_instructions": "Concrete instructions to fix the Gherkin"
}

DO NOT OUTPUT ANYTHING EXCEPT VALID JSON.
"""

        messages = [
            SystemMessage(content=judge_prompt),
            HumanMessage(
                content=f"""
OPENAPI SPEC:
{openapi_spec}

GENERATED GHERKIN:
{feature_text}
"""
            )
        ]

        result = self.judge_llm.invoke(messages)

        try:
            return json.loads(result.content)
        except Exception:
            return {
                "verdict": "FAIL",
                "issues": [{
                    "type": "judge_error",
                    "description": "Judge failed to return valid JSON",
                    "location": "global"
                }],
                "refinement_instructions": "Regenerate Gherkin strictly matching the OpenAPI spec."
            }

    # -----------------------------
    # FALLBACK (UNCHANGED)
    # -----------------------------
    def _mock_bdd_generator(self, openapi_spec: str) -> str:
        return """Feature: Mock Feature
  Scenario: Mock scenario
    Given mock input
    When mock action
    Then mock result
"""
