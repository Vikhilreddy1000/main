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
            r"When\s+I\s+(GET|POST|PUT|DELETE|PATCH)\s+to\s+(/[\w\-\/{}]+)(?:\s|$)",
            r"When\s+I\s+(GET|POST|PUT|DELETE|PATCH)\s+(/[\w\-\/{}]+)(?:\s|$)",
            r"When\s+the\s+client\s+sends\s+a\s+(GET|POST|PUT|DELETE|PATCH)\s+request\s+to\s+(/[\w\-\/{}]+)(?:\s|$)",
            r"When\s+I\s+send\s+a\s+(GET|POST|PUT|DELETE|PATCH)\s+request\s+to\s+(/[\w\-\/{}]+)(?:\s|$)",
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

    body_match = re.search(r'"""(.*?)"""', scenario_text, re.DOTALL)
    if body_match:
        raw_body = body_match.group(1).strip()
        body = json.dumps(json.loads(raw_body))

    print(f"[DEBUG] RETURNING {method} {url} body={body}", file=sys.stderr, flush=True)
    return method, url, body
