// --------------------------------------------
// Label → Tag mapping
// --------------------------------------------
const LABEL_TO_TAG: Record<string, string> = {
  "happy path": "@smoke",
  "happy": "@smoke",
  "smoke": "@smoke",
  "edge": "@edge",
  "negative": "@negative",
  "error": "@negative",
  "security": "@security",
  "performance": "@performance",
  "perf": "@performance",
};

// --------------------------------------------
// Non-functional tags
// --------------------------------------------
const NON_FUNCTIONAL_TAGS = new Set<string>([
  "@security",
  "@performance",
]);

function mockBddGenerator(_: string): string {
  return `Feature: Default API Endpoint

  @smoke
  Scenario: Happy Path
    Given an API endpoint "/example"
    When I send a valid POST request
    Then I should receive a 200 OK response

  @performance
  Scenario: Response time baseline
    Given an API endpoint "/example"
    When I measure a valid POST request
    Then response time should be under 500 milliseconds

  @security
  Scenario: SQL Injection attempt
    Given an API endpoint "/example"
    When I send a malicious payload "' OR 1=1 --"
    Then the API should respond with a 4xx or sanitized response
`;
}

function normalizeScenario(scText: string): {
  normalizedText: string;
  detectedTags: Set<string>;
} {
  const detectedTags = new Set<string>();

  // 1) Collect explicit @tags
  const found = scText.match(/@([a-zA-Z_]+)/g) || [];
  for (const t of found) {
    detectedTags.add("@" + t.slice(1).toLowerCase());
  }

  const lines = scText.split(/\r?\n/);
  if (!lines.length) {
    return { normalizedText: scText, detectedTags };
  }

  // 2) Detect "(Security)" in Scenario title
  let firstIdx = 0;
  while (firstIdx < lines.length && !lines[firstIdx].trim()) {
    firstIdx++;
  }

  if (firstIdx >= lines.length) {
    return { normalizedText: scText, detectedTags };
  }

  const firstLine = lines[firstIdx];
  const match = firstLine.match(/\(([^)]+)\)\s*$/);

  if (match) {
    const label = match[1].trim().toLowerCase();
    const tag = LABEL_TO_TAG[label];
    if (tag) {
      detectedTags.add(tag);
      lines[firstIdx] = firstLine.replace(/\s*\([^)]+\)\s*$/, "");
    }
  }

  return {
    normalizedText: lines.join("\n"),
    detectedTags,
  };
}

import * as fs from "fs";
import * as path from "path";

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

    // -------- Scenario grouping logic --------
    const scenarios: string[] = [];
    let curLines: string[] = [];
    let prevNonEmpty: string[] = [];

    let i = 1;
    while (i < lines.length) {
      const ln = lines[i].replace(/\n$/, "");

      if (!ln.trim()) {
        if (curLines.length) curLines.push(ln);
        i++;
        continue;
      }

      const stripped = ln.trimStart();

      // @tag line
      if (stripped.startsWith("@")) {
        let j = i + 1;
        let nextNonEmpty: string | null = null;

        while (j < lines.length) {
          const c = lines[j].trim();
          if (c) {
            nextNonEmpty = c;
            break;
          }
          j++;
        }

        if (nextNonEmpty?.startsWith("Scenario:")) {
          prevNonEmpty.push(ln);
        } else if (curLines.length) {
          curLines.push(ln);
        } else {
          prevNonEmpty.push(ln);
        }
        i++;
        continue;
      }

      // Scenario line
      if (stripped.startsWith("Scenario:")) {
        if (curLines.length) {
          scenarios.push(curLines.join("\n").trimEnd());
          curLines = [];
        }

        for (let k = prevNonEmpty.length - 1; k >= 0; k--) {
          if (prevNonEmpty[k].trim().startsWith("@")) {
            curLines.unshift(prevNonEmpty[k]);
          } else {
            break;
          }
        }
        prevNonEmpty = [];

        curLines.push(stripped);
        i++;
        continue;
      }

      if (curLines.length) {
        curLines.push(ln);
      } else {
        prevNonEmpty.push(ln);
      }

      i++;
    }

    if (curLines.length) {
      scenarios.push(curLines.join("\n").trimEnd());
    }

    // -------- Classification --------
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

const gherkinText =
  response.data.feature_text || response.data;

writeTaggedFeatures(workspacePath, gherkinText);


const existingTagLines = new Set(
  lines.filter(l => l.trim().startsWith("@")).map(l => l.trim())
);

const newTagLines = [...detectedTags]
  .filter(t => !existingTagLines.has(t))
  .map(t => t);

if (newTagLines.length) {
  lines.splice(firstIdx, 0, ...newTagLines.map(t => `  ${t}`));
}

return {
  normalizedText: lines.join("\n"),
  detectedTags,
};
