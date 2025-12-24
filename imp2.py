2️⃣ Normalize a Scenario (very simple)
function normalizeScenario(text: string) {
  const tags = new Set<string>();

  // existing @tags
  const found = text.match(/@\w+/g) || [];
  found.forEach(t => tags.add(t.toLowerCase()));

  // label in title: Scenario: XYZ (Security)
  const lines = text.split("\n");
  const titleIdx = lines.findIndex(l => l.trim().startsWith("Scenario:"));

  if (titleIdx >= 0) {
    const m = lines[titleIdx].match(/\(([^)]+)\)\s*$/);
    if (m) {
      const label = m[1].toLowerCase();
      const tag = LABEL_TO_TAG[label];
      if (tag) tags.add(tag);
      lines[titleIdx] = lines[titleIdx].replace(/\s*\([^)]+\)\s*$/, "");
    }
  }

  return { text: lines.join("\n"), tags };
}

3️⃣ Simple splitter + writer
import * as fs from "fs";
import * as path from "path";

export function splitAndWriteFeatures(
  workspacePath: string,
  gherkinText: string
) {
  const base = path.join(workspacePath, "bdd_tests");
  const funcDir = path.join(base, "functional");
  const nonFuncDir = path.join(base, "non_functional");

  fs.mkdirSync(funcDir, { recursive: true });
  fs.mkdirSync(nonFuncDir, { recursive: true });

  // clear old files
  [funcDir, nonFuncDir].forEach(dir => {
    fs.readdirSync(dir).forEach(f => {
      if (f.endsWith(".feature")) fs.unlinkSync(path.join(dir, f));
    });
  });

  // split by Feature
  const features = gherkinText.split(/(?=Feature:)/);

  for (const featureBlock of features) {
    if (!featureBlock.trim()) continue;

    const lines = featureBlock.split("\n");
    const featureName = lines[0].replace("Feature:", "").trim();
    const fileName = featureName.toLowerCase().replace(/\s+/g, "_") + ".feature";

    const scenarios = featureBlock.split(/(?=@|Scenario:)/).filter(s =>
      s.includes("Scenario:")
    );

    const funcScenarios: string[] = [];
    const nonFuncScenarios: string[] = [];

    for (const sc of scenarios) {
      const { text, tags } = normalizeScenario(sc);
      const isNonFunc = [...tags].some(t => NON_FUNCTIONAL_TAGS.has(t));

      if (isNonFunc) nonFuncScenarios.push(text);
      else funcScenarios.push(text);
    }

    if (funcScenarios.length) {
      fs.writeFileSync(
        path.join(funcDir, fileName),
        `Feature: ${featureName}\n\n  # Functional scenarios\n\n${funcScenarios.join("\n\n")}\n`
      );
    }

    if (nonFuncScenarios.length) {
      fs.writeFileSync(
        path.join(nonFuncDir, fileName),
        `Feature: ${featureName}\n\n  # Non-functional scenarios\n\n${nonFuncScenarios.join("\n\n")}\n`
      );
    }
  }
}

4️⃣ Call it from generateBDD
const gherkinText = response.data.feature_text || response.data;

splitAndWriteFeatures(workspacePath, gherkinText);
