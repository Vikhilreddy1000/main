// ============================================================================
// FIXED VERSION - Generates unique filenames to prevent collisions
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

  // ✅ Track used filenames to prevent collisions
  const usedFuncFilenames = new Set<string>();
  const usedNonFuncFilenames = new Set<string>();

  for (const rawBlock of featureBlocks) {
    const block = rawBlock.trim();
    if (!block || !block.startsWith("Feature:")) continue;

    const lines = block.split(/\r?\n/);
    const featTitle = lines[0].replace(/^Feature:\s*/, "").trim();

    // ✅ Generate unique filename with counter if needed
    let baseName = featTitle.toLowerCase().replace(/[^a-z0-9]+/g, "_");
    if (baseName.length > 50) {
      baseName = baseName.substring(0, 50);  // Limit length
    }

    const funcBuffer: string[] = [`Feature: ${featTitle}`, "", "  # Functional scenarios"];
    const nonFuncBuffer: string[] = [`Feature: ${featTitle}`, "", "  # Non-functional scenarios"];

    let hasFunc = false;
    let hasNonFunc = false;

    // Extract scenarios (same as before)
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

    // Classify
    for (const sc of scenarios) {
      const { normalizedText, detectedTags } = normalizeScenario(sc);

      if (!/^\s*(Scenario|Scenario Outline):/m.test(normalizedText)) {
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

    // Write functional with unique filename
    if (hasFunc) {
      let safeFile = baseName + ".feature";
      let counter = 1;

      // ✅ Ensure unique filename
      while (usedFuncFilenames.has(safeFile)) {
        safeFile = `${baseName}_${counter}.feature`;
        counter++;
      }

      usedFuncFilenames.add(safeFile);

      const p = path.join(funcDir, safeFile);
      fs.writeFileSync(p, funcBuffer.join("\n") + "\n");
      written.push(p);

      const count = (funcBuffer.join("\n").match(/^\s*(Scenario|Scenario Outline):/gm) || []).length;
      console.log(`[FUNC] ${safeFile}: ${count} scenarios`);
    }

    // Write non-functional with unique filename
    if (hasNonFunc) {
      let safeFile = baseName + ".feature";
      let counter = 1;

      // ✅ Ensure unique filename
      while (usedNonFuncFilenames.has(safeFile)) {
        safeFile = `${baseName}_${counter}.feature`;
        counter++;
      }

      usedNonFuncFilenames.add(safeFile);

      const p = path.join(nonFuncDir, safeFile);
      fs.writeFileSync(p, nonFuncBuffer.join("\n") + "\n");
      written.push(p);

      const count = (nonFuncBuffer.join("\n").match(/^\s*(Scenario|Scenario Outline):/gm) || []).length;
      console.log(`[NON-FUNC] ${safeFile}: ${count} scenarios`);
    }
  }

  return written;
}
