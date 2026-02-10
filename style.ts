/* ============================= */
/* 🔐 API CONFIG INPUTS (APPEND) */
/* ============================= */

.api-config {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.api-config input {
  height: 32px;
  padding: 0 10px;
  border-radius: 6px;
  border: 1px solid #444;
  background: #ffffff;
  color: black;
  font-size: 13px;
}

.api-config input:focus {
  outline: none;
  border-color: #07439c;
  box-shadow: 0 0 0 2px rgba(74, 144, 226, 0.2);
}

/* ============================= */
/* 🔐 VERIFY SSL TOGGLE (APPEND) */
/* ============================= */

.ssl-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: black;
  white-space: nowrap;
}

.ssl-toggle input {
  cursor: pointer;
}









<!-- 🔐 API CONFIG (APPEND ONLY) -->
<div class="api-config">
  <input
    id="apiUrlInput"
    type="text"
    placeholder="Base API URL"
  />

  <input
    id="authTokenInput"
    type="password"
    placeholder="Auth Token"
  />
</div>







<div class="left-buttons">
  <button id="runTests" class="run-tests" ${isPlaceholder ? "disabled" : ""}>
    Run Tests
  </button>

  <!-- 🔐 VERIFY SSL TOGGLE (APPEND) -->
  <label class="ssl-toggle">
    <input type="checkbox" id="verifySSL" checked />
    Verify SSL
  </label>
</div>



4️⃣ JavaScript — Read values (NO behavior change)

Scroll to your <script> section (you already have runTests.onclick).

✅ ADD THIS INSIDE runTests.onclick
const apiUrl = document.getElementById("apiUrlInput")?.value?.trim();
const authToken = document.getElementById("authTokenInput")?.value?.trim();
const verifySSL = document.getElementById("verifySSL")?.checked ?? true;

✅ Append to existing postMessage (do not remove anything)
vscode.postMessage({
  type: "runTests",
  text: featureTextEl.innerText,
  apiUrl,
  authToken,
  verifySSL,
});
