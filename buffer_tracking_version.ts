// ============================================================================
// BUFFER TRACKING VERSION - Finds lost scenarios between buffer and file
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

  const inputScenarioCount = (gherkinText.match(/^\s*(Scenario|Scenario Outline):/gm) || []).length;
  console.log(`\n[INPUT] Total scenarios: ${inputScenarioCount}`);

  const featureBlocks = gherkinText.split(/(?=^Feature:)/m);
  const written: string[] = [];
  let totalFunctionalAdded = 0;
  let totalNonFunctionalAdded = 0;

  for (const rawBlock of featureBlocks) {
    const block = rawBlock.trim();
    if (!block || !block.startsWith("Feature:")) continue;

    const lines = block.split(/\r?\n/);
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

    console.log(`\n[FEATURE] "${featTitle}": ${scenarios.length} scenarios`);

    // Classify scenarios
    let funcAddedCount = 0;
    let nonFuncAddedCount = 0;
    let funcSkippedCount = 0;
    let nonFuncSkippedCount = 0;

    for (let idx = 0; idx < scenarios.length; idx++) {
      const sc = scenarios[idx];
      const { normalizedText, detectedTags } = normalizeScenario(sc);

      // 🔍 CHECK: Does normalizedText have a scenario?
      const normalizedCount = (normalizedText.match(/^\s*(Scenario|Scenario Outline):/gm) || []).length;

      if (normalizedCount === 0) {
        console.error(`  ❌ Scenario #${idx + 1} became empty after normalization!`);
        console.error(`     Original first 100 chars: ${sc.substring(0, 100).replace(/\n/g, "↵")}`);
        continue;  // Skip empty scenarios
      }

      if (normalizedCount > 1) {
        console.warn(`  ⚠️  Scenario #${idx + 1} split into ${normalizedCount} scenarios during normalization`);
      }

      const isNonFunctional = [...detectedTags].some(t =>
        NON_FUNCTIONAL_TAGS.has(t)
      );

      if (isNonFunctional) {
        hasNonFunc = true;
        nonFuncBuffer.push("", normalizedText);
        nonFuncAddedCount += normalizedCount;
      } else {
        hasFunc = true;
        funcBuffer.push("", normalizedText);
        funcAddedCount += normalizedCount;
      }
    }

    console.log(`  → Added to functional buffer: ${funcAddedCount}`);
    console.log(`  → Added to non-functional buffer: ${nonFuncAddedCount}`);

    totalFunctionalAdded += funcAddedCount;
    totalNonFunctionalAdded += nonFuncAddedCount;

    // Write and verify files
    if (hasFunc) {
      const p = path.join(funcDir, safeFile);
      const bufferContent = funcBuffer.join("\n") + "\n";

      // 🔍 COUNT: Scenarios in buffer BEFORE writing
      const bufferCount = (bufferContent.match(/^\s*(Scenario|Scenario Outline):/gm) || []).length;
      console.log(`  → Functional buffer contains: ${bufferCount} scenarios`);

      if (bufferCount !== funcAddedCount) {
        console.error(`  ❌ BUFFER MISMATCH! Added: ${funcAddedCount}, Buffer has: ${bufferCount}`);
        console.error(`     Difference: ${funcAddedCount - bufferCount} scenarios`);
      }

      fs.writeFileSync(p, bufferContent);

      // 🔍 READ BACK: Verify what was written
      const writtenContent = fs.readFileSync(p, "utf-8");
      const writtenCount = (writtenContent.match(/^\s*(Scenario|Scenario Outline):/gm) || []).length;
      console.log(`  → Functional file written: ${writtenCount} scenarios`);

      if (writtenCount !== bufferCount) {
        console.error(`  ❌ FILE WRITE MISMATCH! Buffer: ${bufferCount}, File: ${writtenCount}`);
      }

      written.push(p);
    }

    if (hasNonFunc) {
      const p = path.join(nonFuncDir, safeFile);
      const bufferContent = nonFuncBuffer.join("\n") + "\n";

      const bufferCount = (bufferContent.match(/^\s*(Scenario|Scenario Outline):/gm) || []).length;
      console.log(`  → Non-functional buffer contains: ${bufferCount} scenarios`);

      if (bufferCount !== nonFuncAddedCount) {
        console.error(`  ❌ BUFFER MISMATCH! Added: ${nonFuncAddedCount}, Buffer has: ${bufferCount}`);
      }

      fs.writeFileSync(p, bufferContent);

      const writtenContent = fs.readFileSync(p, "utf-8");
      const writtenCount = (writtenContent.match(/^\s*(Scenario|Scenario Outline):/gm) || []).length;
      console.log(`  → Non-functional file written: ${writtenCount} scenarios`);

      if (writtenCount !== bufferCount) {
        console.error(`  ❌ FILE WRITE MISMATCH! Buffer: ${bufferCount}, File: ${writtenCount}`);
      }

      written.push(p);
    }
  }

  console.log(`\n[SUMMARY]`);
  console.log(`Total added to functional buffers: ${totalFunctionalAdded}`);
  console.log(`Total added to non-functional buffers: ${totalNonFunctionalAdded}`);
  console.log(`Total: ${totalFunctionalAdded + totalNonFunctionalAdded}`);

  return written;
}
