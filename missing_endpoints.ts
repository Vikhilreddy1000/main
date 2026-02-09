function validateOpenApiSpec(
  spec: any,
  context: "generated" | "existing"
): void {
  if (!spec || typeof spec !== "object") {
    throw new Error(
      `❌ OpenAPI spec is empty or invalid (${context}).`
    );
  }

  if (!spec.paths || typeof spec.paths !== "object") {
    throw new Error(
      `❌ OpenAPI spec has no paths (${context}).\n` +
      `No API endpoints were found.`
    );
  }

  const pathEntries = Object.entries(spec.paths);

  if (pathEntries.length === 0) {
    throw new Error(
      `❌ OpenAPI spec has empty paths object (${context}).\n` +
      `No API endpoints were found.`
    );
  }

  const hasAnyOperation = pathEntries.some(([_, ops]) =>
    ops &&
    typeof ops === "object" &&
    Object.keys(ops).some(k =>
      ["get", "post", "put", "patch", "delete", "options", "head"].includes(
        k.toLowerCase()
      )
    )
  );

  if (!hasAnyOperation) {
    throw new Error(
      `❌ OpenAPI spec contains paths but no operations (${context}).\n` +
      `No HTTP methods (GET/POST/etc) were found.`
    );
  }
}







function hasValidEndpoints(openApiSpec: any): boolean {
  if (!openApiSpec || typeof openApiSpec !== "object") return false;
  if (!openApiSpec.paths || typeof openApiSpec.paths !== "object") return false;

  const paths = Object.values(openApiSpec.paths);
  if (paths.length === 0) return false;

  return paths.some(p =>
    p &&
    typeof p === "object" &&
    Object.keys(p).some(method =>
      ["get", "post", "put", "patch", "delete", "options", "head"].includes(
        method.toLowerCase()
      )
    )
  );
}


if (exists) {
  vscode.window.showInformationMessage("Found openapi.yaml in the workspace!");
  isSpecAvailable = true;

  const outputDir = path.join(workspacePath, "behavioral_flow_output");
  specContent = fs.readFileSync(
    path.join(outputDir, "openapi.yaml"),
    "utf-8"
  );

  let parsedSpec: any;
  try {
    parsedSpec = yaml.parse(specContent);
  } catch {
    vscode.window.showErrorMessage(
      "❌ Failed to parse existing OpenAPI spec (openapi.yaml)."
    );
    return;
  }

  // 🔒 EXPLICIT FEEDBACK
  if (!hasValidEndpoints(parsedSpec)) {
    vscode.window.showErrorMessage(
      "❌ OpenAPI spec exists but contains no API endpoints or paths.\n" +
      "Please ensure paths with HTTP methods (GET/POST/etc) are defined."
    );
    return;
  }
}








const generatedSpec = yaml.parse(generatedSpecText);

// 🔒 EXPLICIT FEEDBACK
if (!hasValidEndpoints(generatedSpec)) {
  vscode.window.showErrorMessage(
    "❌ Generated OpenAPI spec contains no API endpoints or paths.\n" +
    "The source input may not define any APIs."
  );
  return;
}

