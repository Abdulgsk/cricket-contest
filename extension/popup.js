const COOKIE_NAMES = ["SSID", "SSIDuser", "NA_VISITOR", "sameSiteNoneSupported", "device.info.cookie"];
const DOMAINS = ["https://www.my11circle.com", "https://my11circle.com"];

const $ = (id) => document.getElementById(id);
const status = $("status");
const endpointInput = $("endpoint");
const tokenInput = $("token");
const syncBtn = $("sync");

function showStatus(message, kind) {
  status.textContent = message;
  status.className = `status ${kind}`;
  status.style.display = "block";
}

async function loadSaved() {
  const { endpoint, token } = await chrome.storage.local.get(["endpoint", "token"]);
  if (endpoint) endpointInput.value = endpoint;
  if (token) tokenInput.value = token;
}

async function saveSettings(endpoint, token) {
  await chrome.storage.local.set({ endpoint, token });
}

async function gatherCookies() {
  const map = new Map();
  for (const url of DOMAINS) {
    const cookies = await chrome.cookies.getAll({ url });
    for (const c of cookies) {
      if (!COOKIE_NAMES.includes(c.name)) continue;
      // Prefer values from www. domain (overwrites apex if both exist)
      map.set(c.name, c.value);
    }
  }
  return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
}

async function sync() {
  const endpoint = endpointInput.value.trim();
  const token = tokenInput.value.trim();
  if (!endpoint || !token) {
    showStatus("Endpoint and token are required.", "err");
    return;
  }
  await saveSettings(endpoint, token);
  syncBtn.disabled = true;
  showStatus("Reading cookies…", "");

  try {
    const cookies = await gatherCookies();
    if (!cookies.find((c) => c.name === "SSID")) {
      showStatus("SSID cookie not found. Log in to my11circle.com first.", "err");
      syncBtn.disabled = false;
      return;
    }

    showStatus("Uploading…", "");
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ cookies }),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data.ok) {
      showStatus(`Failed (${res.status}): ${data.error ?? "unknown error"}`, "err");
      syncBtn.disabled = false;
      return;
    }

    showStatus(
      data.loggedIn
        ? `✓ Cookie uploaded. My11 session verified.`
        : `Cookie uploaded but server reports session not logged in.`,
      data.loggedIn ? "ok" : "err"
    );
  } catch (err) {
    showStatus(`Error: ${err.message}`, "err");
  } finally {
    syncBtn.disabled = false;
  }
}

syncBtn.addEventListener("click", sync);
loadSaved();
