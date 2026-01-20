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
  // 2. Collect existing @tags ABOVE Scenario (NO deletion)
  // --------------------------------------------------
  for (let i = scenarioIdx - 1; i >= 0; i--) {
    const t = lines[i].trim();
    if (t.startsWith("@")) {
      detectedTags.add(t.toLowerCase());
    } else if (t === "") {
      continue;
    } else {
      break;
    }
  }

  // --------------------------------------------------
  // 3. Detect "(Security)" label
  // --------------------------------------------------
  const scenarioLine = lines[scenarioIdx];
  const labelMatch = scenarioLine.match(/\(([^)]+)\)\s*$/);

  if (labelMatch) {
    const label = labelMatch[1].trim().toLowerCase();
    const tag = LABEL_TO_TAG[label];
    if (tag) {
      detectedTags.add(tag);
    }

    // remove suffix safely
    lines[scenarioIdx] = scenarioLine.replace(/\s*\([^)]+\)\s*$/, "");
  }

  // --------------------------------------------------
  // 4. Inject missing tags ABOVE Scenario (NO SPLICE)
  // --------------------------------------------------
  const indent = lines[scenarioIdx].match(/^\s*/)?.[0] ?? "";

  const existingTagLines = new Set(
    lines
      .slice(0, scenarioIdx)
      .map(l => l.trim().toLowerCase())
      .filter(l => l.startsWith("@"))
  );

  const tagsToInsert = [...detectedTags]
    .filter(t => !existingTagLines.has(t))
    .sort()
    .map(t => `${indent}${t}`);

  if (tagsToInsert.length > 0) {
    lines.splice(scenarioIdx, 0, ...tagsToInsert);
  }

  return {
    normalizedText: lines.join("\n"),
    detectedTags,
  };
}
