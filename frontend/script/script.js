// GitHub OAuth Configuration
const BACKEND_URL = "http://localhost:8080/api/oauth";
const BACKEND_ORIGIN = "http://localhost:8080";

// Check if user is already authenticated on page load
(async function checkAuth() {
  try {
    const response = await fetch("http://localhost:8080/api/auth/check", {
      method: "GET",
      credentials: "include",
    });
    const data = await response.json();
    if (data.authenticated == true) {
      window.location.replace("dashboard.html");
      return;
    }
  } catch (error) {
    console.error("Auth check failed:", error);
  }
})();

// Listen for OAuth result from popup
window.addEventListener("message", (event) => {
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

    // Poll for manual popup close
    let oauthCompleted = false;
    const pollClosed = setInterval(() => {
      if (popup.closed) {
        clearInterval(pollClosed);
        if (!oauthCompleted) {
          console.log("OAuth popup closed by user before completing.");
          githubBtn.disabled = false;
          githubBtn.innerHTML = `<i class="fab fa-github"></i> Login with GitHub`;
        }
      }
    }, 500);

    // Mark OAuth as completed only on the expected backend OAuth result message.
    const onOauthMessage = (event) => {
      if (event.origin !== BACKEND_ORIGIN || event.data?.type !== "OAUTH_RESULT") {
        return;
      }

      oauthCompleted = true;
      clearInterval(pollClosed);
      window.removeEventListener("message", onOauthMessage);
    };
    window.addEventListener("message", onOauthMessage);

    try {
      githubBtn.disabled = true;
      githubBtn.innerHTML = `<i class="fab fa-github"></i> Opening GitHub...`;

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
      clearInterval(pollClosed);
      githubBtn.disabled = false;
      githubBtn.innerHTML = `<i class="fab fa-github"></i> Login with GitHub`;
      alert("An error occurred while opening GitHub login. Please try again.");
      if (popup && !popup.closed) {
        popup.close();
      }
    }
  });

  // Email login
  const emailBtn = document.getElementById("emailbLogin");
  if (emailBtn) {
    emailBtn.addEventListener("click", () => {
      const email = document.querySelector(".email-input").value.trim();
      if (!email) {
        alert("Please enter your email address.");
        return;
      }
      console.log("Continue with email:", email);
    });
  }
});