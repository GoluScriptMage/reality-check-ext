(() => {
  if (window.top !== window.self) {
    return;
  }

  const STORAGE_KEY = "realityCheckSession";
  const DEFAULT_INTERVAL_MINUTES = 10;
  const MIN_INTERVAL_MINUTES = 1;
  const MAX_INTERVAL_MINUTES = 180;

  const state = {
    session: null,
    reminderTimeoutId: null,
    checkInOpen: false,
    setupOverlay: null,
    toastTimeoutId: null,
  };

  function safeInterval(value, fallback) {
    const parsed = Number(value);

    if (!Number.isFinite(parsed)) {
      return fallback;
    }

    return Math.min(
      MAX_INTERVAL_MINUTES,
      Math.max(MIN_INTERVAL_MINUTES, Math.round(parsed)),
    );
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => {
      const map = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      };

      return map[char] || char;
    });
  }

  function hasChromeStorage() {
    return typeof chrome !== "undefined" && !!chrome.storage?.local;
  }

  async function readSession() {
    if (hasChromeStorage()) {
      return new Promise((resolve) => {
        chrome.storage.local.get([STORAGE_KEY], (result) => {
          if (chrome.runtime?.lastError) {
            resolve(null);
            return;
          }

          resolve(result[STORAGE_KEY] || null);
        });
      });
    }

    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (_error) {
      return null;
    }
  }

  async function saveSession(session) {
    if (hasChromeStorage()) {
      return new Promise((resolve) => {
        chrome.storage.local.set({ [STORAGE_KEY]: session }, () => {
          resolve();
        });
      });
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  }

  function clearReminderTimeout() {
    if (state.reminderTimeoutId !== null) {
      window.clearTimeout(state.reminderTimeoutId);
      state.reminderTimeoutId = null;
    }
  }

  function showToast(message) {
    const existing = document.querySelector(".rc-toast");
    if (existing) {
      existing.remove();
    }

    if (state.toastTimeoutId !== null) {
      window.clearTimeout(state.toastTimeoutId);
      state.toastTimeoutId = null;
    }

    const toast = document.createElement("div");
    toast.className = "rc-toast";
    toast.textContent = message;
    document.body.appendChild(toast);

    state.toastTimeoutId = window.setTimeout(() => {
      toast.remove();
      state.toastTimeoutId = null;
    }, 2600);
  }

  function createOverlay(extraClass = "") {
    const overlay = document.createElement("div");
    overlay.className = `rc-overlay ${extraClass}`.trim();
    return overlay;
  }

  function ensureSetupOverlay() {
    if (state.setupOverlay) {
      return state.setupOverlay;
    }

    state.setupOverlay = createOverlay();
    document.body.appendChild(state.setupOverlay);
    return state.setupOverlay;
  }

  function closeSetupOverlay() {
    if (state.setupOverlay) {
      state.setupOverlay.remove();
      state.setupOverlay = null;
    }
  }

  function closeAllOverlays() {
    document.querySelectorAll(".rc-overlay").forEach((overlay) => {
      overlay.remove();
    });

    state.setupOverlay = null;
    state.checkInOpen = false;
  }

  function scheduleNextReminder() {
    clearReminderTimeout();

    if (!state.session || !state.session.active) {
      return;
    }

    const minutes = safeInterval(
      state.session.intervalMinutes,
      DEFAULT_INTERVAL_MINUTES,
    );
    const durationMs = minutes * 60 * 1000;

    state.session.intervalMinutes = minutes;
    state.session.nextReminderAt = Date.now() + durationMs;
    state.session.updatedAt = Date.now();
    void saveSession(state.session);

    state.reminderTimeoutId = window.setTimeout(() => {
      showCheckInModal();
    }, durationMs);
  }

  function startReminders(session) {
    state.session = {
      ...session,
      intervalMinutes: safeInterval(
        session.intervalMinutes,
        DEFAULT_INTERVAL_MINUTES,
      ),
      active: true,
    };

    scheduleNextReminder();
  }

  async function stopReminders() {
    clearReminderTimeout();

    if (!state.session) {
      return;
    }

    state.session.active = false;
    state.session.nextReminderAt = null;
    state.session.updatedAt = Date.now();
    await saveSession(state.session);
  }

  function renderReasonStep(reasonValue, intervalValue) {
    const overlay = ensureSetupOverlay();
    overlay.innerHTML = `
      <div class="rc-modal">
        <p class="rc-kicker">Reality Check</p>
        <h2 class="rc-title">What brought you to YouTube?</h2>
        <p class="rc-subtitle">Set one clear reason before watching.</p>

        <label class="rc-label" for="rc-reason">Your reason</label>
        <textarea id="rc-reason" class="rc-input rc-textarea" placeholder="Example: Watch one tutorial on React hooks">${escapeHtml(reasonValue || "")}</textarea>
        <p id="rc-reason-error" class="rc-error" hidden>Please enter your reason to continue.</p>

        <button id="rc-next" class="rc-button rc-button--primary">Next</button>
      </div>
    `;

    const reasonInput = overlay.querySelector("#rc-reason");
    const nextButton = overlay.querySelector("#rc-next");
    const reasonError = overlay.querySelector("#rc-reason-error");

    reasonInput.focus();

    reasonInput.addEventListener("input", () => {
      if (reasonInput.value.trim()) {
        reasonError.hidden = true;
      }
    });

    nextButton.addEventListener("click", () => {
      const reason = reasonInput.value.trim();

      if (!reason) {
        reasonError.hidden = false;
        reasonInput.focus();
        return;
      }

      renderIntervalStep(reason, intervalValue);
    });
  }

  function renderIntervalStep(reasonValue, intervalValue) {
    const overlay = ensureSetupOverlay();
    const normalizedValue = safeInterval(
      intervalValue,
      DEFAULT_INTERVAL_MINUTES,
    );

    overlay.innerHTML = `
      <div class="rc-modal">
        <p class="rc-kicker">Reality Check</p>
        <h2 class="rc-title">How often should I remind you?</h2>
        <p class="rc-subtitle">Your reason: <strong>${escapeHtml(reasonValue)}</strong></p>

        <label class="rc-label" for="rc-minutes">Reminder interval</label>
        <div class="rc-inline-group">
          <input id="rc-minutes" class="rc-input rc-number" type="number" min="${MIN_INTERVAL_MINUTES}" max="${MAX_INTERVAL_MINUTES}" step="1" value="${normalizedValue}" />
          <span class="rc-inline-label">minutes</span>
        </div>
        <p id="rc-minutes-error" class="rc-error" hidden>Choose a value between ${MIN_INTERVAL_MINUTES} and ${MAX_INTERVAL_MINUTES} minutes.</p>

        <div class="rc-actions">
          <button id="rc-back" class="rc-button rc-button--ghost">Back</button>
          <button id="rc-start" class="rc-button rc-button--primary">Start reminders</button>
        </div>
      </div>
    `;

    const minutesInput = overlay.querySelector("#rc-minutes");
    const minutesError = overlay.querySelector("#rc-minutes-error");
    const backButton = overlay.querySelector("#rc-back");
    const startButton = overlay.querySelector("#rc-start");

    minutesInput.focus();
    minutesInput.select();

    minutesInput.addEventListener("input", () => {
      const parsed = Number.parseInt(minutesInput.value, 10);
      minutesError.hidden =
        Number.isFinite(parsed) &&
        parsed >= MIN_INTERVAL_MINUTES &&
        parsed <= MAX_INTERVAL_MINUTES;
    });

    backButton.addEventListener("click", () => {
      renderReasonStep(
        reasonValue,
        safeInterval(minutesInput.value, normalizedValue),
      );
    });

    startButton.addEventListener("click", async () => {
      const parsed = Number.parseInt(minutesInput.value, 10);

      if (
        !Number.isFinite(parsed) ||
        parsed < MIN_INTERVAL_MINUTES ||
        parsed > MAX_INTERVAL_MINUTES
      ) {
        minutesError.hidden = false;
        minutesInput.focus();
        return;
      }

      const session = {
        reason: reasonValue,
        intervalMinutes: Math.round(parsed),
        active: true,
        updatedAt: Date.now(),
      };

      await saveSession(session);
      closeSetupOverlay();
      startReminders(session);

      const minuteLabel = session.intervalMinutes === 1 ? "minute" : "minutes";

      showToast(
        `Reminder started every ${session.intervalMinutes} ${minuteLabel}.`,
      );
    });
  }

  function closeCheckInModal(overlay) {
    overlay.remove();
    state.checkInOpen = false;
  }

  function showCheckInModal() {
    if (!state.session || !state.session.active || state.checkInOpen) {
      return;
    }

    state.checkInOpen = true;

    const overlay = createOverlay("rc-overlay--soft");
    const escapedReason = escapeHtml(state.session.reason);

    function renderDecisionStep() {
      overlay.innerHTML = `
        <div class="rc-modal rc-modal--small">
          <p class="rc-kicker">Reminder</p>
          <h2 class="rc-title rc-title--small">Are you doing what you came for, or just scrolling?</h2>
          <p class="rc-subtitle">Reason: <strong>${escapedReason}</strong></p>

          <div class="rc-actions rc-actions--center">
            <button id="rc-stop" class="rc-button rc-button--ghost">Stop reminding me</button>
            <button id="rc-continue" class="rc-button rc-button--primary">Continue reminding me</button>
          </div>
        </div>
      `;

      const stopButton = overlay.querySelector("#rc-stop");
      const continueButton = overlay.querySelector("#rc-continue");

      stopButton.addEventListener("click", () => {
        renderStopConfirmStep();
      });

      continueButton.addEventListener("click", () => {
        closeCheckInModal(overlay);
        scheduleNextReminder();
      });
    }

    function renderStopConfirmStep() {
      overlay.innerHTML = `
        <div class="rc-modal rc-modal--small">
          <p class="rc-kicker">Confirm</p>
          <h2 class="rc-title rc-title--small">Stop reminders for this session?</h2>
          <p class="rc-subtitle">Type <span class="rc-keyword">STOP</span> to confirm. This helps avoid accidental clicks.</p>

          <label class="rc-label" for="rc-stop-word">Confirmation</label>
          <input id="rc-stop-word" class="rc-input" type="text" autocomplete="off" placeholder="Type STOP" />
          <p class="rc-helper">Reason: <strong>${escapedReason}</strong></p>

          <div class="rc-actions rc-actions--center">
            <button id="rc-cancel-stop" class="rc-button rc-button--ghost">Go back</button>
            <button id="rc-confirm-stop" class="rc-button rc-button--primary" disabled>Confirm stop</button>
          </div>
        </div>
      `;

      const stopWordInput = overlay.querySelector("#rc-stop-word");
      const cancelButton = overlay.querySelector("#rc-cancel-stop");
      const confirmStopButton = overlay.querySelector("#rc-confirm-stop");

      stopWordInput.focus();

      stopWordInput.addEventListener("input", () => {
        const isConfirmed = stopWordInput.value.trim().toUpperCase() === "STOP";
        confirmStopButton.disabled = !isConfirmed;
      });

      cancelButton.addEventListener("click", () => {
        renderDecisionStep();
      });

      confirmStopButton.addEventListener("click", async () => {
        await stopReminders();
        closeCheckInModal(overlay);
        showToast("Reminders stopped.");
      });
    }

    document.body.appendChild(overlay);
    renderDecisionStep();
  }

  function getSessionSnapshot() {
    if (!state.session) {
      return {
        active: false,
        reason: "",
        intervalMinutes: null,
        nextReminderAt: null,
      };
    }

    const intervalMinutes = safeInterval(
      state.session.intervalMinutes,
      DEFAULT_INTERVAL_MINUTES,
    );

    return {
      active: !!state.session.active,
      reason:
        typeof state.session.reason === "string" ? state.session.reason : "",
      intervalMinutes,
      nextReminderAt:
        state.session.active && typeof state.session.nextReminderAt === "number"
          ? state.session.nextReminderAt
          : null,
    };
  }

  async function openSetupFromToolbar() {
    injectStyles();
    closeAllOverlays();

    const savedSession = await readSession();

    if (savedSession) {
      state.session = {
        ...savedSession,
      };
    }

    const currentReason =
      typeof state.session?.reason === "string" ? state.session.reason : "";
    const currentInterval = state.session?.intervalMinutes;

    const reason =
      typeof savedSession?.reason === "string"
        ? savedSession.reason
        : currentReason;
    const interval = safeInterval(
      savedSession?.intervalMinutes ?? currentInterval,
      DEFAULT_INTERVAL_MINUTES,
    );

    renderReasonStep(reason, interval);
  }

  function registerRuntimeMessaging() {
    if (typeof chrome === "undefined" || !chrome.runtime?.onMessage) {
      return;
    }

    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (!message || typeof message !== "object") {
        return false;
      }

      if (typeof message.type !== "string" || !message.type.startsWith("rc-")) {
        return false;
      }

      (async () => {
        if (message.type === "rc-open-setup") {
          await openSetupFromToolbar();
          sendResponse({ ok: true });
          return;
        }

        if (message.type === "rc-stop-reminders") {
          await stopReminders();
          closeAllOverlays();
          showToast("Reminders stopped.");
          sendResponse({ ok: true, status: getSessionSnapshot() });
          return;
        }

        if (message.type === "rc-get-status") {
          if (!state.session) {
            const savedSession = await readSession();

            if (savedSession) {
              state.session = {
                ...savedSession,
              };

              if (state.session.active && state.reminderTimeoutId === null) {
                scheduleNextReminder();
              }
            }
          }

          sendResponse({ ok: true, status: getSessionSnapshot() });
          return;
        }

        sendResponse({ ok: false, error: "Unknown action." });
      })().catch(() => {
        sendResponse({ ok: false, error: "Unable to complete request." });
      });

      return true;
    });
  }

  function injectStyles() {
    if (document.getElementById("rc-style")) {
      return;
    }

    const style = document.createElement("style");
    style.id = "rc-style";
    style.textContent = `
      :root {
        --rc-text: #0b1220;
        --rc-muted: #475569;
        --rc-surface: #ffffff;
        --rc-border: #d6e2eb;
        --rc-primary: #0f766e;
        --rc-primary-hover: #115e59;
        --rc-shadow: 0 24px 55px rgba(15, 23, 42, 0.22);
      }

      .rc-overlay {
        position: fixed;
        inset: 0;
        z-index: 2147483647;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 22px;
        background:
          radial-gradient(circle at 12% 18%, rgba(15, 118, 110, 0.2), rgba(15, 118, 110, 0) 42%),
          radial-gradient(circle at 84% 82%, rgba(14, 165, 233, 0.18), rgba(14, 165, 233, 0) 45%),
          rgba(15, 23, 42, 0.45);
        backdrop-filter: blur(6px);
        animation: rc-fade-in 0.22s ease-out;
      }

      .rc-overlay--soft {
        background:
          radial-gradient(circle at 20% 15%, rgba(13, 148, 136, 0.16), rgba(13, 148, 136, 0) 40%),
          radial-gradient(circle at 82% 90%, rgba(56, 189, 248, 0.13), rgba(56, 189, 248, 0) 40%),
          rgba(15, 23, 42, 0.32);
      }

      .rc-modal {
        width: min(500px, 100%);
        background: linear-gradient(148deg, #ffffff, #f7fafc);
        border: 1px solid var(--rc-border);
        border-radius: 20px;
        box-shadow: var(--rc-shadow);
        color: var(--rc-text);
        padding: 28px;
        font-family: "Avenir Next", "Nunito Sans", "Trebuchet MS", sans-serif;
        animation: rc-rise-in 0.24s ease-out;
      }

      .rc-modal--small {
        width: min(560px, 100%);
      }

      .rc-kicker {
        margin: 0;
        font-size: 12px;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: #0f766e;
        font-weight: 700;
      }

      .rc-title {
        margin: 12px 0 8px;
        font-size: 28px;
        line-height: 1.2;
        letter-spacing: -0.02em;
      }

      .rc-title--small {
        font-size: 24px;
      }

      .rc-subtitle {
        margin: 0 0 18px;
        color: var(--rc-muted);
        font-size: 15px;
        line-height: 1.5;
      }

      .rc-label {
        display: block;
        margin-bottom: 8px;
        font-size: 14px;
        font-weight: 700;
        color: #1e293b;
      }

      .rc-input {
        width: 100%;
        border: 1px solid #c8d7e3;
        border-radius: 12px;
        font-size: 15px;
        padding: 12px 14px;
        background: #ffffff;
        color: #0b1220;
        box-sizing: border-box;
        transition: border-color 0.2s ease, box-shadow 0.2s ease;
      }

      .rc-input:focus {
        outline: none;
        border-color: #0f766e;
        box-shadow: 0 0 0 3px rgba(15, 118, 110, 0.18);
      }

      .rc-textarea {
        resize: vertical;
        min-height: 108px;
      }

      .rc-inline-group {
        display: grid;
        grid-template-columns: 130px 1fr;
        gap: 12px;
        align-items: center;
      }

      .rc-number {
        text-align: center;
      }

      .rc-inline-label {
        color: #334155;
        font-size: 15px;
      }

      .rc-error {
        margin: 8px 0 0;
        color: #b91c1c;
        font-size: 13px;
      }

      .rc-helper {
        margin: 10px 0 0;
        color: #475569;
        font-size: 13px;
      }

      .rc-keyword {
        color: #0f766e;
        font-weight: 800;
        letter-spacing: 0.05em;
      }

      .rc-actions {
        margin-top: 20px;
        display: flex;
        justify-content: flex-end;
        gap: 10px;
      }

      .rc-actions--center {
        justify-content: center;
      }

      .rc-button {
        border: none;
        border-radius: 12px;
        padding: 11px 16px;
        font-size: 14px;
        font-weight: 700;
        cursor: pointer;
        transition: transform 0.14s ease, box-shadow 0.2s ease, background-color 0.2s ease;
      }

      .rc-button:active {
        transform: translateY(1px);
      }

      .rc-button:disabled {
        opacity: 0.6;
        cursor: not-allowed;
        box-shadow: none;
      }

      .rc-button--primary {
        color: #ffffff;
        background: linear-gradient(135deg, var(--rc-primary), #0d9488);
        box-shadow: 0 8px 20px rgba(15, 118, 110, 0.3);
      }

      .rc-button--primary:hover {
        background: linear-gradient(135deg, var(--rc-primary-hover), #0f766e);
      }

      .rc-button--ghost {
        background: #eef4f8;
        color: #1f2937;
      }

      .rc-button--ghost:hover {
        background: #e3edf3;
      }

      .rc-toast {
        position: fixed;
        left: 50%;
        bottom: 20px;
        transform: translateX(-50%);
        z-index: 2147483647;
        background: #0b1220;
        color: #f8fafc;
        border-radius: 10px;
        padding: 10px 14px;
        font-size: 13px;
        font-family: "Avenir Next", "Nunito Sans", "Trebuchet MS", sans-serif;
        box-shadow: 0 10px 24px rgba(2, 6, 23, 0.25);
        animation: rc-rise-in 0.2s ease-out;
      }

      @keyframes rc-fade-in {
        from {
          opacity: 0;
        }
        to {
          opacity: 1;
        }
      }

      @keyframes rc-rise-in {
        from {
          opacity: 0;
          transform: translateY(12px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      @media (max-width: 600px) {
        .rc-modal {
          padding: 22px;
          border-radius: 16px;
        }

        .rc-title {
          font-size: 24px;
        }

        .rc-title--small {
          font-size: 21px;
        }

        .rc-inline-group {
          grid-template-columns: 1fr;
          gap: 8px;
        }

        .rc-actions {
          flex-direction: column-reverse;
        }

        .rc-button {
          width: 100%;
        }
      }
    `;

    document.head.appendChild(style);
  }

  async function initialize() {
    injectStyles();

    const savedSession = await readSession();

    if (savedSession) {
      state.session = {
        ...savedSession,
      };

      if (savedSession.active) {
        startReminders(savedSession);
      }
    }

    const reason =
      typeof savedSession?.reason === "string" ? savedSession.reason : "";
    const interval = safeInterval(
      savedSession?.intervalMinutes,
      DEFAULT_INTERVAL_MINUTES,
    );

    renderReasonStep(reason, interval);
  }

  registerRuntimeMessaging();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    initialize();
  }
})();
