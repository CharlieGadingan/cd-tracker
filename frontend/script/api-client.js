(function attachApiClient(globalScope) {
  const API_BASE_URL = "http://localhost:8080/api";

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

  async function request(path, options = {}, config = {}) {
    const { redirectOnUnauthorized = true } = config;
    const response = await fetch(`${API_BASE_URL}${path}`, {
      credentials: "include",
      ...options,
    });

    const body = await parseResponseBody(response);

    if (!response.ok) {
      if (redirectOnUnauthorized && response.status === 401) {
        window.location.replace("index.html");
        throw new Error("Authentication required");
      }

      throw new Error(extractErrorMessage(body, `Server error: ${response.status}`));
    }

    return body;
  }

  function createRegistrationFormData(payload, profileFile) {
    const formData = new FormData();
    formData.append(
      "data",
      new Blob([JSON.stringify(payload)], {
        type: "application/json",
      })
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
        body: createRegistrationFormData(payload, profileFile),
      });
    },

    getProfile() {
      return request("/users/profile", { method: "GET" });
    },

    updateProfile(payload) {
      return request("/users/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    },

    updateProfilePicture(file) {
      const formData = new FormData();
      formData.append("file", file);

      return request("/users/profile/update", {
        method: "PATCH",
        body: formData,
      });
    },

    removeProfilePicture() {
      return request("/users/profile/remove", { method: "DELETE" });
    },
  };

  const classrooms = {
    closeClassroom(classroomId) {
      if (!classroomId) {
        throw new Error("Classroom ID is required");
      }

      return request(`/classrooms/${encodeURIComponent(classroomId)}/close`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
      });
    },

    deleteClassroom(classroomId) {
      if (!classroomId) {
        throw new Error("Classroom ID is required");
      }

      return request(`/classrooms/${encodeURIComponent(classroomId)}`, {
        method: "DELETE",
      });
    },
  };

  globalScope.ApiClient = {
    request,
    parseResponseBody,
    extractErrorMessage,
    user,
    classrooms,
  };
})(window);
