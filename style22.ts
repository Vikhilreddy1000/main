private sendBaseUrlIfExists() {
  const workspace = vscode.workspace.workspaceFolders?.[0];
  if (!workspace) {
    console.log("No workspace open");
    return;
  }

  const openApiPath = vscode.Uri.joinPath(
    workspace.uri,
    "behavioral_flow_output",
    "openapi.yaml"
  ).fsPath;

  if (!require("fs").existsSync(openApiPath)) {
    console.log("openapi.yaml not found");
    return;
  }

  const specContent = require("fs").readFileSync(openApiPath, "utf-8");

  // reuse your existing function
  const baseUrl = extractBaseUrlFromOpenApi(specContent);

  if (!baseUrl) {
    console.log("Base URL not found in spec");
    return;
  }

  console.log("Sending base URL to webview:", baseUrl);

  this.panel.webview.postMessage({
    type: "SET_API_URL",
    payload: baseUrl
  });
}



<script>
  const vscode = acquireVsCodeApi();

  vscode.postMessage({ type: "WEBVIEW_READY" });

  window.addEventListener("message", (event) => {
    if (event.data.type === "SET_API_URL") {
      document.getElementById("apiUrl").value = event.data.payload;
    }
  });
</script>

