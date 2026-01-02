def _get_base_url_from_spec(self, spec: Dict[str, Any]) -> str:
        servers = spec.get("servers", [])
        if not servers:
            raise ValueError("No servers defined in OpenAPI spec")
        return servers[0]["url"].rstrip("/")

    
    def _extract_http_call(self, scenario_text: str):
        method = None
        url = None
        body = None

        for line in scenario_text.splitlines():
            line = line.strip()

            # STRICTLY match WHEN lines only
            if not line.lower().startswith("when"):
                continue

            # Case 1: When I POST to /path
            m = re.match(
                r"When\s+I\s+(GET|POST|PUT|DELETE|PATCH)\s+to\s+(/[\w\-\/{}]+)",
                line,
                re.IGNORECASE
            )
            if m:
                method = m.group(1).upper()
                url = m.group(2)
                break

            # Case 2: When I POST /path
            m = re.match(
                r"When\s+I\s+(GET|POST|PUT|DELETE|PATCH)\s+(/[\w\-\/{}]+)",
                line,
                re.IGNORECASE
            )
            if m:
                method = m.group(1).upper()
                url = m.group(2)
                break

            # Case 3: legacy
            m = re.match(
                r"When\s+I\s+send\s+a\s+(GET|POST|PUT|DELETE|PATCH)\s+request\s+to\s+(/[\w\-\/{}]+)",
                line,
                re.IGNORECASE
            )
            if m:
                method = m.group(1).upper()
                url = m.group(2)
                break

        # OPTIONAL: extract body if present
        for line in scenario_text.splitlines():
            if "payload" in line.lower() or "body:" in line.lower():
                body = None  # keep as None, payload handled elsewhere
                break

        if not method or not url:
            raise ValueError(
                f"HTTP method or URL not found.\nScenario:\n{scenario_text}"
            )

        return method, url, body

    def _extract_expected_status(self, scenario_text: str):
        rules = []

        for line in scenario_text.splitlines():
            l = line.lower()

            if "status should be in range" in l:
                nums = list(map(int, re.findall(r"\d+", l)))
                rules.append(("range", nums[0], nums[1]))

            elif "status should be" in l and "or" in l:
                nums = list(map(int, re.findall(r"\d+", l)))
                rules.append(("or", nums))

            elif "status should be" in l:
                num = int(re.findall(r"\d+", l)[0])
                rules.append(("exact", num))

            elif "should succeed" in l:
                rules.append(("range", 200, 299))

            elif "should fail" in l:
                rules.append(("range", 400, 599))

        return rules
    
    def _validate_status(self, actual: int, rules: List):
        if not rules:
            return True

        for rule in rules:
            if rule[0] == "exact" and actual != rule[1]:
                return False
            if rule[0] == "or" and actual not in rule[1]:
                return False
            if rule[0] == "range" and not (rule[1] <= actual <= rule[2]):
                return False

        return True

    # ------------------------------------------------------------------
    # CORE EXECUTION
    # ------------------------------------------------------------------
    def __call__(self, state, batch_size: int = 10):
        try:
            self.auth_handler = AuthHandler(state.project_path)
            
            # Log auth status (to stderr to not interfere with JSON output)
            if self.auth_handler.is_authenticated():
                print(f"[TEST] Authentication: {self.auth_handler.get_auth_summary()}", file=sys.stderr, flush=True)
            else:
                print("[TEST] Running tests without authentication", file=sys.stderr, flush=True)
            
            openapi_dir = os.path.join(state.project_path, "output")
            filepath = self._find_latest_openapi_spec(openapi_dir)
            with open(filepath, "r", encoding="utf-8") as f:
                if filepath.endswith((".yaml", ".yml")):
                    state.analysis = yaml.safe_load(f)
                else:
                    state.analysis = json.load(f)

            self.schema_validator = SchemaValidator(state.analysis)
            base_url = self._get_base_url_from_spec(state.analysis)

            # Remove Feature: lines
            cleaned_text = re.sub(r"^\s*Feature:.*$", "", state.feature_text, flags=re.MULTILINE)

            # Remove tags like @smoke @edge @performance
            cleaned_text = re.sub(r"^\s*(?:@\w[\w-]*\s*)+", "", cleaned_text, flags=re.MULTILINE)

            # Remove comments starting with "#"
            cleaned_text = re.sub(r"^\s*#.*$", "", cleaned_text, flags=re.MULTILINE)

            cleaned_text = re.sub(r"\n{2,}", "\n", cleaned_text).strip()

            # Split using MULTILINE regex inside the pattern
            raw_scenarios = re.split(r"(?m)^\s*Scenario:\s*", cleaned_text)

            scenarios = []
            for chunk in raw_scenarios:
                chunk = chunk.strip()
                if not chunk:
                    continue

                # First line = scenario name
                lines = chunk.split("\n")
                scenario_name = lines[0].strip()

                # Rest of lines form the body (Given/When/Then)
                scenario_body = "\n".join(lines[1:]).strip()

                # Rebuild scenario in proper gherkin format
                full_scenario = f"Scenario: {scenario_name}\n{scenario_body}"


                scenarios.append({
                    "name": scenario_name,
                    "text": full_scenario,
                })

            results = []

            for scenario in scenarios:
                scenario_name = scenario["name"]
                full_scenario = scenario["text"]
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

                    passed = self._validate_status(status, expectations)

                    schema_result = self._validate_response_schema(
                        url=response["url"],
                        method=method,
                        status_code=status,
                        response_body=response_body
                    )
                    if schema_result.get("schema_found") and not schema_result.get("schema_valid"):
                        passed = False

                    results.append({
                        "scenario": scenario_name,
                        "request_body": body,
                        "url": response["url"],
                        "method": method,
                        "status": status,
                        "response": response_body,
                        "schema_validation": schema_result,
                        "result": "passed" if passed else "failed"
                    })

                except Exception as e:
                    results.append({
                        "scenario": scenario_name,
                        "request_body": None,
                        "url": "",
                        "method": "",
                        "status": 0,
                        "response": str(e),
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
