// ============================================================================
// FIXED VERSION - Complete normalizeScenario and writeTaggedFeatures
// ============================================================================

const LABEL_TO_TAG: Record<string, string> = {
  security: "@security",
  edge: "@edge",
  performance: "@performance",
  accessibility: "@accessibility",
  usability: "@usability",
  reliability: "@reliability",
  scalability: "@scalability",
  compatibility: "@compatibility",
};

const NON_FUNCTIONAL_TAGS = new Set([
  "@security",
  "@performance",
  "@accessibility",
  "@usability",
  "@reliability",
  "@scalability",
  "@compatibility",
  "@load",
  "@stress",
  "@volume",
]);

// ============================================================================
// FIXED normalizeScenario function
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

  // --------------------------------------------------
  // 1. Find Scenario line
  // --------------------------------------------------
  let scenarioIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith("Scenario:") || trimmed.startsWith("Scenario Outline:")) {
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
  const existingTagLines = new Map<string, number>(); // tag -> line index

  for (let i = scenarioIdx - 1; i >= 0; i--) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith("@")) {
      const tags = trimmed.split(/\s+/).filter(t => t.startsWith("@"));
      tags.forEach(tag => {
        detectedTags.add(tag.toLowerCase());
        if (!existingTagLines.has(tag.toLowerCase())) {
          existingTagLines.set(tag.toLowerCase(), i);
        }
      });
      tagBlockStart = i;
    } else if (trimmed === "") {
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
  // 4. Build final tag list (sorted, unique)
  // --------------------------------------------------
  const finalTags = Array.from(detectedTags).sort();

  // --------------------------------------------------
  // 5. Replace tag block with normalized tags
  // --------------------------------------------------
  const indent = lines[scenarioIdx].match(/^\s*/)?.[0] ?? "";
  const finalTagLines = finalTags.map(t => `${indent}${t}`);

  // Remove old tag block
  if (tagBlockStart < scenarioIdx) {
    lines.splice(tagBlockStart, scenarioIdx - tagBlockStart);
    scenarioIdx = tagBlockStart;
  }

  // Insert new tag block
  lines.splice(scenarioIdx, 0, ...finalTagLines);

  return {
    normalizedText: lines.join("\n"),
    detectedTags,
  };
}

// ============================================================================
// FIXED writeTaggedFeatures function
// ============================================================================
export function writeTaggedFeatures(
  projectPath: string,
  gherkinText: string
): string[] {
  const baseDir = path.join(projectPath, "bdd_tests");
  const funcDir = path.join(baseDir, "functional");
  const nonFuncDir = path.join(baseDir, "non_functional");

  fs.mkdirSync(funcDir, { recursive: true });
  fs.mkdirSync(nonFuncDir, { recursive: true });

  // Clear old feature files
  for (const dir of [funcDir, nonFuncDir]) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (f.endsWith(".feature")) {
        fs.unlinkSync(path.join(dir, f));
      }
    }
  }

  // DEBUG: Count input scenarios
  const inputScenarioCount = (gherkinText.match(/^\s*(Scenario|Scenario Outline):/gm) || []).length;
  console.log(`[DEBUG] Input total scenarios: ${inputScenarioCount}`);

  const featureBlocks = gherkinText.split(/(?=^Feature:)/m);
  const written: string[] = [];
  let totalProcessedScenarios = 0;

  for (const rawBlock of featureBlocks) {
    const block = rawBlock.trim();
    if (!block || !block.startsWith("Feature:")) continue;

    const lines = block.split(/\r?\n/);
    if (!lines.length) continue;

    // Extract feature title
    const featTitle = lines[0].replace(/^Feature:\s*/, "").trim();
    const safeFile = featTitle.toLowerCase().replace(/[^a-z0-9]+/g, "_") + ".feature";

    const funcBuffer: string[] = [
      `Feature: ${featTitle}`,
      "",
      "  # Functional scenarios",
    ];

    const nonFuncBuffer: string[] = [
      `Feature: ${featTitle}`,
      "",
      "  # Non-functional scenarios",
    ];

    let hasFunc = false;
    let hasNonFunc = false;

    // -------- FIXED Scenario grouping logic --------
    const scenarios: string[] = [];
    let curLines: string[] = [];
    let pendingTagLines: string[] = [];

    for (let i = 1; i < lines.length; i++) {
      const ln = lines[i];
      const trimmed = ln.trim();

      // Empty line
      if (!trimmed) {
        if (curLines.length) {
          curLines.push(ln);
        }
        continue;
      }

      // Tag line
      if (trimmed.startsWith("@")) {
        // Look ahead to see if next non-empty line is a Scenario
        let isBeforeScenario = false;
        for (let j = i + 1; j < lines.length; j++) {
          const nextTrimmed = lines[j].trim();
          if (!nextTrimmed) continue;
          if (nextTrimmed.startsWith("Scenario:") || nextTrimmed.startsWith("Scenario Outline:")) {
            isBeforeScenario = true;
          }
          break;
        }

        if (isBeforeScenario) {
          pendingTagLines.push(ln);
        } else if (curLines.length) {
          curLines.push(ln);
        } else {
          pendingTagLines.push(ln);
        }
        continue;
      }

      // Scenario line - FIX: Keep original line with indentation
      if (trimmed.startsWith("Scenario:") || trimmed.startsWith("Scenario Outline:")) {
        // Save previous scenario
        if (curLines.length) {
          scenarios.push(curLines.join("\n"));
          curLines = [];
        }

        // Add pending tags to new scenario
        curLines.push(...pendingTagLines);
        pendingTagLines = [];

        // FIX: Push original line (ln) not trimmed version
        curLines.push(ln);
        continue;
      }

      // Regular line (Given, When, Then, And, etc.)
      if (curLines.length) {
        curLines.push(ln);
      }
    }

    // Don't forget the last scenario
    if (curLines.length) {
      scenarios.push(curLines.join("\n"));
    }

    console.log(`[DEBUG] Feature "${featTitle}": ${scenarios.length} scenarios found`);
    totalProcessedScenarios += scenarios.length;

    // -------- Classification and normalization --------
    for (const sc of scenarios) {
      const { normalizedText, detectedTags } = normalizeScenario(sc);

      const isNonFunctional = [...detectedTags].some(t =>
        NON_FUNCTIONAL_TAGS.has(t)
      );

      if (isNonFunctional) {
        hasNonFunc = true;
        nonFuncBuffer.push("", normalizedText);
      } else {
        hasFunc = true;
        funcBuffer.push("", normalizedText);
      }
    }

    // -------- Write files --------
    if (hasFunc) {
      const p = path.join(funcDir, safeFile);
      fs.writeFileSync(p, funcBuffer.join("\n") + "\n");
      written.push(p);
    }

    if (hasNonFunc) {
      const p = path.join(nonFuncDir, safeFile);
      fs.writeFileSync(p, nonFuncBuffer.join("\n") + "\n");
      written.push(p);
    }
  }

  console.log(`[DEBUG] Output total scenarios: ${totalProcessedScenarios}`);
  console.log(`[DEBUG] Difference: ${inputScenarioCount - totalProcessedScenarios} scenarios`);

  if (inputScenarioCount !== totalProcessedScenarios) {
    console.warn(`[WARNING] Scenario count mismatch! Input: ${inputScenarioCount}, Output: ${totalProcessedScenarios}`);
  }

  return written;
}

// ============================================================================
// Usage
// ============================================================================
const gherkinText = response.data.feature_text || response.data;
writeTaggedFeatures(workspacePath, gherkinText);
