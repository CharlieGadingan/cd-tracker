
(function attachApiClient(globalScope) {
  const API_BASE_URL = "http://localhost:8080/api";

  function getCookie(name) {
    if (!document.cookie) return null;

    const cookies = document.cookie.split(";");
    for (const cookie of cookies) {
      const trimmed = cookie.trim();
      const [cookieName, ...rest] = trimmed.split("=");

      if (cookieName === name) {
        const cookieValue = rest.join("=");
        try {
          return decodeURIComponent(cookieValue);
        } catch (_) {
          return cookieValue;
        }
      }
    }

    return null;
  }

  function getDeviceId() {
    const cookieDeviceId = getCookie("device_id");
    if (cookieDeviceId && cookieDeviceId.trim()) {
      return cookieDeviceId.trim();
    }

    // Fallback for environments where the device cookie may not be readable.
    const storageDeviceId = localStorage.getItem("device_id") || sessionStorage.getItem("device_id");
    if (storageDeviceId && storageDeviceId.trim()) {
      return storageDeviceId.trim();
    }

    console.error("Device ID missing; cannot refresh token.");
    return null;
  }

  async function parseResponseBody(response) {
    const text = await response.text();
    if (!text) return null;

    try {
      return JSON.parse(text);
    } catch (_) {
      return text;
    }
  }

  function extractErrorMessage(body, fallback) {
    if (!body) return fallback;
    if (typeof body === "string") return body;
    if (Array.isArray(body.errors) && body.errors.length) {
      return body.errors.join(" ");
    }
    return body.message || body.error || body.data?.message || body.data?.error || fallback;
  }

  let isRefreshing = false;
  let refreshPromise = null;
  let lastRefreshSucceededAt = 0;
  const REFRESH_COOLDOWN_MS = 10000;

  function isAuthEndpoint(path) {
    return String(path || "").startsWith("/auth/");
  }

  async function refreshToken(deviceId) {
    if (!deviceId || !deviceId.trim()) {
      console.error("Cannot refresh token: invalid device ID");
      return false;
    }

    if (isRefreshing && refreshPromise) {
      return refreshPromise;
    }

    isRefreshing = true;

    refreshPromise = (async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/auth/refresh/${encodeURIComponent(deviceId)}`, {
          method: "POST",
          credentials: "include",
          headers: {
            Accept: "application/json"
          }
        });

        const body = await parseResponseBody(response);

        if (!response.ok) {
          console.error("Token refresh failed:", extractErrorMessage(body, `Refresh failed with status ${response.status}`));
          return false;
        }

        lastRefreshSucceededAt = Date.now();
        console.log("JWT token refreshed successfully");
        return true;
      } catch (error) {
        console.error("Refresh token error:", error);
        return false;
      } finally {
        isRefreshing = false;
        refreshPromise = null;
      }
    })();

    return refreshPromise;
  }

  async function request(path, options = {}, config = {}) {
    const {
      redirectOnUnauthorized = true,
      retryOnRefresh = true
    } = config;

    let retried = false;

    async function makeRequest() {
      const response = await fetch(`${API_BASE_URL}${path}`, {
        credentials: "include",
        ...options
      });

      const body = await parseResponseBody(response);
      return { response, body };
    }

    let { response, body } = await makeRequest();

    if (response.status === 401 && !retried && retryOnRefresh && !isAuthEndpoint(path)) {
      retried = true;

      // Prevent refresh storm when backend keeps returning 401 after a recent successful refresh.
      if (Date.now() - lastRefreshSucceededAt < REFRESH_COOLDOWN_MS) {
        console.warn(`Skipping refresh for ${path}; refreshed too recently.`);
      } else {
        const deviceId = getDeviceId();
        if (!deviceId) {
          logoutAndRedirect();
          throw new Error("Missing device ID");
        }

        console.log(`Received 401 on ${path}, attempting token refresh`);
        const refreshed = await refreshToken(deviceId);

        if (refreshed) {
          ({ response, body } = await makeRequest());
        }
      }
    }

    if (!response.ok) {
      if (redirectOnUnauthorized && response.status === 401) {
        if (!isOnLoginPage()) {
          logoutAndRedirect();
        }
        throw new Error("Authentication required");
      }

      throw new Error(extractErrorMessage(body, `Server error: ${response.status}`));
    }

    return body;
  }

  function isOnLoginPage() {
    const path = window.location.pathname;
    const normalizedPath = path.endsWith("/") && path.length > 1 ? path.slice(0, -1) : path;

    return normalizedPath === "" ||
      normalizedPath === "/" ||
      normalizedPath === "/index.html" ||
      normalizedPath === "/onboarding";
  }

  function logoutAndRedirect() {
    try {
      localStorage.removeItem("userData");
      sessionStorage.clear();
      window.location.replace("/");
    } catch (_) {
      window.location.href = "/";
    }
  }

  async function checkSessionState() {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/check`, {
        method: "GET",
        credentials: "include",
        headers: {
          Accept: "application/json"
        }
      });

      const data = await parseResponseBody(response);
      return {
        authenticated: data?.authenticated === true,
        fullyInitialized: data?.fullyInitialized === true,
        data
      };
    } catch (error) {
      console.error("Auth check error:", error);
      return {
        authenticated: false,
        fullyInitialized: false,
        data: null
      };
    }
  }

  async function checkAuth() {
    const sessionState = await checkSessionState();
    return sessionState.authenticated;
  }

  async function checkAndRedirectIfAuthenticated() {
    try {
      const sessionState = await checkSessionState();
      if (sessionState.authenticated) {
        window.location.replace(sessionState.fullyInitialized ? "/dashboard/" : "/onboarding/");
      }
    } catch (error) {
      console.error("Auth check failed:", error);
    }
  }

  async function logout() {
    try {
      const deviceId = getDeviceId();

      localStorage.removeItem("userData");
      localStorage.removeItem("device_id");
      sessionStorage.clear();

      try {
        const logoutPath = deviceId
          ? `/auth/logout/${encodeURIComponent(deviceId)}`
          : "/auth/logout";

        await fetch(`${API_BASE_URL}${logoutPath}`, {
          method: "POST",
          credentials: "include",
          headers: {
            Accept: "application/json"
          }
        });
      } catch (_) {
      }

      logoutAndRedirect();
    } catch (_) {
      logoutAndRedirect();
    }
  }

  function createRegistrationFormData(payload, profileFile) {
    const formData = new FormData();
    formData.append(
      "data",
      new Blob([JSON.stringify(payload)], { type: "application/json" })
    );

    if (profileFile) {
      formData.append("profile", profileFile);
    }

    return formData;
  }

  const dialogState = {
    queue: Promise.resolve(),
    mounted: false,
    overlay: null,
    title: null,
    message: null,
    cancelBtn: null,
    confirmBtn: null
  };

  function mountDialog() {
    if (dialogState.mounted || !document?.body) return;

    const style = document.createElement("style");
    style.id = "ct-dialog-style";
    style.textContent = `
      .ct-dialog-overlay {
        position: fixed;
        inset: 0;
        background: rgba(1, 4, 9, 0.72);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 16px;
        z-index: 9999;
      }
      .ct-dialog-overlay[hidden] {
        display: none;
      }
      .ct-dialog-box {
        width: min(480px, 100%);
        background: #161b22;
        border-radius: 12px;
        box-shadow: 0 20px 40px rgba(0, 0, 0, 0.45);
        border: 1px solid #30363d;
        padding: 18px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      }
      .ct-dialog-title {
        margin: 0 0 10px;
        color: #e6edf3;
        font-size: 18px;
        line-height: 1.3;
      }
      .ct-dialog-message {
        margin: 0;
        color: #8b949e;
        font-size: 14px;
        line-height: 1.55;
        white-space: pre-line;
      }
      .ct-dialog-actions {
        margin-top: 18px;
        display: flex;
        justify-content: flex-end;
        gap: 10px;
      }
      .ct-dialog-btn {
        border: 1px solid #30363d;
        border-radius: 8px;
        padding: 9px 14px;
        font-size: 14px;
        cursor: pointer;
        transition: background 0.15s, border-color 0.15s;
      }
      .ct-dialog-btn:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }
      .ct-dialog-btn-cancel {
        background: #21262d;
        color: #c9d1d9;
      }
      .ct-dialog-btn-cancel:hover {
        background: #30363d;
        border-color: #484f58;
      }
      .ct-dialog-btn-confirm {
        background: #1f6feb;
        border-color: #1f6feb;
        color: #ffffff;
      }
      .ct-dialog-btn-confirm:hover {
        background: #388bfd;
        border-color: #388bfd;
      }
      .ct-dialog-btn-confirm.ct-danger {
        background: #da3633;
        border-color: #da3633;
      }
      .ct-dialog-btn-confirm.ct-danger:hover {
        background: #f85149;
        border-color: #f85149;
      }
    `;

    const overlay = document.createElement("div");
    overlay.className = "ct-dialog-overlay";
    overlay.hidden = true;
    overlay.innerHTML = `
      <div class="ct-dialog-box" role="dialog" aria-modal="true" aria-live="polite">
        <h3 class="ct-dialog-title"></h3>
        <p class="ct-dialog-message"></p>
        <div class="ct-dialog-actions">
          <button type="button" class="ct-dialog-btn ct-dialog-btn-cancel">Cancel</button>
          <button type="button" class="ct-dialog-btn ct-dialog-btn-confirm">OK</button>
        </div>
      </div>
    `;

    document.head.appendChild(style);
    document.body.appendChild(overlay);

    dialogState.overlay = overlay;
    dialogState.title = overlay.querySelector(".ct-dialog-title");
    dialogState.message = overlay.querySelector(".ct-dialog-message");
    dialogState.cancelBtn = overlay.querySelector(".ct-dialog-btn-cancel");
    dialogState.confirmBtn = overlay.querySelector(".ct-dialog-btn-confirm");
    dialogState.mounted = true;
  }

  function queueDialog(task) {
    dialogState.queue = dialogState.queue.then(task, task);
    return dialogState.queue;
  }

  function openDialog({ title, message, confirmText, cancelText, mode, danger }) {
    return queueDialog(() => new Promise((resolve) => {
      mountDialog();
      if (!dialogState.mounted) {
        resolve(mode === "confirm" ? false : undefined);
        return;
      }

      const { overlay, title: titleEl, message: messageEl, cancelBtn, confirmBtn } = dialogState;
      titleEl.textContent = title;
      messageEl.textContent = message;
      cancelBtn.textContent = cancelText;
      confirmBtn.textContent = confirmText;
      cancelBtn.hidden = mode !== "confirm";
      confirmBtn.classList.toggle("ct-danger", Boolean(danger));
      overlay.hidden = false;

      const activeBefore = document.activeElement;

      const close = (result) => {
        overlay.hidden = true;
        overlay.removeEventListener("click", onOverlayClick);
        document.removeEventListener("keydown", onKeyDown);
        cancelBtn.removeEventListener("click", onCancel);
        confirmBtn.removeEventListener("click", onConfirm);
        if (activeBefore && typeof activeBefore.focus === "function") {
          activeBefore.focus();
        }
        resolve(result);
      };

      const onConfirm = () => close(mode === "confirm" ? true : undefined);
      const onCancel = () => close(false);
      const onOverlayClick = (event) => {
        if (event.target === overlay) {
          close(mode === "confirm" ? false : undefined);
        }
      };
      const onKeyDown = (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          close(mode === "confirm" ? false : undefined);
        }
      };

      overlay.addEventListener("click", onOverlayClick);
      document.addEventListener("keydown", onKeyDown);
      cancelBtn.addEventListener("click", onCancel);
      confirmBtn.addEventListener("click", onConfirm);
      confirmBtn.focus();
    }));
  }

  const dialog = {
    alert(message, options = {}) {
      return openDialog({
        mode: "alert",
        title: options.title || "Notice",
        message: String(message || ""),
        confirmText: options.confirmText || "OK",
        cancelText: "Cancel",
        danger: options.danger
      });
    },

    confirm(message, options = {}) {
      return openDialog({
        mode: "confirm",
        title: options.title || "Confirm",
        message: String(message || ""),
        confirmText: options.confirmText || "Confirm",
        cancelText: options.cancelText || "Cancel",
        danger: options.danger
      });
    }
  };

  const user = {
    register(payload, profileFile) {
      return request("/users/register", {
        method: "POST",
        headers: { Accept: "application/json" },
        body: createRegistrationFormData(payload, profileFile)
      });
    },

    getProfile() {
      return request("/users/profile", { method: "GET" });
    },

    updateProfile(payload) {
      return request("/users/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
    },

    updateProfilePicture(file) {
      const formData = new FormData();
      formData.append("file", file);
      return request("/users/profile/update", {
        method: "PATCH",
        body: formData
      });
    },

    removeProfilePicture() {
      return request("/users/profile/remove", { method: "DELETE" });
    }
  };

  globalScope.ApiClient = {
    request,
    user,
    checkAuth,
    checkAndRedirectIfAuthenticated,
    logout,
    getDeviceId,
    refreshToken, 
    checkSessionState,
    _getCookie: getCookie
  };

  globalScope.AppDialog = dialog;
})(window);
