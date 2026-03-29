
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
    const deviceId = getCookie("device_id");
    if (!deviceId || !deviceId.trim()) {
      console.error("Device ID missing from cookies; cannot refresh token.");
      return null;
    }
    return deviceId;
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
          method: "GET",
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

    if (response.status === 401 && !retried) {
      retried = true;

      const deviceId = getDeviceId();
      if (!deviceId) {
        logoutAndRedirect();
        throw new Error("Missing device ID");
      }

      console.log(`Received 401 on ${path}, attempting token refresh`);
      const refreshed = await refreshToken(deviceId);

      if (refreshed && retryOnRefresh) {
        ({ response, body } = await makeRequest());
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
    return (
      path.includes("index.html") ||
      path.includes("onboarding.html") ||
      path.endsWith("/") ||
      path === ""
    );
  }

  function logoutAndRedirect() {
    try {
      localStorage.removeItem("userData");
      sessionStorage.clear();
      window.location.replace("index.html");
    } catch (_) {
      window.location.href = "index.html";
    }
  }

  async function checkAuth() {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/check`, {
        method: "GET",
        credentials: "include",
        headers: {
          Accept: "application/json"
        }
      });

      const data = await parseResponseBody(response);
      return data?.authenticated === true;
    } catch (error) {
      console.error("Auth check error:", error);
      return false;
    }
  }

  async function checkAndRedirectIfAuthenticated() {
    try {
      const isAuthenticated = await checkAuth();
      if (isAuthenticated) {
        window.location.replace("dashboard.html");
      }
    } catch (error) {
      console.error("Auth check failed:", error);
    }
  }

  async function logout() {
    try {
      localStorage.removeItem("userData");
      localStorage.removeItem("device_id");
      sessionStorage.clear();

      try {
        await fetch(`${API_BASE_URL}/auth/logout`, {
          method: "POST",
          credentials: "include"
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
    _getCookie: getCookie
  };
})(window);
