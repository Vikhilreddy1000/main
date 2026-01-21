function splitScenarios(lines: string[]): number[] {
  const indices: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().startsWith("Scenario:")) {
      indices.push(i);
    }
  }
  return indices;
}












function normalizeScenarios(scText: string): {
  normalizedText: string;
  detectedTags: Set<string>;
} {
  const lines = scText.split(/\r?\n/);
  const scenarioIndices = splitScenarios(lines);
  const allDetectedTags = new Set<string>();

  // Process from bottom → top to avoid index shifting
  for (let s = scenarioIndices.length - 1; s >= 0; s--) {
    let scenarioIdx = scenarioIndices[s];

    // -------------------------------
    // Collect tags above this scenario
    // -------------------------------
    let tagBlockStart = scenarioIdx;
    const detectedTags = new Set<string>();

    for (let i = scenarioIdx - 1; i >= 0; i--) {
      const t = lines[i].trim();
      if (t.startsWith("@")) {
        detectedTags.add(t.toLowerCase());
        tagBlockStart = i;
      } else if (t === "") {
        continue;
      } else {
        break;
      }
    }

    // -------------------------------
    // Detect label suffix
    // -------------------------------
    const scenarioLine = lines[scenarioIdx];
    const labelMatch = scenarioLine.match(/\(([^)]+)\)\s*$/);

    if (labelMatch) {
      const label = labelMatch[1].trim().toLowerCase();
      const tag = LABEL_TO_TAG[label];
      if (tag) detectedTags.add(tag);
      lines[scenarioIdx] = scenarioLine.replace(/\s*\([^)]+\)\s*$/, "");
    }

    detectedTags.forEach(t => allDetectedTags.add(t));

    // -------------------------------
    // Replace tag block
    // -------------------------------
    const indent = lines[scenarioIdx].match(/^\s*/)?.[0] ?? "";
    const tagLines = [...detectedTags].sort().map(t => `${indent}${t}`);

    if (tagBlockStart < scenarioIdx) {
      lines.splice(tagBlockStart, scenarioIdx - tagBlockStart);
      scenarioIdx = tagBlockStart;
    }

    lines.splice(scenarioIdx, 0, ...tagLines);
  }

  return {
    normalizedText: lines.join("\n"),
    detectedTags: allDetectedTags,
  };
}
