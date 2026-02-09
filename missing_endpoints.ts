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
