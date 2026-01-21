import fs from "fs";
import path from "path";

export function writeTaggedFeatures(
  projectPath: string,
  gherkinText: string
): void {
  const features = parseFeatures(gherkinText);

  const baseDir = path.join(projectPath, "bdd_tests");
  const funcDir = path.join(baseDir, "functional");
  const nonFuncDir = path.join(baseDir, "non_functional");

  fs.mkdirSync(funcDir, { recursive: true });
  fs.mkdirSync(nonFuncDir, { recursive: true });

  for (const feature of features) {
    const funcBlocks: string[] = [`Feature: ${feature.name}`];
    const nonFuncBlocks: string[] = [`Feature: ${feature.name}`];

    let hasFunc = false;
    let hasNonFunc = false;

    for (const sc of feature.scenarios) {
      const block = [
        ...sc.tags,
        `Scenario: ${sc.scenario}`,
        ...sc.lines,
      ].join("\n");

      if (isNonFunctional(sc.tags)) {
        nonFuncBlocks.push("", block);
        hasNonFunc = true;
      } else {
        funcBlocks.push("", block);
        hasFunc = true;
      }
    }

    const fileName =
      feature.name.toLowerCase().replace(/\s+/g, "_") + ".feature";

    if (hasFunc) {
      fs.writeFileSync(
        path.join(funcDir, fileName),
        funcBlocks.join("\n").trimEnd() + "\n"
      );
    }

    if (hasNonFunc) {
      fs.writeFileSync(
        path.join(nonFuncDir, fileName),
        nonFuncBlocks.join("\n").trimEnd() + "\n"
      );
    }
  }
}


function parseFeatures(gherkinText: string): ParsedFeature[] {
  const features: ParsedFeature[] = [];

  const lines = gherkinText.split(/\r?\n/);

  let currentFeature: ParsedFeature | null = null;
  let currentScenario: ParsedScenario | null = null;
  let pendingTags: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Feature
    if (trimmed.startsWith("Feature:")) {
      if (currentScenario && currentFeature) {
        currentFeature.scenarios.push(currentScenario);
        currentScenario = null;
      }

      currentFeature = {
        name: trimmed.replace("Feature:", "").trim(),
        scenarios: [],
      };

      features.push(currentFeature);
      pendingTags = [];
      continue;
    }

    // Tag
    if (trimmed.startsWith("@") && !currentScenario) {
      pendingTags.push(trimmed.toLowerCase());
      continue;
    }

    // Scenario
    if (trimmed.startsWith("Scenario:")) {
      if (!currentFeature) {
        throw new Error("Scenario found before Feature");
      }

      if (currentScenario) {
        currentFeature.scenarios.push(currentScenario);
      }

      currentScenario = {
        feature: currentFeature.name,
        tags: [...pendingTags],
        scenario: trimmed.replace("Scenario:", "").trim(),
        lines: [],
      };

      pendingTags = [];
      continue;
    }

    // Scenario steps
    if (currentScenario) {
      if (trimmed !== "") {
        currentScenario.lines.push(line);
      }
    }
  }

  // Flush last scenario
  if (currentScenario && currentFeature) {
    currentFeature.scenarios.push(currentScenario);
  }

  return features;
}


type ParsedScenario = {
  feature: string;
  tags: string[];
  scenario: string;
  lines: string[];
};

type ParsedFeature = {
  name: string;
  scenarios: ParsedScenario[];
};


function isNonFunctional(tags: string[]): boolean {
  return tags.some(t => NON_FUNCTIONAL_TAGS.has(t));
}

