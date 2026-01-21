// ============================================================================
// DIAGNOSTIC VERSION - Tracks scenario loss during file writing
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
  console.log(`\n[DEBUG] Input total scenarios: ${inputScenarioCount}`);

  const featureBlocks = gherkinText.split(/(?=^Feature:)/m);
  const written: string[] = [];
  let totalProcessedScenarios = 0;
  let totalFunctionalScenarios = 0;
  let totalNonFunctionalScenarios = 0;

  for (const rawBlock of featureBlocks) {
    const block = rawBlock.trim();
    if (!block || !block.startsWith("Feature:")) continue;

    const lines = block.split(/\r?\n/);
    if (!lines.length) continue;

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
    let funcCount = 0;
    let nonFuncCount = 0;

    // -------- Scenario grouping logic --------
    const scenarios: string[] = [];
    let curLines: string[] = [];
    let pendingTagLines: string[] = [];

    for (let i = 1; i < lines.length; i++) {
      const ln = lines[i];
      const trimmed = ln.trim();

      if (!trimmed) {
        if (curLines.length) {
          curLines.push(ln);
        }
        continue;
      }

      if (trimmed.startsWith("@")) {
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

    console.log(`[DEBUG] Feature "${featTitle}": ${scenarios.length} scenarios extracted`);
    totalProcessedScenarios += scenarios.length;

    // -------- Classification and normalization --------
    for (const sc of scenarios) {
      const { normalizedText, detectedTags } = normalizeScenario(sc);

      // 🔍 DEBUG: Check if normalizedText still contains a scenario
      const scenariosInNormalized = (normalizedText.match(/^\s*(Scenario|Scenario Outline):/gm) || []).length;

      if (scenariosInNormalized === 0) {
        console.error(`[ERROR] Scenario lost during normalization!`);
        console.error(`Original:\n${sc.substring(0, 100)}...`);
        continue;
      }

      if (scenariosInNormalized > 1) {
        console.warn(`[WARNING] Normalization created ${scenariosInNormalized} scenarios from 1!`);
      }

      const isNonFunctional = [...detectedTags].some(t =>
        NON_FUNCTIONAL_TAGS.has(t)
      );

      if (isNonFunctional) {
        hasNonFunc = true;
        nonFuncBuffer.push("", normalizedText);
        nonFuncCount += scenariosInNormalized;
      } else {
        hasFunc = true;
        funcBuffer.push("", normalizedText);
        funcCount += scenariosInNormalized;
      }
    }

    console.log(`  → Functional: ${funcCount}, Non-functional: ${nonFuncCount}`);
    totalFunctionalScenarios += funcCount;
    totalNonFunctionalScenarios += nonFuncCount;

    // -------- Write files --------
    if (hasFunc) {
      const p = path.join(funcDir, safeFile);
      const content = funcBuffer.join("\n") + "\n";
      fs.writeFileSync(p, content);

      // 🔍 VERIFY: Count scenarios in written file
      const writtenFuncCount = (content.match(/^\s*(Scenario|Scenario Outline):/gm) || []).length;
      console.log(`  → Functional file written: ${writtenFuncCount} scenarios`);

      if (writtenFuncCount !== funcCount) {
        console.error(`[ERROR] Functional scenario mismatch! Expected: ${funcCount}, Written: ${writtenFuncCount}`);
      }

      written.push(p);
    }

    if (hasNonFunc) {
      const p = path.join(nonFuncDir, safeFile);
      const content = nonFuncBuffer.join("\n") + "\n";
      fs.writeFileSync(p, content);

      // 🔍 VERIFY: Count scenarios in written file
      const writtenNonFuncCount = (content.match(/^\s*(Scenario|Scenario Outline):/gm) || []).length;
      console.log(`  → Non-functional file written: ${writtenNonFuncCount} scenarios`);

      if (writtenNonFuncCount !== nonFuncCount) {
        console.error(`[ERROR] Non-functional scenario mismatch! Expected: ${nonFuncCount}, Written: ${writtenNonFuncCount}`);
      }

      written.push(p);
    }
  }

  console.log(`\n[SUMMARY]`);
  console.log(`Input scenarios: ${inputScenarioCount}`);
  console.log(`Processed scenarios: ${totalProcessedScenarios}`);
  console.log(`Functional scenarios: ${totalFunctionalScenarios}`);
  console.log(`Non-functional scenarios: ${totalNonFunctionalScenarios}`);
  console.log(`Total classified: ${totalFunctionalScenarios + totalNonFunctionalScenarios}`);
  console.log(`Difference: ${inputScenarioCount - (totalFunctionalScenarios + totalNonFunctionalScenarios)}`);

  if (inputScenarioCount !== totalProcessedScenarios) {
    console.error(`[ERROR] Lost ${inputScenarioCount - totalProcessedScenarios} scenarios during extraction!`);
  }

  if (totalProcessedScenarios !== (totalFunctionalScenarios + totalNonFunctionalScenarios)) {
    console.error(`[ERROR] Lost ${totalProcessedScenarios - (totalFunctionalScenarios + totalNonFunctionalScenarios)} scenarios during classification!`);
  }

  return written;
}
