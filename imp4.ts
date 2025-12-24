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

  // Clear old files
  [funcDir, nonFuncDir].forEach(dir => {
    if (!fs.existsSync(dir)) return;
    fs.readdirSync(dir).forEach(f => {
      if (f.endsWith(".feature")) {
        fs.unlinkSync(path.join(dir, f));
      }
    });
  });

  // Split by Feature
  const featureBlocks = gherkinText.split(/(?=Feature:)/);

  for (const featureBlock of featureBlocks) {
    if (!featureBlock.trim()) continue;

    const lines = featureBlock.split(/\r?\n/);
    const featureName = lines[0].replace("Feature:", "").trim();
    const fileName = featureName.toLowerCase().replace(/\s+/g, "_") + ".feature";

    // --- IMPORTANT ---
    // Split scenarios INCLUDING their @tags
    const scenarios = featureBlock
      .split(/\n(?=\s*@|\s*Scenario:)/)
      .filter(s => s.includes("Scenario:"));

    const funcScenarios: string[] = [];
    const nonFuncScenarios: string[] = [];

    for (const sc of scenarios) {
      const { normalizedText, detectedTags } = normalizeScenario(sc);

      const isNonFunctional = [...detectedTags].some(tag =>
        NON_FUNCTIONAL_TAGS.has(tag)
      );

      if (isNonFunctional) {
        nonFuncScenarios.push(normalizedText);
      } else {
        funcScenarios.push(normalizedText);
      }
    }

    // Write Functional
    if (funcScenarios.length) {
      fs.writeFileSync(
        path.join(funcDir, fileName),
        `Feature: ${featureName}

  # Functional scenarios

${funcScenarios.join("\n\n")}
`
      );
    }

    // Write Non-Functional
    if (nonFuncScenarios.length) {
      fs.writeFileSync(
        path.join(nonFuncDir, fileName),
        `Feature: ${featureName}

  # Non-functional scenarios

${nonFuncScenarios.join("\n\n")}
`
      );
    }
  }
}

Tags stay with scenarios

This regex is the key:

.split(/\n(?=\s*@|\s*Scenario:)/)

