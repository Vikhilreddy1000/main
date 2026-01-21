// Remove old tag block
if (tagBlockStart < scenarioIdx) {
  lines.splice(tagBlockStart, scenarioIdx - tagBlockStart);
  scenarioIdx = tagBlockStart;
}

// 🔥 FIX: remove blank lines between tags and Scenario
while (
  scenarioIdx > 0 &&
  lines[scenarioIdx - 1].trim() === ""
) {
  lines.splice(scenarioIdx - 1, 1);
  scenarioIdx--;
}

// Insert enforced tag block
if (finalTagLines.length) {
  lines.splice(scenarioIdx, 0, ...finalTagLines);
}
