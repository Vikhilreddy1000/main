1️⃣ src/auth/config.ts
🔑 CENTRAL CONFIG READER (MOST IMPORTANT FILE)

This file becomes the single source of truth for:

API URL

Auth Token

SSL verification

✅ Add / Update config.ts
import * as vscode from "vscode";

export function getCodeGenieConfig() {
  const config = vscode.workspace.getConfiguration("codegenie");

  return {
    apiUrl: config.get<string>("apiUrl", "").trim(),
    authToken: config.get<string>("authToken", "").trim(),
    verifySSL: config.get<boolean>("verifySSL", true),
  };
}


📌 Nothing else should read settings directly — only this file.

2️⃣ src/auth/authDialog.ts
🧑‍💻 USER INPUT UI (Wizard / Dialog)

This is where:

User enters URL

User enters Auth Token (masked)

User selects SSL verification

✅ Add this function here
import * as vscode from "vscode";

export async function showAuthDialog() {
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
    { placeHolder: "Verify SSL certificates?" }
  );

  await config.update("apiUrl", apiUrl, vscode.ConfigurationTarget.Workspace);
  await config.update("authToken", authToken, vscode.ConfigurationTarget.Workspace);
  await config.update(
    "verifySSL",
    verifySSL === "true",
    vscode.ConfigurationTarget.Workspace
  );

  vscode.window.showInformationMessage("CodeGenie configuration saved.");
}

3️⃣ src/auth/apiHeaders.ts
🔐 AUTH HEADER GENERATION (NO UI HERE)

This file must not ask for input — it just uses config.

✅ Update apiHeaders.ts
import { getCodeGenieConfig } from "./config";

export function getAuthHeaders() {
  const { authToken } = getCodeGenieConfig();

  if (!authToken) {
    throw new Error("Auth token not configured.");
  }

  return {
    Authorization: `Bearer ${authToken}`,
  };
}

4️⃣ src/utils/api/bddAPI.ts
🌐 API CALLS (URL + SSL HANDLING)

This is where:

API URL

SSL verification
are actually applied.

✅ Update axios creation here
import axios from "axios";
import https from "https";
import { getCodeGenieConfig } from "../../auth/config";
import { getAuthHeaders } from "../../auth/apiHeaders";

const { apiUrl, verifySSL } = getCodeGenieConfig();

export const bddApiClient = axios.create({
  baseURL: apiUrl,
  httpsAgent: new https.Agent({
    rejectUnauthorized: verifySSL,
  }),
  headers: getAuthHeaders(),
});


📌 This ensures every API call respects UI settings.

5️⃣ src/commands/bdd/bddGeneration.ts
🚦 VALIDATION BEFORE RUN

Before running generation, ensure config exists.

✅ Add at the top of command handler
import { getCodeGenieConfig } from "../../auth/config";
import { showAuthDialog } from "../../auth/authDialog";

const { apiUrl, authToken } = getCodeGenieConfig();

if (!apiUrl || !authToken) {
  const choice = await vscode.window.showWarningMessage(
    "CodeGenie is not configured. Configure now?",
    "Configure",
    "Cancel"
  );

  if (choice === "Configure") {
    await showAuthDialog();
  }
  return;
}

6️⃣ package.json
⚙️ SETTINGS DEFINITION (REQUIRED)

Add once:

"contributes": {
  "configuration": {
    "title": "CodeGenie",
    "properties": {
      "codegenie.apiUrl": {
        "type": "string",
        "description": "CodeGenie API base URL"
      },
      "codegenie.authToken": {
        "type": "string",
        "description": "Authentication token for CodeGenie API"
      },
      "codegenie.verifySSL": {
        "type": "boolean",
        "default": true,
        "description": "Verify SSL certificates"
      }
    }
  },
  "commands": [
    {
      "command": "codegenie.configure",
      "title": "CodeGenie: Configure API Settings"
    }
  ]
}

7️⃣ activate() (command registration)
import { showAuthDialog } from "./auth/authDialog";

context.subscriptions.push(
  vscode.commands.registerCommand(
    "codegenie.configure",
    showAuthDialog
  )
);

🧠 Final Responsibility Map (IMPORTANT)
Responsibility	File
User input UI	auth/authDialog.ts
Config storage	VS Code Settings
Config access	auth/config.ts
Auth headers	auth/apiHeaders.ts
SSL handling	utils/api/bddAPI.ts
Validation	commands/bdd/bddGeneration.ts
✅ Resulting UX (What users experience)

🔘 No .env edits

🔘 No manual config files

🔘 Secure token input

🔘 One-time setup per workspace

🔘 Clear errors if missing config

🔘 Centralized & maintainable code

🚀 Optional next improvements

Store token in SecretStorage

“Test connection” button

Multiple environment profiles

Auto-migrate old .env
