function extractScenarios(featureBlock: string): string[] {
  const lines = featureBlock.split(/\r?\n/);
  const scenarios: string[] = [];

  let buffer: string[] = [];

  for (const line of lines) {
    if (line.trim().startsWith("Scenario:")) {
      if (buffer.length) {
        scenarios.push(buffer.join("\n").trim());
        buffer = [];
      }
    }
    buffer.push(line);
  }

  if (buffer.length) {
    scenarios.push(buffer.join("\n").trim());
  }

  // remove Feature header block
  return scenarios.filter(s => s.includes("Scenario:"));
}

export function splitAndWriteFeatures(
  workspacePath: string,
  gherkinText: string
) {
  const base = path.join(workspacePath, "bdd_tests");
  const funcDir = path.join(base, "functional");
  const nonFuncDir = path.join(base, "non_functional");

  fs.mkdirSync(funcDir, { recursive: true });
  fs.mkdirSync(nonFuncDir, { recursive: true });

  [funcDir, nonFuncDir].forEach(clearOutputDir);

  const featureBlocks = gherkinText.split(/(?=Feature:)/);

  for (const featureBlock of featureBlocks) {
    if (!featureBlock.trim()) continue;

    const lines = featureBlock.split(/\r?\n/);
    const featureName = lines[0].replace("Feature:", "").trim();
    const fileName = featureName.toLowerCase().replace(/\s+/g, "_") + ".feature";

    // ✅ CORRECT extraction
    const scenarios = extractScenarios(featureBlock);

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

    if (funcScenarios.length) {
      fs.writeFileSync(
        path.join(funcDir, fileName),
        `Feature: ${featureName}

  # Functional scenarios

${funcScenarios.join("\n\n")}
`
      );
    }

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
