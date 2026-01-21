function extractScenarios(lines: string[]): string[] {
  const scenarios: string[] = [];

  let currentScenario: string[] | null = null;
  let pendingTags: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Tag line (only valid if no scenario started yet)
    if (trimmed.startsWith("@") && currentScenario === null) {
      pendingTags.push(line);
      continue;
    }

    // 🚨 Scenario start — ALWAYS authoritative
    if (trimmed.startsWith("Scenario:")) {
      // Flush previous scenario
      if (currentScenario) {
        scenarios.push(currentScenario.join("\n").trimEnd());
      }

      currentScenario = [];
      currentScenario.push(...pendingTags);
      pendingTags = [];

      currentScenario.push(line);
      continue;
    }

    // Inside scenario → keep everything
    if (currentScenario) {
      currentScenario.push(line);
      continue;
    }

    // Outside scenario → DO NOT clear pendingTags blindly
    if (trimmed !== "") {
      pendingTags = [];
    }
  }

  // Flush last scenario
  if (currentScenario) {
    scenarios.push(currentScenario.join("\n").trimEnd());
  }

  return scenarios;
}

// Remove old tag block
if (tagBlockStart < scenarioIdx) {
  lines.splice(tagBlockStart, scenarioIdx - tagBlockStart);
  scenarioIdx = tagBlockStart;
}

// Remove blank lines ABOVE Scenario
while (scenarioIdx > 0 && lines[scenarioIdx - 1].trim() === "") {
  lines.splice(scenarioIdx - 1, 1);
  scenarioIdx--;
}

// Insert enforced tag block
if (finalTagLines.length) {
  lines.splice(scenarioIdx, 0, ...finalTagLines);
}

// 🚨 Remove blank lines BETWEEN tags and Scenario
if (finalTagLines.length) {
  const scenarioLineIdx = scenarioIdx + finalTagLines.length;
  while (
    scenarioLineIdx < lines.length &&
    lines[scenarioLineIdx].trim() === ""
  ) {
    lines.splice(scenarioLineIdx, 1);
  }
}
