export async function pathMatching(
  featureText: string,
  spec: any
): Promise<[Array<[string, string, RegExp]>, string[]]> {
  try {
    const defined: Array<[string, string, RegExp]> = [];

    for (const [path, methods] of Object.entries(spec?.paths || {})) {
      for (const method of Object.keys(methods as object)) {
        const upperMethod = method.toUpperCase();

        // PATH ONLY
        const openapiPathOnly = path.replace(/\/$/, "");

        // replace {param} with regex
        const regexPath = openapiPathOnly.replace(
          /\{[^/]{1,2048}\}/g,
          "[^/]{1,2048}"
        );

        const pattern = new RegExp(regexPath);

        defined.push([upperMethod, openapiPathOnly, pattern]);
      }
    }

    // normalize feature file
    const featureLines = featureText.split("\n");

    // extract urls
    const urlCandidates: string[] = [];

    for (const line of featureLines) {
      const found = line.match(/\/[^\s"']{1,2048}/g);
      if (found) urlCandidates.push(...found);
    }

    // normalize urls
    const normalizedCandidates: string[] = urlCandidates.map((u) =>
      u.split("?")[0].replace(/\/$/, "")
    );

    return [defined, normalizedCandidates];
  } catch (err) {
    throw err;
  }
}




export async function calculateOpenApiCoverage(
  featureText: string,
  spec: any
): Promise<[number, string[]]> {
  try {
    const [defined, normalizedCandidates] = await pathMatching(
      featureText,
      spec
    );

    const coveredSet = new Set<string>();

    for (const [method, openapiPathOnly, pattern] of defined) {
      if (!featureText.toLowerCase().includes(method.toLowerCase())) continue;

      for (const cand of normalizedCandidates) {
        if (pattern.test(cand)) {
          coveredSet.add(`${method} ${openapiPathOnly}`);
          break;
        }
      }
    }

    const definedSet = new Set(
      defined.map(([m, p]) => `${m} ${p}`)
    );

    const uncovered = [...definedSet].filter(
      (x) => !coveredSet.has(x)
    ).sort();

    const total = definedSet.size;
    const covered = coveredSet.size;
    const coverage = total ? (covered / total) * 100 : 0;

    return [coverage, uncovered];
  } catch (e: any) {
    return [0, [`Coverage calculation failed: ${e.message}`]];
  }
}



export async function getContentFromSpec(
  spec: Record<string, any>,
  url: string,
  method: string,
  featureText: string
): Promise<any | null> {
  try {
    const lowerMethod = method.toLowerCase();

    const [defined, normalizedCandidates] = await pathMatching(
      featureText,
      spec
    );

    for (const [m, openapiPathOnly, pattern] of defined) {
      if (m.toLowerCase() !== lowerMethod) continue;

      for (const cand of normalizedCandidates) {
        if (pattern.test(cand)) {
          url = openapiPathOnly;
          break;
        }
      }

      if (url === openapiPathOnly) break;
    }

    const methodObj = spec?.paths?.[url]?.[lowerMethod];

    if (methodObj && methodObj.requestBody) {
      return methodObj.requestBody.content;
    } else {
      return null;
    }
  } catch (e) {
    throw new Error("Unexpected error from getContentFromSpec");
  }
}
