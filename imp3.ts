import * as fs from "fs";
import * as path from "path";

function clearOutputDir(dir: string) {
  if (!fs.existsSync(dir)) return;
  fs.readdirSync(dir).forEach(file => {
    if (file.endsWith(".feature")) {
      fs.unlinkSync(path.join(dir, file));
    }
  });
}

export function saveUpdatedFeatureFiles(
  workspacePath: string,
  featureText: string
): string {
  const outputDir = path.join(workspacePath, "bdd_tests");

  fs.mkdirSync(outputDir, { recursive: true });
  clearOutputDir(outputDir);

  const featureBlocks = featureText
    .split(/(?=Feature:)/g)
    .map(f => f.trim())
    .filter(f => f.length > 0);

  featureBlocks.forEach((block, index) => {
    const match = block.match(/Feature:\s*(.+)/);
    const name = match
      ? match[1].trim().replace(/\s+/g, "_").toLowerCase()
      : `feature_${index}`;

    const filePath = path.join(outputDir, `${name}.feature`);
    fs.writeFileSync(filePath, block, "utf-8");
  });

  return outputDir;
}


export function splitAndWriteFeatures(
  workspacePath: string,
  gherkinText: string
): string {
  const base = path.join(workspacePath, "bdd_tests");
  const funcDir = path.join(base, "functional");
  const nonFuncDir = path.join(base, "non_functional");

  fs.mkdirSync(funcDir, { recursive: true });
  fs.mkdirSync(nonFuncDir, { recursive: true });

  clearOutputDir(funcDir);
  clearOutputDir(nonFuncDir);

  const features = gherkinText.split(/(?=Feature:)/);
  const updatedFeatureBlocks: string[] = [];

  for (const featureBlock of features) {
    if (!featureBlock.trim()) continue;

    const lines = featureBlock.split("\n");
    const featureName = lines[0].replace("Feature:", "").trim();
    const fileName = featureName.toLowerCase().replace(/\s+/g, "_") + ".feature";

    const scenarios = featureBlock
      .split(/(?=@|Scenario:)/)
      .filter(s => s.includes("Scenario:"));

    const funcScenarios: string[] = [];
    const nonFuncScenarios: string[] = [];
    const normalizedScenarios: string[] = [];

    for (const sc of scenarios) {
      const { text, tags } = normalizeScenario(sc);
      normalizedScenarios.push(text);

      const isNonFunc = [...tags].some(t => NON_FUNCTIONAL_TAGS.has(t));
      if (isNonFunc) nonFuncScenarios.push(text);
      else funcScenarios.push(text);
    }

    // collect normalized full feature text
    updatedFeatureBlocks.push(
      `Feature: ${featureName}\n\n${normalizedScenarios.join("\n\n")}`
    );

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

  // ✅ Save updated feature_text back to workspace
  return saveUpdatedFeatureFiles(
    workspacePath,
    updatedFeatureBlocks.join("\n\n")
  );
}
