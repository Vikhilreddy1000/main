def __call__(self, state, batch_size: int = 10):
    try:
        self.auth_handler = AuthHandler(state.project_path)

        # -------------------------------
        # Auth log
        # -------------------------------
        if self.auth_handler.is_authenticated():
            print(
                f"[TEST] Authentication: {self.auth_handler.get_auth_summary()}",
                file=sys.stderr,
                flush=True,
            )
        else:
            print(
                "[TEST] Running tests without authentication",
                file=sys.stderr,
                flush=True,
            )

        # -------------------------------
        # Load OpenAPI
        # -------------------------------
        openapi_dir = os.path.join(state.project_path, "output")
        filepath = self._find_latest_openapi_spec(openapi_dir)

        with open(filepath, "r", encoding="utf-8") as f:
            if filepath.endswith((".yaml", ".yml")):
                state.analysis = yaml.safe_load(f)
            else:
                state.analysis = json.load(f)

        self.schema_validator = SchemaValidator(state.analysis)
        base_url = self._get_base_url_from_spec(state.analysis)

        # -------------------------------
        # Clean ONLY Feature & comments
        # ❌ DO NOT REMOVE TAGS
        # -------------------------------
        cleaned_text = re.sub(
            r"^\s*Feature:.*$", "", state.feature_text, flags=re.MULTILINE
        )
        cleaned_text = re.sub(
            r"^\s*#.*$", "", cleaned_text, flags=re.MULTILINE
        )
        cleaned_text = re.sub(r"\n{2,}", "\n", cleaned_text).strip()

        # -------------------------------
        # Split scenarios (tags preserved)
        # -------------------------------
        raw_scenarios = re.split(
            r"(?m)^\s*Scenario:\s*", cleaned_text
        )

        scenarios = []
        for chunk in raw_scenarios:
            chunk = chunk.strip()
            if not chunk:
                continue

            lines = chunk.splitlines()
            scenario_name = lines[0].strip()
            scenario_body = "\n".join(lines[1:]).strip()

            # Collect tags ABOVE scenario
            tag_matches = re.findall(r"^\s*@\w+", cleaned_text, flags=re.MULTILINE)

            full_scenario = f"{scenario_body}"
            scenarios.append({
                "name": scenario_name,
                "text": full_scenario,
                "tags": set(tag_matches),
            })

        results = []

        # -------------------------------
        # Execute scenarios
        # -------------------------------
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
                    body=body,
                )

                status = response.get("status", 0)
                response_body = response.get("response")

                # -------------------------------
                # Status validation (tag-aware)
                # -------------------------------
                passed = self._validate_status(
                    actual_status=status,
                    expectations=expectations,
                    is_negative=is_negative,
                )

                # -------------------------------
                # Schema validation (strict)
                # -------------------------------
                schema_result = self._validate_response_schema(
                    url=response["url"],
                    method=method,
                    status_code=status,
                    response_body=response_body,
                )

                if schema_result.get("schema_found") and not schema_result.get("schema_valid"):
                    passed = False

                results.append({
                    "scenario": scenario_name,
                    "tags": list(tags),
                    "request_body": body,
                    "url": response["url"],
                    "method": method,
                    "status": status,
                    "response": response_body,
                    "schema_validation": schema_result,
                    "result": "passed" if passed else "failed",
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
                    "result": "failed",
                })

        # -------------------------------
        # Generate report
        # -------------------------------
        final_input = json.dumps({
            "results": results,
            "curl_commands": [],
        })

        report_json = self._generate_html_report(state, final_input)
        state.execution_output = json.loads(report_json).get("execution_output")

    except Exception as e:
        state.execution_output = {"error": str(e)}

    return state



----------------------------
tags = self._extract_tags(full_scenario)
is_negative = "@negative" in tags

status_passed = self._validate_status(status, expectations, is_negative)

schema_result = self._validate_response_schema(
    url=response["url"],
    method=method,
    status_code=status,
    response_body=response_body
)

schema_passed = True
if schema_result.get("schema_found"):
    if not schema_result.get("schema_valid"):
        schema_passed = False

final_passed = status_passed and schema_passed


----------------------------------------------------------------------

def _validate_status(self, actual_status: int, expectations: list, is_negative: bool) -> bool:
    # Explicit expectations always win
    if expectations:
        for rule in expectations:
            if rule[0] == "exact" and actual_status != rule[1]:
                return False
            if rule[0] == "or" and actual_status not in rule[1]:
                return False
            if rule[0] == "range" and not (rule[1] <= actual_status <= rule[2]):
                return False
        return True

    # No explicit expectation → infer
    if is_negative:
        return 400 <= actual_status <= 599
    else:
        return 200 <= actual_status <= 299




-----------------------------------------------
def _extract_http_call(self, scenario_text: str):
    print("[DEBUG] ENTERED _extract_http_call", file=sys.stderr, flush=True)

    method = None
    url = None
    body = None

    lines = scenario_text.splitlines()

    for line in lines:
        line = line.strip()
        if not line.lower().startswith("when"):
            continue

        print(f"[DEBUG] inspecting WHEN line: {line}", file=sys.stderr, flush=True)

        patterns = [
            r'When\s+I\s+(GET|POST|PUT|DELETE|PATCH)\s+to\s+["\']?(/[\w\-\/{}]+)["\']?(?:\s|$)',
            r'When\s+I\s+(GET|POST|PUT|DELETE|PATCH)\s+["\']?(/[\w\-\/{}]+)["\']?(?:\s|$)',
            r'When\s+the\s+client\s+sends\s+a\s+(GET|POST|PUT|DELETE|PATCH)\s+request\s+to\s+["\']?(/[\w\-\/{}]+)["\']?(?:\s|$)',
            r'When\s+I\s+send\s+a\s+(GET|POST|PUT|DELETE|PATCH)\s+request\s+to\s+["\']?(/[\w\-\/{}]+)["\']?(?:\s|$)',
        ]

        for p in patterns:
            m = re.match(p, line, re.IGNORECASE)
            if m:
                method = m.group(1).upper()
                url = m.group(2)
                break

        if method and url:
            break

    if not method or not url:
        raise ValueError(f"HTTP method or URL not found.\nScenario:\n{scenario_text}")

    # Extra safety
    url = url.strip('\'"')

    body_match = re.search(r'"""(.*?)"""', scenario_text, re.DOTALL)
    if body_match:
        raw_body = body_match.group(1).strip()
        body = json.dumps(json.loads(raw_body))

    print(f"[DEBUG] RETURNING {method} {url} body={body}", file=sys.stderr, flush=True)
    return method, url, body

