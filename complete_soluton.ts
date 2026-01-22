// ============================================================================
// COMPLETE SOLUTION - Fixed normalizeScenario + Buffer validation
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

function normalizeScenario(scText: string): {
  normalizedText: string;
  detectedTags: Set<string>;
} {
  const detectedTags = new Set<string>();
  const lines = scText.split(/\r?\n/);

  if (!lines.length) {
    return { normalizedText: scText, detectedTags };
  }

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

  // Collect tags and mark lines for removal
  const linesToRemove: number[] = [];
  let firstTagIdx = scenarioIdx;

  for (let i = scenarioIdx - 1; i >= 0; i--) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith("@")) {
      const tags = trimmed.split(/\s+/).filter(t => t.startsWith("@"));
      tags.forEach(tag => detectedTags.add(tag.toLowerCase()));
      linesToRemove.push(i);
      firstTagIdx = i;
    } else if (trimmed === "") {
      if (linesToRemove.length > 0) {
        linesToRemove.push(i);
      }
    } else {
      break;
    }
  }

  // Detect label suffix
  const scenarioLine = lines[scenarioIdx];
  const labelMatch = scenarioLine.match(/\(([^)]+)\)\s*$/);

  if (labelMatch) {
    const label = labelMatch[1].trim().toLowerCase();
    const tag = LABEL_TO_TAG[label];
    if (tag) {
      detectedTags.add(tag);
    }
    lines[scenarioIdx] = scenarioLine.replace(/\s*\([^)]+\)\s*$/, "");
  }

  // Build new tags
  const finalTags = Array.from(detectedTags).sort();
  const indent = lines[scenarioIdx].match(/^\s*/)?.[0] ?? "";
  const finalTagLines = finalTags.map(t => `${indent}${t}`);

  // Remove old tag lines (reverse order to maintain indices)
  linesToRemove.sort((a, b) => b - a);
  for (const idx of linesToRemove) {
    lines.splice(idx, 1);
    if (idx < scenarioIdx) scenarioIdx--;
  }

  // Insert new tags
  lines.splice(scenarioIdx, 0, ...finalTagLines);

  const result = lines.join("\n");

  // Verify result
  if (!/^\s*(Scenario|Scenario Outline):/m.test(result)) {
    console.error("[ERROR] normalizeScenario destroyed scenario - returning original");
    return { normalizedText: scText, detectedTags };
  }

  return { normalizedText: result, detectedTags };
}

export function writeTaggedFeatures(
  projectPath: string,
  gherkinText: string
): string[] {
  const baseDir = path.join(projectPath, "bdd_tests");
  const funcDir = path.join(baseDir, "functional");
  const nonFuncDir = path.join(baseDir, "non_functional");

  fs.mkdirSync(funcDir, { recursive: true });
  fs.mkdirSync(nonFuncDir, { recursive: true });

  for (const dir of [funcDir, nonFuncDir]) {
    if (fs.existsSync(dir)) {
      for (const f of fs.readdirSync(dir)) {
        if (f.endsWith(".feature")) {
          fs.unlinkSync(path.join(dir, f));
        }
      }
    }
  }

  const inputScenarioCount = (gherkinText.match(/^\s*(Scenario|Scenario Outline):/gm) || []).length;
  console.log(`[INPUT] ${inputScenarioCount} total scenarios`);

  const featureBlocks = gherkinText.split(/(?=^Feature:)/m);
  const written: string[] = [];

  for (const rawBlock of featureBlocks) {
    const block = rawBlock.trim();
    if (!block || !block.startsWith("Feature:")) continue;

    const lines = block.split(/\r?\n/);
    const featTitle = lines[0].replace(/^Feature:\s*/, "").trim();
    const safeFile = featTitle.toLowerCase().replace(/[^a-z0-9]+/g, "_") + ".feature";

    const funcBuffer: string[] = [`Feature: ${featTitle}`, "", "  # Functional scenarios"];
    const nonFuncBuffer: string[] = [`Feature: ${featTitle}`, "", "  # Non-functional scenarios"];

    let hasFunc = false;
    let hasNonFunc = false;

    // Extract scenarios
    const scenarios: string[] = [];
    let curLines: string[] = [];
    let pendingTagLines: string[] = [];

    for (let i = 1; i < lines.length; i++) {
      const ln = lines[i];
      const trimmed = ln.trim();

      if (!trimmed) {
        if (curLines.length) curLines.push(ln);
        continue;
      }

      if (trimmed.startsWith("@")) {
        let isBeforeScenario = false;
        for (let j = i + 1; j < lines.length; j++) {
          const next = lines[j].trim();
          if (!next) continue;
          if (next.startsWith("Scenario:") || next.startsWith("Scenario Outline:")) {
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

      if (trimmed.startsWith("Scenario:") || trimmed.startsWith("Scenario Outline:")) {
        if (curLines.length) {
          scenarios.push(curLines.join("\n"));
          curLines = [];
        }
        curLines.push(...pendingTagLines);
        pendingTagLines = [];
        curLines.push(ln);
        continue;
      }

      if (curLines.length) {
        curLines.push(ln);
      }
    }

    if (curLines.length) {
      scenarios.push(curLines.join("\n"));
    }

    // Classify scenarios
    for (const sc of scenarios) {
      const { normalizedText, detectedTags } = normalizeScenario(sc);

      // ✅ Validate normalized text
      const hasScenario = /^\s*(Scenario|Scenario Outline):/m.test(normalizedText);
      if (!hasScenario) {
        console.error(`[SKIP] Invalid scenario in "${featTitle}" - no Scenario: line after normalization`);
        continue;
      }

      const isNonFunctional = [...detectedTags].some(t => NON_FUNCTIONAL_TAGS.has(t));

      if (isNonFunctional) {
        hasNonFunc = true;
        nonFuncBuffer.push("", normalizedText);
      } else {
        hasFunc = true;
        funcBuffer.push("", normalizedText);
      }
    }

    // Write files
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

  return written;
}
