// GitHub OAuth Configuration
const BACKEND_URL = "http://localhost:8080/api/oauth";

function clearOAuthQueryParamsFromUrl() {
  const url = new URL(window.location.href);
  url.searchParams.delete("oauth");
  url.searchParams.delete("success");
  url.searchParams.delete("registered");
  url.searchParams.delete("error");
  window.history.replaceState({}, document.title, url.toString());
}

function parseBooleanParam(value) {
  if (typeof value !== "string") return null;
  if (value.toLowerCase() === "true") return true;
  if (value.toLowerCase() === "false") return false;
  return null;
}

function handleOAuthCallbackRedirect() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("oauth") !== "github") return false;

  const success = parseBooleanParam(params.get("success"));
  const registered = parseBooleanParam(params.get("registered"));
  const error = params.get("error");

  if (success === true) {
    clearOAuthQueryParamsFromUrl();
    if (registered === true) {
      window.location.replace("/frontend/pages/dashboard.html");
    } else {
      window.location.replace("/frontend/pages/onboarding.html");
    }
    return true;
  }

  if (success === false) {
    const message = (typeof error === "string" && error.trim())
      ? error.trim()
      : "GitHub sign in failed. Please try again.";
    clearOAuthQueryParamsFromUrl();
    console.warn("GitHub OAuth sign-in failed:", message);
    return true;
  }

  return false;
}

function getDeviceIdForAutoRedirect() {
  if (window.ApiClient?._getCookie) {
    const cookieDeviceId = window.ApiClient._getCookie("device_id");
    if (cookieDeviceId && cookieDeviceId.trim()) {
      return cookieDeviceId.trim();
    }
  }

  const storageDeviceId = localStorage.getItem("device_id") || sessionStorage.getItem("device_id");
  if (storageDeviceId && storageDeviceId.trim()) {
    return storageDeviceId.trim();
  }

  return null;
}

// Check if user is already authenticated on page load.
document.addEventListener("DOMContentLoaded", async () => {
  if (handleOAuthCallbackRedirect()) {
    return;
  }

  if (!window.ApiClient) return;

  const deviceId = getDeviceIdForAutoRedirect();
  if (!deviceId) return;

  try {
    const refreshed = await window.ApiClient.refreshToken(deviceId);
    if (refreshed) {
      window.location.replace("/frontend/pages/dashboard.html");
      return;
    }

    const authenticated = await window.ApiClient.checkAuth();
    if (authenticated) {
      window.location.replace("/frontend/pages/dashboard.html");
    }
  } catch (error) {
    console.warn("Auto-redirect check failed:", error);
  }
});

document.addEventListener("DOMContentLoaded", () => {
  const githubBtn = document.getElementById("githubLogin");
  if (!githubBtn) return;

  githubBtn.addEventListener("click", () => {
    console.log("GitHub login clicked");

    githubBtn.disabled = true;
    window.location.assign(`${BACKEND_URL}/github/authorize`);
  });
});