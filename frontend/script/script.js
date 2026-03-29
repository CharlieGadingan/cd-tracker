// GitHub OAuth Configuration
const BACKEND_URL = "http://localhost:8080/api/oauth";
const BACKEND_ORIGIN = "http://localhost:8080";

// Check if user is already authenticated on page load
document.addEventListener("DOMContentLoaded", () => {
  if (window.ApiClient && typeof window.ApiClient.checkAndRedirectIfAuthenticated === "function") {
    window.ApiClient.checkAndRedirectIfAuthenticated();
  }
});

// Listen for OAuth result from popup
window.addEventListener("message", (event) => {
  // Only accept messages from backend (popup callback)
  if (event.origin !== BACKEND_ORIGIN) {
    console.warn("Ignored message from unexpected origin:", event.origin);
    return;
  }

  const data = event.data;
  if (!data || data.type !== "OAUTH_RESULT") return;

  console.log("OAuth result received:", data);

  if (data.registered === true) {
    window.location.href = "dashboard.html";
  } else {
    window.location.href = "onboarding.html";
  }
});

document.addEventListener("DOMContentLoaded", () => {
  const githubBtn = document.getElementById("githubLogin");
  if (!githubBtn) return;

  githubBtn.addEventListener("click", async () => {
    console.log("GitHub login clicked");

    const width = 400;
    const height = 500;
    const left = window.screen.width / 2 - width / 2;
    const top = window.screen.height / 2 - height / 2;

    const popup = window.open(
      "",
      "github-oauth",
      `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
    );

    if (!popup) {
      alert("Please allow popups for this site to login with GitHub");
      return;
    }

    try {
      const response = await fetch(`${BACKEND_URL}/github/authorize`, {
        method: "GET",
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to fetch GitHub auth URL");
      }

      const data = await response.json();
      console.log("Redirecting popup to GitHub:", data.authUrl);
      popup.location.href = data.authUrl;
    } catch (error) {
      console.error("GitHub login error:", error);
      alert("An error occurred while opening GitHub login. Please try again.");
      if (popup && !popup.closed) {
        popup.close();
      }
    }
  });
});