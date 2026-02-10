1️⃣ Define centralized settings (package.json)

Add this to your extension’s package.json:

"contributes": {
  "configuration": {
    "title": "CodeGenie BDD",
    "properties": {
      "codegenie.apiUrl": {
        "type": "string",
        "default": "",
        "description": "Base URL for the CodeGenie API"
      },
      "codegenie.authToken": {
        "type": "string",
        "default": "",
        "description": "Authentication token for CodeGenie API"
      },
      "codegenie.verifySSL": {
        "type": "boolean",
        "default": true,
        "description": "Verify SSL certificates for API requests"
      }
    }
  }
}


📌 Users can now configure via:

Settings UI

.vscode/settings.json

Workspace settings

2️⃣ Read settings in your existing code (NO breaking changes)

Create a single config reader (centralized):

import * as vscode from "vscode";

export function getUserConfig() {
  const config = vscode.workspace.getConfiguration("codegenie");

  return {
    apiUrl: config.get<string>("apiUrl", "").trim(),
    authToken: config.get<string>("authToken", "").trim(),
    verifySSL: config.get<boolean>("verifySSL", true),
  };
}

3️⃣ Use centralized config everywhere (example)
❌ Before (hardcoded / env-based)
const apiUrl = process.env.API_URL;
const authToken = process.env.AUTH_TOKEN;

✅ After (UI-driven)
const { apiUrl, authToken, verifySSL } = getUserConfig();

if (!apiUrl || !authToken) {
  vscode.window.showErrorMessage(
    "API URL or Auth Token is missing. Please configure CodeGenie settings."
  );
  return;
}

4️⃣ Apply SSL verification centrally (axios example)
import https from "https";
import axios from "axios";

const { verifySSL } = getUserConfig();

const axiosInstance = axios.create({
  httpsAgent: new https.Agent({
    rejectUnauthorized: verifySSL,
  }),
});


✅ No more .env hacks
✅ No more manual toggles in code

5️⃣ Optional (Highly Recommended): Command-based UI wizard

This gives users a friendly UI prompt instead of opening settings.

📌 Register command
"contributes": {
  "commands": [
    {
      "command": "codegenie.configure",
      "title": "CodeGenie: Configure API Settings"
    }
  ]
}

🧩 Command implementation
export async function configureCodeGenie() {
  const config = vscode.workspace.getConfiguration("codegenie");

  const apiUrl = await vscode.window.showInputBox({
    prompt: "Enter CodeGenie API URL",
    value: config.get("apiUrl", ""),
    ignoreFocusOut: true,
  });

  if (!apiUrl) return;

  const authToken = await vscode.window.showInputBox({
    prompt: "Enter Auth Token",
    password: true,
    value: config.get("authToken", ""),
    ignoreFocusOut: true,
  });

  if (!authToken) return;

  const verifySSL = await vscode.window.showQuickPick(
    ["true", "false"],
    {
      placeHolder: "Verify SSL certificates?",
    }
  );

  await config.update("apiUrl", apiUrl, vscode.ConfigurationTarget.Workspace);
  await config.update("authToken", authToken, vscode.ConfigurationTarget.Workspace);
  await config.update(
    "verifySSL",
    verifySSL === "true",
    vscode.ConfigurationTarget.Workspace
  );

  vscode.window.showInformationMessage("CodeGenie settings saved successfully.");
}

6️⃣ Register command in activate()
context.subscriptions.push(
  vscode.commands.registerCommand(
    "codegenie.configure",
    configureCodeGenie
  )
);

🔐 Security Best Practices (IMPORTANT)
✅ Do this

Mark auth token input as password: true

Store token in workspace settings

Allow .vscode/settings.json to be gitignored

❌ Avoid this

Hardcoding tokens

Committing .env with secrets

Logging auth tokens

🟢 Optional (Advanced)

For maximum security, store tokens in VS Code SecretStorage:

context.secrets.store("codegenie.authToken", token);


(You can still keep URL & SSL in settings)

🧪 Resulting UX (What users experience)

✔ No file editing
✔ No .env confusion
✔ Clear error messages
✔ One-time configuration
✔ Works per workspace
✔ Secure token handling

✅ Final Architecture (Clean & Scalable)
VS Code Settings / UI
        ↓
getUserConfig()
        ↓
API Calls (Axios)
        ↓
Spec Generation
        ↓
BDD Generation
