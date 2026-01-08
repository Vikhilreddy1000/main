import os
import yaml
import json
from dotenv import load_dotenv
from openai import OpenAI
from pydantic import BaseModel
from typing import List, Dict, Any


class FilePayload(BaseModel):
    path: str
    content: str


class GenerateRequestBody(BaseModel):
    files: list[FilePayload]
    specContent: str


class BDDGenerationNode:
    """
    PURE OPENAI based deterministic BDD scenario generator.
    Converts OpenAPI YAML into STRICT Gherkin features.
    """

    def __init__(self):
        load_dotenv()

        self.client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

        self.model = os.getenv("MODEL", "gpt-4.1")

        # --- KEEP YOUR ORIGINAL STRICT PROMPT RULES INTACT ---
        self.system_prompt = (
            "You are a Senior QA Engineer specializing in Behavior-Driven Development (BDD) "
            "and AI-assisted API testing. Your job is to convert the given OpenAPI 3.0 YAML "
            "into comprehensive Gherkin test scenarios.\n\n"

            "STRICT RULES — DO NOT VIOLATE:\n"
            "1 Output must be in PURE Gherkin syntax only.\n"
            "2 DO NOT use markdown, explanations, or comments.\n"
            "3 Response MUST start with `Feature:` and contain NOTHING before it.\n"
            "4 Each API resource MUST map to exactly one Feature.\n"
            "5 EVERY endpoint in the spec MUST be covered.\n"
            "6 EVERY Scenario MUST have AT LEast ONE TAG.\n"
            "7 Tags MUST be placed IMMEDIATELY ABOVE each Scenario line.\n"
            "8 AT LEAST two scenarios per endpoint.\n"
            "9 Happy path scenarios MUST include @smoke tag.\n"
            "10 Security scenarios MUST include @security tag.\n"
            "11 Performance scenarios MUST include @performance tag.\n\n"

            "MANDATORY TAGGING POLICY:\n"
            "- Happy path: @smoke\n"
            "- Edge cases: @edge\n"
            "- Negative tests: @negative\n"
            "- Security tests: @security\n"
            "- Performance tests: @performance\n\n"

            "Generate MAXIMUM MEANINGFUL scenarios from the spec while honoring all above rules."
        )

    def __call__(self, state, input_json: str):
        """
        Deterministic execution entry point.
        """

        try:
            data = json.loads(input_json)
            request = GenerateRequestBody(**data)
        except Exception as e:
            return json.dumps({"error": f"Invalid input: {str(e)}"})

        try:
            spec_data = yaml.safe_load(request.specContent)
        except Exception as e:
            return json.dumps({"error": f"Invalid OpenAPI YAML: {str(e)}"})

        # Create ONE SINGLE DETERMINISTIC prompt message
        user_prompt = self._build_prompt(spec_data)

        response = self.client.chat.completions.create(
            model=self.model,
            temperature=0,
            messages=[
                {"role": "system", "content": self.system_prompt},
                {"role": "user", "content": user_prompt}
            ]
        )

        gherkin_output = response.choices[0].message.content

        # Build traceability table
        table = self._build_feature_table(spec_data)

        result = {
            "feature_text": gherkin_output,
            "traceability": table
        }

        return json.dumps(result, indent=2)

    # ------------------------------------------------------------------
    # HELPER FUNCTIONS
    # ------------------------------------------------------------------

    def _build_prompt(self, spec: Dict[str, Any]) -> str:
        """
        Creates clear prompt forcing EXACT coverage
        """

        prompt = "OPENAPI SPECIFICATION:\n\n"

        for path, methods in spec.get("paths", {}).items():
            prompt += f"PATH: {path}\n"

            for method, details in methods.items():
                prompt += f"  METHOD: {method.upper()}\n"
                prompt += f"  SUMMARY: {details.get('summary','')}\n"
                prompt += f"  DESCRIPTION: {details.get('description','')}\n\n"

        prompt += "\n\nIMPORTANT: COVER EVERY ABOVE ENDPOINT EXACTLY.\n"

        return prompt

    def _build_feature_table(self, spec: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        Exact Feature ↔ Endpoint mapping
        """

        mapping = []

        for path, methods in spec.get("paths", {}).items():
            for method in methods.keys():
                mapping.append({
                    "endpoint": path,
                    "method": method.upper()
                })

        return mapping
