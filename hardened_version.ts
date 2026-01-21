// ============================================================================
// HARDENED VERSION - With safety checks to prevent scenario loss
// ============================================================================

function normalizeScenario(scText: string): {
  normalizedText: string;
  detectedTags: Set<string>;
} {
  const detectedTags = new Set<string>();
  const lines = scText.split(/\r?\n/);

  if (!lines.length) {
    return { normalizedText: scText, detectedTags };
  }

  // 🔒 SAFETY CHECK #1: Ensure this is a single scenario
  const scenarioCount = (scText.match(/^\s*(Scenario|Scenario Outline):/gm) || []).length;
  if (scenarioCount === 0) {
    console.error("[ERROR] normalizeScenario called with non-scenario text!");
    return { normalizedText: scText, detectedTags };
  }
  if (scenarioCount > 1) {
    console.error(`[ERROR] normalizeScenario called with ${scenarioCount} scenarios merged!`);
    console.error("This should never happen - check scenario extraction logic");
    return { normalizedText: scText, detectedTags };
  }

  // Find the ONE scenario line
  let scenarioIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith("Scenario:") || trimmed.startsWith("Scenario Outline:")) {
      scenarioIdx = i;
      break;
    }
  }

  if (scenarioIdx === -1) {
    console.error("[ERROR] No Scenario: line found in text!");
    return { normalizedText: scText, detectedTags };
  }

  // Collect existing @tags ONLY from lines ABOVE the scenario
  let tagBlockStart = scenarioIdx;
  const existingTagLines = new Map<string, number>();

  for (let i = scenarioIdx - 1; i >= 0; i--) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith("@")) {
      const tags = trimmed.split(/\s+/).filter(t => t.startsWith("@"));
      tags.forEach(tag => {
        const lowerTag = tag.toLowerCase();
        detectedTags.add(lowerTag);
        if (!existingTagLines.has(lowerTag)) {
          existingTagLines.set(lowerTag, i);
        }
      });
      tagBlockStart = i;
    } else if (trimmed === "") {
      continue;
    } else {
      // Non-tag, non-empty line - stop looking for tags
      break;
    }
  }

  // Detect label suffix: "(Security)", "(Edge)", etc
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

  // Build final tag list
  const finalTags = Array.from(detectedTags).sort();
  const indent = lines[scenarioIdx].match(/^\s*/)?.[0] ?? "";
  const finalTagLines = finalTags.map(t => `${indent}${t}`);

  // 🔒 SAFETY CHECK #2: Only remove lines that are ACTUALLY tags
  const linesToRemove = [];
  for (let i = tagBlockStart; i < scenarioIdx; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith("@") || trimmed === "") {
      linesToRemove.push(i);
    }
  }

  // Remove from end to start to preserve indices
  for (let i = linesToRemove.length - 1; i >= 0; i--) {
    lines.splice(linesToRemove[i], 1);
    scenarioIdx--;  // Adjust scenario index
  }

  // Insert new tag block
  lines.splice(scenarioIdx, 0, ...finalTagLines);

  const result = lines.join("\n");

  // 🔒 SAFETY CHECK #3: Verify output still has exactly 1 scenario
  const outputScenarioCount = (result.match(/^\s*(Scenario|Scenario Outline):/gm) || []).length;
  if (outputScenarioCount !== 1) {
    console.error(`[ERROR] normalizeScenario output has ${outputScenarioCount} scenarios instead of 1!`);
    console.error("Input:", scText.substring(0, 200));
    console.error("Output:", result.substring(0, 200));
    return { normalizedText: scText, detectedTags };  // Return original on error
  }

  return {
    normalizedText: result,
    detectedTags,
  };
}


// ============================================================================
// UPDATED writeTaggedFeatures with better scenario separation
// ============================================================================
export function writeTaggedFeatures(
  projectPath: string,
  gherkinText: string
): string[] {
  // ... [previous code same as before until classification] ...

  // -------- IMPROVED Classification and normalization --------
  for (let idx = 0; idx < scenarios.length; idx++) {
    const sc = scenarios[idx];

    // 🔒 Verify this is a single complete scenario
    const preNormalizeCount = (sc.match(/^\s*(Scenario|Scenario Outline):/gm) || []).length;

    if (preNormalizeCount === 0) {
      console.error(`[ERROR] Scenario #${idx+1} has no Scenario: line - skipping`);
      continue;
    }

    if (preNormalizeCount > 1) {
      console.error(`[ERROR] Scenario #${idx+1} contains ${preNormalizeCount} merged scenarios!`);
      console.error("Splitting may be broken. First 200 chars:", sc.substring(0, 200));
      // Try to process anyway
    }

    const { normalizedText, detectedTags } = normalizeScenario(sc);

    // 🔒 Verify normalization didn't lose the scenario
    const postNormalizeCount = (normalizedText.match(/^\s*(Scenario|Scenario Outline):/gm) || []).length;

    if (postNormalizeCount === 0) {
      console.error(`[ERROR] Scenario #${idx+1} lost during normalization!`);
      console.error("Original:", sc.substring(0, 200));
      console.error("After normalize:", normalizedText.substring(0, 200));
      continue;  // Skip this broken scenario
    }

    const isNonFunctional = [...detectedTags].some(t =>
      NON_FUNCTIONAL_TAGS.has(t)
    );

    if (isNonFunctional) {
      hasNonFunc = true;
      nonFuncBuffer.push("", normalizedText);
      nonFuncCount++;
    } else {
      hasFunc = true;
      funcBuffer.push("", normalizedText);
      funcCount++;
    }
  }

  // ... [rest of code same] ...
}
