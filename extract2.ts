import fs from "fs";
import path from "path";

/* ---------------- CONFIG ---------------- */

const NON_FUNCTIONAL_TAGS = new Set([
  "@performance",
  "@security",
  "@load",
  "@stress",
  "@scalability",
  "@soak",
  "@reliability",
]);

const LABEL_TO_TAG: Record<string, string> = {
  security: "@security",
  performance: "@performance",
  perf: "@performance",
  load: "@load",
  stress: "@stress",
  scalability: "@scalability",
  edge: "@edge",
};

/* ---------------- MAIN WRITER ---------------- */

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

  const featureBlocks = gherkinText.split(/(?=Feature:)/);
  const written: string[] = [];

  for (const rawBlock of featureBlocks) {
    const block = rawBlock.trim();
    if (!block) continue;

    const lines = block.split(/\r?\n/);
    if (!lines.length) continue;

    const featTitle = lines[0].replace("Feature:", "").trim();
    const safeFile = featTitle.toLowerCase().replace(/\s+/g, "_") + ".feature";

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

    /* -------- LOSSLESS SCENARIO EXTRACTION -------- */

    const scenarios = extractScenarios(lines);

    // Safety validation
    const scenarioCount = scenarios.filter(s =>
      s.includes("Scenario:")
    ).length;

    if (scenarioCount !== scenarios.length) {
      throw new Error("❌ Scenario extraction integrity error");
    }

    /* -------- CLASSIFICATION -------- */

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

    /* -------- WRITE FILES -------- */

    if (hasFunc) {
      const p = path.join(funcDir, safeFile);
      fs.writeFileSync(p, funcBuffer.join("\n").trimEnd() + "\n");
      written.push(p);
    }

    if (hasNonFunc) {
      const p = path.join(nonFuncDir, safeFile);
      fs.writeFileSync(p, nonFuncBuffer.join("\n").trimEnd() + "\n");
      written.push(p);
    }
  }

  return written;
}

/* ---------------- LOSSLESS SCENARIO EXTRACTOR ---------------- */

function extractScenarios(lines: string[]): string[] {
  const scenarios: string[] = [];

  let currentScenario: string[] | null = null;
  let tagBuffer: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Collect tags ONLY before scenario
    if (trimmed.startsWith("@") && currentScenario === null) {
      tagBuffer.push(line);
      continue;
    }

    // Scenario start
    if (trimmed.startsWith("Scenario:")) {
      // Flush previous scenario
      if (currentScenario) {
        scenarios.push(currentScenario.join("\n").trimEnd());
      }

      // Start new scenario
      currentScenario = [];
      currentScenario.push(...tagBuffer);
      tagBuffer = [];

      currentScenario.push(line);
      continue;
    }

    // Inside scenario → always append
    if (currentScenario) {
      currentScenario.push(line);
      continue;
    }

    // Outside scenario (Feature description, etc)
    tagBuffer = [];
  }

  // Flush last scenario
  if (currentScenario) {
    scenarios.push(currentScenario.join("\n").trimEnd());
  }

  return scenarios;
}

/* ---------------- NORMALIZER ---------------- */

function normalizeScenario(scText: string): {
  normalizedText: string;
  detectedTags: Set<string>;
} {
  const detectedTags = new Set<string>();
  const lines = scText.split(/\r?\n/);

  if (!lines.length) {
    return { normalizedText: scText, detectedTags };
  }

  /* -------- 1. Find Scenario line -------- */

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

  /* -------- 2. Collect existing tags above Scenario -------- */

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

  /* -------- 3. Detect label suffix "(Security)" etc -------- */

  const scenarioLine = lines[scenarioIdx];
  const labelMatch = scenarioLine.match(/\(([^)]+)\)\s*$/);

  if (labelMatch) {
    const label = labelMatch[1].trim().toLowerCase();
    const tag = LABEL_TO_TAG[label];
    if (tag) {
      detectedTags.add(tag);
    }

    // Remove label
    lines[scenarioIdx] = scenarioLine.replace(/\s*\([^)]+\)\s*$/, "");
  }

  /* -------- 4. Merge tags -------- */

  for (const t of existingTags) {
    detectedTags.add(t);
  }

  /* -------- 5. Enforce tag block -------- */

  const indent = lines[scenarioIdx].match(/^\s*/)?.[0] ?? "";

  const finalTagLines = [...detectedTags]
    .sort()
    .map(t => `${indent}${t}`);

  // Remove old tag block
  if (tagBlockStart < scenarioIdx) {
    lines.splice(tagBlockStart, scenarioIdx - tagBlockStart);
    scenarioIdx = tagBlockStart;
  }

  // Insert normalized tag block
  if (finalTagLines.length) {
    lines.splice(scenarioIdx, 0, ...finalTagLines);
  }

  return {
    normalizedText: lines.join("\n"),
    detectedTags,
  };
}

/* ---------------- USAGE ---------------- */

const gherkinText =
  response.data.feature_text || response.data;

writeTaggedFeatures(workspacePath, gherkinText);
