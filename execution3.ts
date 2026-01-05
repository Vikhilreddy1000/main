def __call__(self, state, batch_size: int = 10):
    try:
        self.auth_handler = AuthHandler(state.project_path)

        if self.auth_handler.is_authenticated():
            print(f"[TEST] Authentication: {self.auth_handler.get_auth_summary()}",
                  file=sys.stderr, flush=True)
        else:
            print("[TEST] Running tests without authentication",
                  file=sys.stderr, flush=True)

        # -------------------------------
        # Load OpenAPI
        # -------------------------------
        openapi_dir = os.path.join(state.project_path, "output")
        filepath = self._find_latest_openapi_spec(openapi_dir)

        with open(filepath, "r", encoding="utf-8") as f:
            state.analysis = yaml.safe_load(f) if filepath.endswith((".yaml", ".yml")) else json.load(f)

        self.schema_validator = SchemaValidator(state.analysis)
        base_url = self._get_base_url_from_spec(state.analysis)

        # -------------------------------
        # Clean Feature (DO NOT REMOVE TAGS)
        # -------------------------------
        cleaned_text = re.sub(r"^\s*Feature:.*$", "", state.feature_text, flags=re.MULTILINE)
        cleaned_text = re.sub(r"^\s*#.*$", "", cleaned_text, flags=re.MULTILINE)
        cleaned_text = re.sub(r"\n{2,}", "\n", cleaned_text).strip()

        # -------------------------------
        # BUILD SCENARIOS WITH TAGS
        # -------------------------------
        scenarios = []

        current_tags = []
        current_lines = []
        scenario_name = None

        for line in cleaned_text.splitlines():
            line = line.rstrip()

            # Tags BEFORE scenario
            if line.strip().startswith("@"):
                current_tags.append(line.strip().lower())
                continue

            # Scenario start
            if line.strip().startswith("Scenario:"):
                if current_lines:
                    scenarios.append({
                        "name": scenario_name,
                        "text": "\n".join(current_lines),
                        "tags": set(current_tags),
                    })
                    current_lines = []
                    current_tags = []

                scenario_name = line.replace("Scenario:", "").strip()
                current_lines.append(line)
                continue

            if current_lines:
                current_lines.append(line)

        # Flush last scenario
        if current_lines:
            scenarios.append({
                "name": scenario_name,
                "text": "\n".join(current_lines),
                "tags": set(current_tags),
            })

        # -------------------------------
        # EXECUTE SCENARIOS (UNCHANGED LOOP)
        # -------------------------------
        results = []

        for scenario in scenarios:
            scenario_name = scenario["name"]
            full_scenario = scenario["text"]
            tags = scenario["tags"]
            is_negative = "@negative" in tags

            try:
                method, url, body = self._extract_http_call(full_scenario)
                expectations = self._extract_expected_status(full_scenario)

                response = self._run_curl_command(
                    method=method,
                    url=url,
                    base_url=base_url,
                    body=body
                )

                status = response.get("status", 0)
                response_body = response.get("response")

                status_passed = self._validate_status(
                    actual_status=status,
                    expectations=expectations,
                    is_negative=is_negative
                )

                schema_result = self._validate_response_schema(
                    url=response["url"],
                    method=method,
                    status_code=status,
                    response_body=response_body
                )

                schema_passed = True
                if schema_result.get("schema_found") and not schema_result.get("schema_valid"):
                    schema_passed = False

                final_passed = status_passed and schema_passed

                results.append({
                    "scenario": scenario_name,
                    "tags": list(tags),
                    "request_body": body,
                    "url": response["url"],
                    "method": method,
                    "status": status,
                    "response": response_body,
                    "schema_validation": schema_result,
                    "result": "passed" if final_passed else "failed"
                })

            except Exception as e:
                results.append({
                    "scenario": scenario_name,
                    "tags": list(tags),
                    "request_body": None,
                    "url": "",
                    "method": "",
                    "status": 0,
                    "response": str(e),
                    "schema_validation": {},
                    "result": "failed"
                })

        final_input = json.dumps({
            "results": results,
            "curl_commands": []
        })

        report_json = self._generate_html_report(state, final_input)
        state.execution_output = json.loads(report_json).get("execution_output")

    except Exception as e:
        state.execution_output = {"error": str(e)}

    return state
