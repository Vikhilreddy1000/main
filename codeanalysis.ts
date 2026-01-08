import os
import json
import yaml
from dotenv import load_dotenv
from openai import OpenAI
from pathspec import PathSpec


class CodeAnalysisNode:
    """
    Deterministic static code analysis node using PURE OPENAI calls.
    """

    def __init__(self):
        load_dotenv()

        self.client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        self.model = os.getenv("MODEL", "gpt-4.1")

        # supported extensions (same as your code)
        self.supported_exts = (
            ".py", ".js", ".ts", ".java", ".go", ".cs",
            ".json", ".yaml", ".yml", ".xml",
            ".env", ".ini", ".cfg", ".properties",
            ".md", ".txt",
            ".sh", ".ps1"
        )

        # keep your strict prompts intact
        self.chunk_analysis_prompt = (
            "You are an expert static code analysis agent specializing in API extraction. "
            "Analyze ONLY the provided code chunk.\n\n"
            "STRICT EXTRACTION RULES:\n"
            "- Extract real endpoints, routes, HTTP methods\n"
            "- Extract DTO fields referenced\n"
            "- Extract response object structures\n"
            "- Extract visible status codes\n"
            "- Extract server/port hints\n\n"
            "DO NOT invent anything.\n"
            "Output ONLY real extracted API details from this chunk."
        )

        self.final_merge_prompt = (
            "You are an expert API documentation generator.\n"
            "Merge the extracted API information from all chunks into a SINGLE OpenAPI 3.0 YAML file.\n\n"
            "STRICT RULES:\n"
            "- Do NOT invent new endpoints\n"
            "- Infer schemas ONLY from provided data\n"
            "- Detect base URL/port from code hints\n"
            "- Build components.schemas from DTOs\n\n"
            "Return ONLY valid OpenAPI YAML with no explanations."
        )

    # -----------------------------------------------------------------
    # FILE READING LOGIC – KEPT EXACTLY AS YOU HAD
    # -----------------------------------------------------------------

    def read_all_files(self, project_path: str, chunk_size: int = 15000):
        """
        Reads project files recursively honoring .gitignore rules.
        Splits files into safe chunks for LLM consumption.
        """

        gitignore_path = os.path.join(project_path, ".gitignore")
        ignore_spec = None

        if os.path.exists(gitignore_path):
            with open(gitignore_path, "r", encoding="utf-8") as gi:
                ignore_spec = PathSpec.from_lines("gitwildmatch", gi.readlines())

        output_chunks = []

        for root, _, files in os.walk(project_path):
            for f in files:
                file_path = os.path.join(root, f)
                rel_path = os.path.relpath(file_path, project_path)

                if ignore_spec and ignore_spec.match_file(rel_path):
                    continue

                if not f.endswith(self.supported_exts):
                    continue

                try:
                    with open(file_path, "r", encoding="utf-8") as file:
                        content = file.read()

                    for i in range(0, len(content), chunk_size):
                        output_chunks.append({
                            "file": file_path,
                            "chunk": content[i:i + chunk_size]
                        })

                except Exception as e:
                    print(f"Could not read file {file_path}: {e}")
                    continue

        return output_chunks

    # -----------------------------------------------------------------
    # NEW DETERMINISTIC OPENAI INTERACTION
    # -----------------------------------------------------------------

    def analyze_chunks(self, chunks):
        """
        Deterministically analyze each chunk using OpenAI
        """

        results = []

        for idx, item in enumerate(chunks):
            user_message = (
                f"Analyze chunk {idx + 1}/{len(chunks)} from file: {item['file']}.\n\n"
                f"{item['chunk']}"
            )

            response = self.client.chat.completions.create(
                model=self.model,
                temperature=0,
                messages=[
                    {"role": "system", "content": self.chunk_analysis_prompt},
                    {"role": "user", "content": user_message}
                ]
            )

            api_text = response.choices[0].message.content
            results.append(api_text)

        return results

    def combine_results(self, chunk_results):
        """
        Deterministically merge results into final OpenAPI YAML
        """

        combined_text = "\n\n".join(chunk_results)

        user_message = (
            "Combine the following extracted API information into final OpenAPI 3.0 YAML:\n\n"
            f"{combined_text}"
        )

        response = self.client.chat.completions.create(
            model=self.model,
            temperature=0,
            messages=[
                {"role": "system", "content": self.final_merge_prompt},
                {"role": "user", "content": user_message}
            ]
        )

        return response.choices[0].message.content

    def save_openapi_file(self, project_path: str, yaml_content: str) -> str:
        """
        Save generated OpenAPI YAML inside the project folder (same logic)
        """

        output_dir = os.path.join(project_path, "output")
        os.makedirs(output_dir, exist_ok=True)

        file_path = os.path.join(output_dir, "openapi.yaml")

        with open(file_path, "w", encoding="utf-8") as f:
            f.write(yaml_content)

        return file_path

    # -----------------------------------------------------------------
    # FINAL __CALL__ LOGIC – KEPT SAME AS YOUR INTENT
    # -----------------------------------------------------------------

    def __call__(self, data):
        source_path = data.project_path

        openapi_path = os.path.join(source_path, "output", "openapi.yaml")

        if os.path.exists(openapi_path):
            with open(openapi_path, "r", encoding="utf-8") as f:
                existing_spec = f.read()

            data.analysis = existing_spec
            return data

        chunks = self.read_all_files(source_path)

        chunk_results = self.analyze_chunks(chunks)

        final_openapi = self.combine_results(chunk_results)

        self.save_openapi_file(source_path, final_openapi)

        data.analysis = final_openapi

        return data
