      const userApi = window.ApiClient?.user;

      // ── Check if user is already initialized ──────────────────
      async function checkAndRedirectIfInitialized() {
        try {
          if (!userApi) return;
          const profile = await userApi.getProfile();
          // If profile exists and user has firstName (indicating they completed onboarding)
          if (profile && profile.firstName) {
            window.location.replace("/dashboard/");
          }
        } catch (error) {
          // User not authenticated or error occurred, allow onboarding to proceed
          console.log("No existing profile found, allowing onboarding to proceed");
        }
      }

      // Run check immediately
      checkAndRedirectIfInitialized();

      // ── Elements ──────────────────────────────────────────────
      const form = document.getElementById("regForm");
      const submitBtn = document.getElementById("submitBtn");
      const spinner = document.getElementById("spinner");
      const alertEl = document.getElementById("alert");
      const fileInput = document.getElementById("profileFile");
      const uploadZone = document.getElementById("uploadZone");
      const avatar = document.getElementById("avatar");
      const uploadTitle = document.getElementById("uploadTitle");
      const uploadHint = document.getElementById("uploadHint");
      const uploadFname = document.getElementById("uploadFname");

      // ── Validators ────────────────────────────────────────────
      const validators = {
        firstName: (v) => (v.trim() ? null : "First name is required"),
        lastName: (v) => (v.trim() ? null : "Last name is required"),
        phoneNumber: (v) => {
          if (!v.trim()) return "Phone number is required";
          return /^\+?[\d\s\-()+]+$/.test(v) ? null : "Invalid phone format";
        },
        birthday: (v) => {
          if (!v) return "Birthday is required";
          const d = new Date(v),
            now = new Date();
          if (d >= now) return "Must be in the past";
          if (now.getFullYear() - d.getFullYear() < 13)
            return "Must be at least 13";
          return null;
        },
        gender: (v) => (v ? null : "Gender is required"),
        bio: (v) => (v.length > 350 ? "Max 350 characters" : null),
      };

      function setFieldError(id, msg) {
        const el = document.getElementById(id);
        const err = document.getElementById(id + "Err");
        if (msg) {
          el.classList.add("err");
          err.textContent = msg;
          err.classList.add("show");
          return false;
        }
        el.classList.remove("err");
        err.classList.remove("show");
        return true;
      }

      function validateField(id) {
        const v = validators[id];
        if (!v) return true;
        const el = document.getElementById(id);
        return setFieldError(id, v(el.value));
      }

      function validateFile() {
        const f = fileInput.files[0];
        if (!f) {
          clearFileError();
          return true;
        }
        if (!f.type.startsWith("image/")) {
          showFileError("Must be an image");
          return false;
        }
        if (f.size > 5 * 1024 * 1024) {
          showFileError("Max size is 5 MB");
          return false;
        }
        clearFileError();
        return true;
      }

      function showFileError(msg) {
        uploadZone.classList.add("err");
        const e = document.getElementById("profileFileErr");
        e.textContent = msg;
        e.classList.add("show");
      }

      function clearFileError() {
        uploadZone.classList.remove("err");
        document.getElementById("profileFileErr").classList.remove("show");
      }

      function validateAll() {
        const fields = Object.keys(validators).map((id) => validateField(id));
        const file = validateFile();
        return fields.every(Boolean) && file;
      }

      // ── Real-time validation ──────────────────────────────────
      Object.keys(validators).forEach((id) => {
        const el = document.getElementById(id);
        if (el) {
          el.addEventListener("blur", () => validateField(id));
          el.addEventListener("input", () => validateField(id));
        }
      });

      // ── File preview ──────────────────────────────────────────
      fileInput.addEventListener("change", handleFile);

      function handleFile() {
        const f = fileInput.files[0];
        if (!f) return;
        validateFile();
        uploadFname.textContent = f.name;
        uploadFname.style.display = "block";
        uploadTitle.textContent = "Photo selected";
        uploadHint.style.display = "none";
        uploadZone.classList.add("has-file");
        const reader = new FileReader();
        reader.onload = (e) => {
          avatar.innerHTML = `<img src="${e.target.result}" alt="preview">`;
        };
        reader.readAsDataURL(f);
      }

      // Drag & drop
      uploadZone.addEventListener("dragover", (e) => {
        e.preventDefault();
        uploadZone.classList.add("drag");
      });
      uploadZone.addEventListener("dragleave", () =>
        uploadZone.classList.remove("drag"),
      );
      uploadZone.addEventListener("drop", (e) => {
        e.preventDefault();
        uploadZone.classList.remove("drag");
        const f = e.dataTransfer.files[0];
        if (!f) return;
        const dt = new DataTransfer();
        dt.items.add(f);
        fileInput.files = dt.files;
        handleFile();
      });

      // ── Submit ────────────────────────────────────────────────
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (!validateAll()) return;

        spinner.style.display = "inline-block";
        submitBtn.disabled = true;
        alertEl.className = "alert";

        try {
          const dataPayload = {
            firstName: document.getElementById("firstName").value.trim(),
            lastName: document.getElementById("lastName").value.trim(),
            phoneNumber: document.getElementById("phoneNumber").value.trim(),
            gender: document.getElementById("gender").value,
            birthday: document.getElementById("birthday").value,
            bio: document.getElementById("bio").value.trim() || null,
          };
          if (!userApi) {
            throw new Error("API client is not initialized.");
          }

          const result = await userApi.register(dataPayload, fileInput.files[0]);

          if (result) {
            showAlert("success", result.message || "Profile completed!");
            if (result.data)
              localStorage.setItem("userData", JSON.stringify(result.data));
            setTimeout(() => {
              window.location.href = "/dashboard/";
            }, 2000);
          }
        } catch (err) {
          showAlert("error", err.message || "Registration failed. Try again.");
        } finally {
          spinner.style.display = "none";
          submitBtn.disabled = false;
        }
      });

      function showAlert(type, msg) {
        alertEl.textContent = msg;
        alertEl.className = `alert ${type} show`;
        if (type === "error")
          setTimeout(() => alertEl.classList.remove("show"), 5000);
      }