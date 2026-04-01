const connectionText = document.getElementById("connection-text");
const statusPill = document.getElementById("status-pill");
const statusReason = document.getElementById("status-reason");
const statusInterval = document.getElementById("status-interval");
const statusNext = document.getElementById("status-next");
const startButton = document.getElementById("start-button");
const stopWordInput = document.getElementById("stop-word");
const stopButton = document.getElementById("stop-button");
const refreshButton = document.getElementById("refresh-button");
const landingButton = document.getElementById("landing-button");
const feedback = document.getElementById("feedback");

const state = {
  tabId: null,
  connected: false,
  status: null,
  countdownTimerId: null,
  requestedResync: false,
};

function setFeedback(message, type = "") {
  feedback.textContent = message;
  feedback.className = "feedback";

  if (type === "ok") {
    feedback.classList.add("feedback--ok");
  }

  if (type === "error") {
    feedback.classList.add("feedback--error");
  }
}

function setConnection(message, connected) {
  connectionText.textContent = message;
  connectionText.className = connected
    ? "connection connection--ok"
    : "connection connection--bad";

  state.connected = connected;
  startButton.disabled = !connected;

  const canAttemptStop =
    connected &&
    !!state.status?.active &&
    stopWordInput.value.trim().toUpperCase() === "STOP";
  stopButton.disabled = !canAttemptStop;
}

async function openLandingPage() {
  const url = chrome.runtime.getURL("landing.html");

  await chrome.tabs.create({ url });
  setFeedback("Landing page opened.", "ok");
}

function formatInterval(minutes) {
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return "-";
  }

  return minutes === 1 ? "1 minute" : `${minutes} minutes`;
}

function formatRemainingTime(milliseconds) {
  const totalSeconds = Math.ceil(milliseconds / 1000);

  if (totalSeconds <= 0) {
    return "Due now";
  }

  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  }

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }

  return `${minutes}m ${seconds}s`;
}

function clearCountdown() {
  if (state.countdownTimerId !== null) {
    window.clearInterval(state.countdownTimerId);
    state.countdownTimerId = null;
  }
}

function renderCountdown() {
  if (!state.status?.active || !Number.isFinite(state.status.nextReminderAt)) {
    statusNext.textContent = "Not running";
    return;
  }

  const remaining = state.status.nextReminderAt - Date.now();

  if (remaining <= 0) {
    statusNext.textContent = "Due now";

    if (!state.requestedResync) {
      state.requestedResync = true;
      window.setTimeout(() => {
        state.requestedResync = false;
        void refreshStatus();
      }, 1200);
    }

    return;
  }

  statusNext.textContent = formatRemainingTime(remaining);
}

function startCountdown() {
  clearCountdown();

  if (!state.status?.active || !Number.isFinite(state.status.nextReminderAt)) {
    statusNext.textContent = "Not running";
    return;
  }

  renderCountdown();
  state.countdownTimerId = window.setInterval(renderCountdown, 1000);
}

function renderStatus(status) {
  state.status = status;

  const isActive = !!status?.active;
  statusPill.textContent = isActive ? "Running" : "Idle";
  statusPill.className = isActive ? "pill pill--active" : "pill pill--idle";

  statusReason.textContent = status?.reason?.trim()
    ? status.reason.trim()
    : "Not set yet";
  statusInterval.textContent = formatInterval(status?.intervalMinutes);

  if (!isActive) {
    statusNext.textContent = "Not running";
  }

  const canAttemptStop =
    state.connected &&
    isActive &&
    stopWordInput.value.trim().toUpperCase() === "STOP";
  stopButton.disabled = !canAttemptStop;

  startCountdown();
}

async function getActiveTabId() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tabs.length || typeof tabs[0].id !== "number") {
    throw new Error("No active tab available.");
  }

  state.tabId = tabs[0].id;
  return tabs[0].id;
}

async function sendToActiveTab(message) {
  const tabId = state.tabId ?? (await getActiveTabId());

  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      resolve(response);
    });
  });
}

async function refreshStatus() {
  try {
    const response = await sendToActiveTab({ type: "rc-get-status" });

    if (!response?.ok) {
      throw new Error(response?.error || "Failed to read status.");
    }

    setConnection("Connected to this YouTube tab.", true);
    renderStatus(response.status || {});
  } catch (_error) {
    setConnection("Open a YouTube tab to use these controls.", false);
    renderStatus({
      active: false,
      reason: "",
      intervalMinutes: null,
      nextReminderAt: null,
    });
  }
}

async function startSetup() {
  try {
    const response = await sendToActiveTab({ type: "rc-open-setup" });

    if (!response?.ok) {
      throw new Error(response?.error || "Could not open setup.");
    }

    setFeedback("Setup opened on the current tab.", "ok");
    await refreshStatus();
  } catch (_error) {
    setFeedback("Open YouTube and try again.", "error");
    setConnection("Open a YouTube tab to use these controls.", false);
  }
}

async function stopRemindersFromPopup() {
  try {
    const response = await sendToActiveTab({ type: "rc-stop-reminders" });

    if (!response?.ok) {
      throw new Error(response?.error || "Could not stop reminders.");
    }

    stopWordInput.value = "";
    setFeedback("Reminders stopped.", "ok");

    if (response.status) {
      renderStatus(response.status);
    }

    await refreshStatus();
  } catch (_error) {
    setFeedback("Unable to stop reminders on this tab.", "error");
  }
}

stopWordInput.addEventListener("input", () => {
  const canAttemptStop =
    state.connected &&
    !!state.status?.active &&
    stopWordInput.value.trim().toUpperCase() === "STOP";
  stopButton.disabled = !canAttemptStop;
});

startButton.addEventListener("click", () => {
  void startSetup();
});

stopButton.addEventListener("click", () => {
  void stopRemindersFromPopup();
});

refreshButton.addEventListener("click", () => {
  void refreshStatus();
  setFeedback("Status refreshed.");
});

landingButton.addEventListener("click", () => {
  void openLandingPage();
});

window.addEventListener("unload", () => {
  clearCountdown();
});

void refreshStatus();
