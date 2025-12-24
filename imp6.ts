function normalizeScenario(scText: string): {
  normalizedText: string;
  detectedTags: Set<string>;
} {
  const detectedTags = new Set<string>();
  const lines = scText.split(/\r?\n/);

  if (!lines.length) {
    return { normalizedText: scText, detectedTags };
  }

  // --------------------------------------------------
  // 1. Find Scenario line
  // --------------------------------------------------
  let scenarioIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().startsWith("Scenario:")) {
      scenarioIdx = i;
      break;
    }
  }

  if (scenarioIdx === -1) {
    return { normalizedText: scText, detectedTags };
  }

  // --------------------------------------------------
  // 2. Collect ALL existing @tags above Scenario
  // --------------------------------------------------
  let tagBlockStart = scenarioIdx;
  const existingTags = new Set<string>();

  for (let i = scenarioIdx - 1; i >= 0; i--) {
    const t = lines[i].trim();
    if (t.startsWith("@")) {
      existingTags.add(t.toLowerCase());
      tagBlockStart = i;
    } else if (t === "") {
      continue;
    } else {
      break;
    }
  }

  // --------------------------------------------------
  // 3. Detect label suffix: "(Security)", "(Edge)", etc
  // --------------------------------------------------
  const scenarioLine = lines[scenarioIdx];
  const labelMatch = scenarioLine.match(/\(([^)]+)\)\s*$/);

  if (labelMatch) {
    const label = labelMatch[1].trim().toLowerCase();
    const tag = LABEL_TO_TAG[label];
    if (tag) {
      detectedTags.add(tag);
    }

    // Remove label from Scenario title
    lines[scenarioIdx] = scenarioLine.replace(/\s*\([^)]+\)\s*$/, "");
  }

  // --------------------------------------------------
  // 4. Merge existing + detected tags
  // --------------------------------------------------
  for (const t of existingTags) {
    detectedTags.add(t);
  }

  // --------------------------------------------------
  // 5. FORCE-INJECT ALL TAGS ABOVE SCENARIO
  // --------------------------------------------------
  const indent = lines[scenarioIdx].match(/^\s*/)?.[0] ?? "";

  const finalTagLines = [...detectedTags]
    .sort()
    .map(t => `${indent}${t}`);

  // Remove old tag block completely
  if (tagBlockStart < scenarioIdx) {
    lines.splice(tagBlockStart, scenarioIdx - tagBlockStart);
    scenarioIdx = tagBlockStart;
  }

  // Insert enforced tag block
  lines.splice(scenarioIdx, 0, ...finalTagLines);

  return {
    normalizedText: lines.join("\n"),
    detectedTags,
  };
}
