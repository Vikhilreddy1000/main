def _extract_expected_status(self, scenario_text: str):
    rules = []   # ✅ always initialized

    for line in scenario_text.splitlines():
        l = line.lower().strip()

        # -----------------------------------
        # RANGE EXPECTATION
        # -----------------------------------
        if "status code should be in range" in l:
            nums = list(map(int, re.findall(r"\d+", l)))
            if len(nums) >= 2:
                rules.append(("range", nums[0], nums[1]))
            continue

        # -----------------------------------
        # MULTIPLE OPTIONS (OR)
        # -----------------------------------
        if "status code should be" in l and "or" in l:
            nums = list(map(int, re.findall(r"\d+", l)))
            if nums:
                rules.append(("or", nums))
            continue

        # -----------------------------------
        # EXACT STATUS EXPECTATION
        # Supports BOTH:
        # - "status should be 200"
        # - "status code should be 200"
        # -----------------------------------
        m = re.search(r"status(?: code)? should be (\d+)", l)
        if m:
            rules.append(("exact", int(m.group(1))))
            continue

        # -----------------------------------
        # Alternative exact grammar:
        # "Then the response status code should be 201"
        # -----------------------------------
        m = re.search(r"status code should be (\d+)", l)
        if m:
            rules.append(("exact", int(m.group(1))))
            continue

        # -----------------------------------
        # succeed/fail keywords
        # -----------------------------------
        if "should succeed" in l:
            rules.append(("range", 200, 299))
            continue

        if "should fail" in l:
            rules.append(("range", 400, 599))
            continue

    return rules
