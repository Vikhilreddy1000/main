def _is_status_then_line(line: str) -> bool:
    l = line.lower().strip()
    return (
        l.startswith("then")
        and "status" in l
        and re.search(r"\d{3}", l)
    )





async def _extract_expected_status(scenario_text: str):
    rules = []

    try:
        for line in scenario_text.splitlines():
            if not _is_status_then_line(line):
                continue

            l = line.lower().strip()
            nums = list(map(int, re.findall(r"\d{3}", l)))

            # Explicit range: "range 400 to 499"
            if "range" in l and len(nums) >= 2:
                rules.append(("range", nums[0], nums[1]))

            # OR case: "400 or 500"
            elif "or" in l and len(nums) >= 2:
                rules.append((
                    "range",
                    min(nums) // 100 * 100,
                    max(nums) // 100 * 100 + 99
                ))

            # Single status code
            elif len(nums) == 1:
                code = nums[0]

                # HTTP semantics:
                # 4xx → any client error
                # 5xx → any server error
                if code >= 400:
                    rules.append((
                        "range",
                        code // 100 * 100,
                        code // 100 * 100 + 99
                    ))
                else:
                    rules.append(("exact", code))

        return rules

    except Exception as e:
        raise TypeError("Error in extract expected status", e)


