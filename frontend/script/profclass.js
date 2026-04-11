const apiRequest = window.ApiClient?.request;

const state = {
  classroomId: null,
  currentUser: null,
  activities: [],
  students: [],
  submittedByActivity: {},
  currentSubmissionsActivityId: null,
  currentSubmissionRows: [],
  submissionFilter: "ALL",
  currentDetailRow: null,
};

document.addEventListener("DOMContentLoaded", async () => {
  if (!apiRequest) {
    showNotification("API client is not initialized.", "error");
    return;
  }

  state.classroomId = extractClassroomId();
  if (!state.classroomId) {
    showNotification("Classroom ID not found in URL.", "error");
    setTimeout(() => {
      window.location.href = "/dashboard/";
    }, 1200);
    return;
  }

  setupEventListeners();
  await loadInitialData();
});

function extractClassroomId() {
  const params = new URLSearchParams(window.location.search);
  const value = params.get("id") || params.get("classroomId") || "";
  return String(value).trim();
}

function setupEventListeners() {
  const assignmentsList = document.getElementById("assignmentsList");
  const createBtn = document.getElementById("createActivityBtn");
  const saveCreateBtn = document.getElementById("saveActivityBtn");
  const saveEditBtn = document.getElementById("saveEditActivityBtn");
  const saveGradeBtn = document.getElementById("saveGradeBtn");
  const backBtn = document.getElementById("backDashboardBtn");
  const submissionFilter = document.getElementById("submissionFilter");

  if (createBtn) {
    createBtn.addEventListener("click", () => {
      const form = document.getElementById("createActivityForm");
      if (form) form.reset();
      const status = document.getElementById("activityStatus");
      if (status) status.value = "PUBLISHED";
      openModal("createActivityModal");
    });
  }

  if (saveCreateBtn) {
    saveCreateBtn.addEventListener("click", async () => {
      await handleCreateActivity();
    });
  }

  if (saveEditBtn) {
    saveEditBtn.addEventListener("click", async () => {
      await handleEditActivity();
    });
  }

  if (saveGradeBtn) {
    saveGradeBtn.addEventListener("click", async () => {
      await handleSubmitGrade();
    });
  }

  if (backBtn) {
    backBtn.addEventListener("click", (event) => {
      event.preventDefault();
      window.location.href = "/dashboard/";
    });
  }

  if (submissionFilter) {
    submissionFilter.addEventListener("change", (event) => {
      state.submissionFilter = String(
        event.target.value || "ALL",
      ).toUpperCase();
      renderSubmissionRows();
    });
  }

  if (assignmentsList) {
    assignmentsList.addEventListener("click", async (event) => {
      const actionButton = event.target.closest("[data-action]");
      if (!actionButton) return;

      const action = actionButton.getAttribute("data-action");
      const activityId = actionButton.getAttribute("data-activity-id");
      if (!activityId) return;

      if (action === "view-submissions") {
        await openSubmissionsModal(activityId);
        return;
      }

      if (action === "edit-activity") {
        openEditActivityModal(activityId);
        return;
      }

      if (action === "delete-activity") {
        await deleteActivity(activityId);
      }
    });
  }

  const submissionsList = document.getElementById("submissionsList");
  if (submissionsList) {
    submissionsList.addEventListener("click", async (event) => {
      const actionButton = event.target.closest("[data-action]");
      if (!actionButton) return;

      const action = actionButton.getAttribute("data-action");

      // Handle analyze action (doesn't need activityId or studentId)
      if (action === "analyze-code") {
        const repoUrl = actionButton.getAttribute("data-repo-url");
        const activityTitle = actionButton.getAttribute("data-activity-title");
        const studentName = actionButton.getAttribute("data-student-name");

        if (repoUrl) {
          navigateToSyntaxAnalyzer(repoUrl, activityTitle, studentName);
        } else {
          showNotification(
            "No repository URL available for analysis.",
            "error",
          );
        }
        return;
      }

      const activityId = actionButton.getAttribute("data-activity-id");
      const studentId = actionButton.getAttribute("data-student-id");
      if (!activityId || !studentId) return;

      if (action === "grade-student") {
        openGradeModal(activityId, studentId);
        return;
      }

      if (action === "view-submission-detail") {
        openSubmissionDetailModal(activityId, studentId);
      }
    });
  }

  const submittedDetailBody = document.getElementById("submittedDetailBody");
  if (submittedDetailBody) {
    submittedDetailBody.addEventListener("click", async (event) => {
      const actionButton = event.target.closest("[data-action]");
      if (!actionButton) return;

      const action = actionButton.getAttribute("data-action");
      if (action !== "copy-submission-url" && action !== "copy-clone-command")
        return;

      const row = state.currentDetailRow;
      if (!row || !row.repositoryUrl) {
        showNotification("Repository URL is unavailable.", "error");
        return;
      }

      if (action === "copy-submission-url") {
        await copyTextWithFeedback(row.repositoryUrl, "Repository URL copied.");
        return;
      }

      if (action === "copy-clone-command") {
        await copyTextWithFeedback(
          `git clone ${row.repositoryUrl}`,
          "Clone command copied.",
        );
      }
    });
  }

  const submittedDetailBack = document.getElementById(
    "closeSubmittedDetailBtn",
  );
  if (submittedDetailBack) {
    submittedDetailBack.addEventListener("click", () => {
      closeModal("submittedDetailModal");
      if (state.currentSubmissionsActivityId) {
        openModal("submissionsModal");
      }
    });
  }

  document.querySelectorAll("[data-close-modal]").forEach((element) => {
    element.addEventListener("click", () => {
      const modalId = element.getAttribute("data-close-modal");
      closeModal(modalId);
    });
  });

  window.addEventListener("click", (event) => {
    const modal = event.target.closest(".modal");
    if (!modal || event.target !== modal) return;
    closeModal(modal.id);
  });
}

async function loadInitialData() {
  await Promise.all([
    loadUserProfile(),
    loadStudents(),
    loadActivities(),
    loadSubmittedActivities(),
  ]);

  renderStudents();
  renderActivities();
  renderOverview();
}

async function loadUserProfile() {
  try {
    const result = await apiRequest("/users/profile", { method: "GET" });
    const profile =
      result?.data && typeof result.data === "object" && !result.firstName
        ? result.data
        : result;

    const firstName = asString(profile?.firstName);
    const lastName = asString(profile?.lastName);
    const fullName = `${firstName} ${lastName}`.trim() || "Professor";
    const profileUrl = asString(profile?.profileUrl);

    state.currentUser = profile;

    const nameEl = document.getElementById("professorName");
    const avatarEl = document.getElementById("professorAvatar");

    if (nameEl) nameEl.textContent = fullName;
    if (avatarEl) {
      if (profileUrl) {
        avatarEl.innerHTML = `<img src="${escapeHtml(profileUrl)}" alt="${escapeHtml(fullName)}">`;
      } else {
        avatarEl.textContent = getInitials(fullName, "PR");
      }
    }
  } catch (error) {
    console.error("Failed to load profile:", error);
    const nameEl = document.getElementById("professorName");
    const avatarEl = document.getElementById("professorAvatar");
    if (nameEl) nameEl.textContent = "Professor";
    if (avatarEl) avatarEl.textContent = "PR";
  }
}

async function loadStudents() {
  try {
    const result = await apiRequest(
      `/classrooms/${encodeURIComponent(state.classroomId)}/students`,
      {
        method: "GET",
      },
    );

    const payload = Array.isArray(result)
      ? result
      : Array.isArray(result?.data)
        ? result.data
        : [];

    state.students = payload
      .map(normalizeStudent)
      .filter((student) => student.userId);
  } catch (error) {
    console.error("Failed to load students:", error);
    state.students = [];
    showNotification(error?.message || "Failed to load students.", "error");
  }
}

async function loadActivities() {
  try {
    const result = await apiRequest(
      `/classrooms/${encodeURIComponent(state.classroomId)}/activities/owner`,
      {
        method: "GET",
      },
    );

    const payload = Array.isArray(result)
      ? result
      : Array.isArray(result?.data)
        ? result.data
        : [];

    state.activities = payload;
  } catch (error) {
    console.error("Failed to load activities:", error);
    state.activities = [];
    showNotification(error?.message || "Failed to load activities.", "error");
  }
}

async function loadSubmittedActivities() {
  try {
    const result = await apiRequest(
      `/classrooms/${encodeURIComponent(state.classroomId)}/activities/submitted`,
      {
        method: "GET",
      },
    );

    const payload = extractSubmittedPayload(result);
    state.submittedByActivity = mapSubmittedByActivity(payload);
  } catch (error) {
    console.error("Failed to load submitted activities:", error);
    state.submittedByActivity = {};
    showNotification(
      error?.message || "Failed to load submitted activities.",
      "error",
    );
  }
}

function normalizeStudent(entry) {
  const userId = asString(entry?.studentUserId || entry?.userId || entry?.id);
  const firstName = asString(entry?.firstName);
  const lastName = asString(entry?.lastName);
  const displayName = `${firstName} ${lastName}`.trim() || "Student";

  return {
    userId,
    firstName,
    lastName,
    displayName,
    profileUrl: asString(entry?.profileUrl),
    lastActiveAt: asString(entry?.lastActiveAt),
    joinedAt: asString(entry?.joinedAt),
  };
}

function extractSubmittedPayload(responseBody) {
  if (!responseBody || typeof responseBody !== "object") {
    return {};
  }

  if (
    responseBody.data &&
    typeof responseBody.data === "object" &&
    !Array.isArray(responseBody.data)
  ) {
    return responseBody.data;
  }

  if (
    responseBody.data?.data &&
    typeof responseBody.data.data === "object" &&
    !Array.isArray(responseBody.data.data)
  ) {
    return responseBody.data.data;
  }

  return responseBody;
}

function mapSubmittedByActivity(payload) {
  const byActivity = {};

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return byActivity;
  }

  Object.entries(payload).forEach(([userKey, userEntry]) => {
    if (!userEntry || typeof userEntry !== "object") return;

    const userId = asString(userEntry.userId) || asString(userKey);
    const firstName = asString(userEntry.firstName);
    const lastName = asString(userEntry.lastName);
    const profileUrl = asString(userEntry.profileUrl);

    const studentActivities = Array.isArray(userEntry.studentActivities)
      ? userEntry.studentActivities
      : [];
    studentActivities.forEach((item) => {
      const normalized = normalizeSubmittedEntry(item, {
        userId,
        firstName,
        lastName,
        profileUrl,
      });

      if (!normalized.activityId || !normalized.userId) return;

      if (!byActivity[normalized.activityId]) {
        byActivity[normalized.activityId] = {};
      }

      const existing = byActivity[normalized.activityId][normalized.userId];
      if (!existing || isEntryNewer(normalized, existing)) {
        byActivity[normalized.activityId][normalized.userId] = normalized;
      }
    });
  });

  return byActivity;
}

function normalizeSubmittedEntry(entry, fallback) {
  const userId = asString(entry?.userId || fallback?.userId);
  const firstName = asString(entry?.firstName || fallback?.firstName);
  const lastName = asString(entry?.lastName || fallback?.lastName);
  const displayName = `${firstName} ${lastName}`.trim() || "Student";

  const scoreRaw = entry?.score;
  const parsedScore =
    scoreRaw == null || scoreRaw === "" ? null : Number(scoreRaw);

  const maxScoreRaw = entry?.maxScore;
  const parsedMaxScore =
    maxScoreRaw == null || maxScoreRaw === "" ? null : Number(maxScoreRaw);

  return {
    userId,
    studentActivityId: asString(entry?.studentActivityId),
    activityId: asString(entry?.activityId),
    title: asString(entry?.title),
    description: asString(entry?.description),
    displayName,
    firstName,
    lastName,
    profileUrl: asString(entry?.profileUrl || fallback?.profileUrl),
    repositoryOwnerUsername: asString(entry?.repositoryOwnerUsername),
    repositoryId: asString(entry?.repositoryId),
    repositoryName: asString(entry?.repositoryName),
    repositoryMode: asString(entry?.repositoryMode),
    repositoryUrl: asString(entry?.repositoryUrl),
    submissionStatus: asString(entry?.submissionStatus).toUpperCase(),
    feedback: asString(entry?.feedback),
    score: Number.isFinite(parsedScore) ? parsedScore : null,
    maxScore: Number.isFinite(parsedMaxScore) ? parsedMaxScore : null,
    submittedAt: asString(entry?.submittedAt),
    updatedAt: asString(entry?.updatedAt),
    createdAt: asString(entry?.createdAt),
  };
}

function isEntryNewer(next, current) {
  const nextTimestamp = getSubmissionTimestamp(next);
  const currentTimestamp = getSubmissionTimestamp(current);
  return nextTimestamp >= currentTimestamp;
}

function getSubmissionTimestamp(entry) {
  const raw = entry?.updatedAt || entry?.submittedAt || entry?.createdAt || "";
  const parsed = new Date(raw).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function renderOverview() {
  const totalActivities = state.activities.length;
  const totalStudents = state.students.length;

  let needGrading = 0;
  state.activities.forEach((activity) => {
    const stats = computeActivityStats(getActivityId(activity));
    needGrading += stats.submitted;
  });

  const now = new Date();
  const dueSoonCount = state.activities.filter((activity) => {
    if (!activity?.dueDate) return false;
    const due = new Date(activity.dueDate);
    const diffDays = Math.ceil((due - now) / (1000 * 60 * 60 * 24));
    return diffDays >= 0 && diffDays <= 7;
  }).length;

  setText("overviewActivities", String(totalActivities));
  setText("overviewStudents", String(totalStudents));
  setText("overviewNeedGrading", String(needGrading));
  setText("overviewDueSoon", String(dueSoonCount));
}

function renderActivities() {
  const container = document.getElementById("assignmentsList");
  if (!container) return;

  if (!Array.isArray(state.activities) || state.activities.length === 0) {
    container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-inbox"></i>
                <p>No activities yet. Create your first activity.</p>
            </div>
        `;
    return;
  }

  container.innerHTML = state.activities
    .map((activity) => {
      const activityId = getActivityId(activity);
      const stats = computeActivityStats(activityId);
      const due = getDueInfo(activity?.dueDate);
      const maxScore =
        activity?.maxScore != null ? Number(activity.maxScore) : null;

      return `
            <article class="assignment-card">
                <div class="assignment-top-row">
                    <div>
                        <h3>${escapeHtml(getActivityTitle(activity))}</h3>
                        <div class="assignment-meta-line">
                            <span class="activity-status-chip ${statusClass(activity?.status)}">${escapeHtml(asString(activity?.status) || "UNKNOWN")}</span>
                            <span><i class="fas fa-calendar-alt"></i> ${escapeHtml(due.label)}</span>
                            ${maxScore != null ? `<span><i class="fas fa-star"></i> ${escapeHtml(String(maxScore))} points</span>` : ""}
                        </div>
                    </div>
                    <div class="assignment-actions">
                        <button class="btn btn-primary btn-small" data-action="view-submissions" data-activity-id="${escapeHtml(activityId)}">
                            <i class="fas fa-list-check"></i>
                            View Submissions
                        </button>
                        <button class="btn btn-secondary btn-icon" data-action="edit-activity" data-activity-id="${escapeHtml(activityId)}" title="Edit Activity">
                            <i class="fas fa-pen"></i>
                        </button>
                        <button class="btn btn-danger btn-icon" data-action="delete-activity" data-activity-id="${escapeHtml(activityId)}" title="Delete Activity">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>

                ${activity?.description ? `<p class="assignment-description">${escapeHtml(activity.description)}</p>` : ""}

                <div class="status-row">
                    <span class="status-chip pending">PENDING: ${stats.pending}</span>
                    <span class="status-chip submitted">SUBMITTED: ${stats.submitted}</span>
                    <span class="status-chip graded">GRADED: ${stats.graded}</span>
                </div>
            </article>
        `;
    })
    .join("");
}

function renderStudents() {
  const container = document.getElementById("studentsList");
  if (!container) return;

  if (!Array.isArray(state.students) || state.students.length === 0) {
    container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-users"></i>
                <p>No students enrolled yet.</p>
            </div>
        `;
    return;
  }

  container.innerHTML = state.students
    .map((student) => {
      const name = student.displayName || "Student";
      const avatar = student.profileUrl
        ? `<img src="${escapeHtml(student.profileUrl)}" alt="${escapeHtml(name)}">`
        : escapeHtml(getInitials(name, "ST"));

      const recency = student.lastActiveAt
        ? `Active ${escapeHtml(timeAgo(student.lastActiveAt))}`
        : "No recent activity";

      return `
            <div class="student-card">
                <div class="student-avatar">${avatar}</div>
                <div class="student-info">
                    <div class="student-name">${escapeHtml(name)}</div>
                    <div class="student-subtext">${recency}</div>
                </div>
            </div>
        `;
    })
    .join("");
}

function computeActivityStats(activityId) {
  const rows = buildSubmissionRows(activityId);
  let pending = 0;
  let submitted = 0;
  let graded = 0;

  rows.forEach((row) => {
    if (row.status === "PENDING") pending += 1;
    else if (row.status === "SUBMITTED") submitted += 1;
    else if (row.status === "GRADED") graded += 1;
  });

  return { pending, submitted, graded };
}

function buildSubmissionRows(activityId) {
  const perActivity = state.submittedByActivity[activityId] || {};
  const rows = [];
  Object.values(perActivity).forEach((entry) => {
    const userId = asString(entry?.userId);
    if (!userId) return;

    const student = state.students.find((item) => item.userId === userId);
    const fullName =
      student?.displayName || asString(entry?.displayName) || "Student";
    rows.push({
      activityId,
      userId,
      displayName: fullName,
      profileUrl: student?.profileUrl || entry?.profileUrl || "",
      status: deriveSubmissionStatus(entry),
      repositoryUrl: entry?.repositoryUrl || "",
      repositoryName: entry?.repositoryName || "",
      repositoryOwnerUsername: entry?.repositoryOwnerUsername || "",
      repositoryMode: entry?.repositoryMode || "",
      submittedAt: entry?.submittedAt || "",
      createdAt: entry?.createdAt || "",
      updatedAt: entry?.updatedAt || "",
      studentActivityId: entry?.studentActivityId || "",
      title: entry?.title || "",
      description: entry?.description || "",
      score: entry?.score,
      maxScore: entry?.maxScore,
      feedback: entry?.feedback || "",
      raw: entry,
    });
  });

  const priority = {
    SUBMITTED: 1,
    PENDING: 2,
    GRADED: 3,
    NONE: 4,
  };

  rows.sort((a, b) => {
    const rank = (priority[a.status] || 99) - (priority[b.status] || 99);
    if (rank !== 0) return rank;
    return a.displayName.localeCompare(b.displayName);
  });

  return rows;
}

function deriveSubmissionStatus(entry) {
  if (!entry) return "NONE";

  const rawStatus = asString(entry.submissionStatus).toUpperCase();
  if (
    rawStatus === "PENDING" ||
    rawStatus === "SUBMITTED" ||
    rawStatus === "GRADED"
  ) {
    return rawStatus;
  }

  if (entry.score != null) return "GRADED";
  if (asString(entry.repositoryUrl)) return "PENDING";
  return "NONE";
}

async function openSubmissionsModal(activityId) {
  state.currentSubmissionsActivityId = activityId;
  state.submissionFilter = "ALL";

  const filter = document.getElementById("submissionFilter");
  if (filter) filter.value = "ALL";

  renderSubmissionsModal();
  openModal("submissionsModal");
}

function renderSubmissionsModal() {
  const activity = state.activities.find(
    (item) => getActivityId(item) === state.currentSubmissionsActivityId,
  );
  const titleEl = document.getElementById("submissionsModalTitle");
  const subtitleEl = document.getElementById("submissionsSubtitle");

  state.currentSubmissionRows = buildSubmissionRows(
    state.currentSubmissionsActivityId,
  );

  if (titleEl) {
    titleEl.innerHTML = `<i class="fas fa-file-circle-check"></i> ${escapeHtml(getActivityTitle(activity))}`;
  }

  const counts = {
    PENDING: 0,
    SUBMITTED: 0,
    GRADED: 0,
  };

  state.currentSubmissionRows.forEach((row) => {
    counts[row.status] = (counts[row.status] || 0) + 1;
  });

  if (subtitleEl) {
    subtitleEl.textContent = `PENDING: ${counts.PENDING} | SUBMITTED: ${counts.SUBMITTED} | GRADED: ${counts.GRADED}`;
  }

  renderSubmissionRows();
}

function renderSubmissionRows() {
  const container = document.getElementById("submissionsList");
  if (!container) return;

  const filter = state.submissionFilter;
  const rows = state.currentSubmissionRows.filter(
    (row) => filter === "ALL" || row.status === filter,
  );

  if (rows.length === 0) {
    container.innerHTML = `
            <div class="empty-state compact">
                <i class="fas fa-filter-circle-xmark"></i>
                <p>No submissions match the selected filter.</p>
            </div>
        `;
    return;
  }

  container.innerHTML = rows
    .map((row) => {
      const initials = getInitials(row.displayName, "ST");
      const avatar = row.profileUrl
        ? `<img src="${escapeHtml(row.profileUrl)}" alt="${escapeHtml(row.displayName)}">`
        : escapeHtml(initials);

      const repoLink = row.repositoryUrl
        ? `<a href="${escapeHtml(row.repositoryUrl)}" target="_blank" rel="noopener noreferrer" class="repo-link"><i class="fa-brands fa-github"></i> ${escapeHtml(row.repositoryName || trimProtocol(row.repositoryUrl))}</a>`
        : '<span class="repo-missing">No repository linked</span>';

      const gradedMeta =
        row.status === "GRADED"
          ? `
                    <div>
                        <span class="field-label">Score</span>
                        <span>${
                          row.score != null
                            ? `${escapeHtml(String(row.score))}${row.maxScore != null ? ` / ${escapeHtml(String(row.maxScore))}` : ""}`
                            : "N/A"
                        }</span>
                    </div>
                    <div>
                        <span class="field-label">Feedback</span>
                        <span>${row.feedback ? escapeHtml(row.feedback) : "No feedback provided"}</span>
                    </div>
              `
          : "";

      let actionArea = "";
      if (row.status === "PENDING") {
        actionArea =
          '<span class="inline-note">Waiting final activity submission</span>';
      } else if (row.status === "SUBMITTED") {
        actionArea = `
        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            <button class="btn btn-primary btn-small" data-action="grade-student" data-activity-id="${escapeHtml(row.activityId)}" data-student-id="${escapeHtml(row.userId)}">
                <i class="fas fa-award"></i>
                Grade
            </button>
            ${
              row.repositoryUrl
                ? `
                <button class="btn btn-secondary btn-small" data-action="analyze-code" data-repo-url="${escapeHtml(row.repositoryUrl)}" data-activity-title="${escapeHtml(row.title || "Activity")}" data-student-name="${escapeHtml(row.displayName)}">
                    <i class="fas fa-code"></i>
                    Analyze
                </button>
            `
                : ""
            }
        </div>
    `;
      } else if (row.status === "GRADED") {
        actionArea = `
        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            <button class="btn btn-secondary btn-small" data-action="view-submission-detail" data-activity-id="${escapeHtml(row.activityId)}" data-student-id="${escapeHtml(row.userId)}">
                <i class="fas fa-file-circle-check"></i>
                View Details
            </button>
            ${
              row.repositoryUrl
                ? `
                <button class="btn btn-secondary btn-small" data-action="analyze-code" data-repo-url="${escapeHtml(row.repositoryUrl)}" data-activity-title="${escapeHtml(row.title || "Activity")}" data-student-name="${escapeHtml(row.displayName)}">
                    <i class="fas fa-code"></i>
                    Analyze
                </button>
            `
                : ""
            }
        </div>
    `;
      }

      return `
            <article class="submission-card">
                <div class="submission-person">
                    <div class="student-avatar">${avatar}</div>
                    <div>
                        <div class="submission-name">${escapeHtml(row.displayName)}</div>
                        <div class="submission-time">${row.submittedAt ? `Updated ${escapeHtml(timeAgo(row.submittedAt))}` : "No timestamp"}</div>
                    </div>
                </div>

                <div class="submission-fields">
                    <div>
                        <span class="field-label">Status</span>
                        <span class="status-pill ${statusClass(row.status)}">${escapeHtml(row.status)}</span>
                    </div>
                    <div>
                        <span class="field-label">Repository</span>
                        ${repoLink}
                    </div>
                    ${gradedMeta}
                </div>

                <div class="submission-actions">${actionArea}</div>
            </article>
        `;
    })
    .join("");
}

function openSubmissionDetailModal(activityId, studentUserId) {
  const row = state.currentSubmissionRows.find(
    (item) => item.activityId === activityId && item.userId === studentUserId,
  );
  if (!row) {
    showNotification("Submission details are unavailable.", "error");
    return;
  }

  state.currentDetailRow = row;

  const activity = state.activities.find(
    (item) => getActivityId(item) === activityId,
  );
  const submittedAt = row.submittedAt
    ? formatDateTime(row.submittedAt)
    : row.updatedAt
      ? formatDateTime(row.updatedAt)
      : "N/A";
  const status = row.status || "UNKNOWN";

  const title = row.title || getActivityTitle(activity);
  const repositoryLabel = row.repositoryUrl
    ? trimProtocol(row.repositoryUrl)
    : "No repository URL";

  const gradingMessage =
    status === "GRADED"
      ? "This activity has already been graded."
      : status === "SUBMITTED"
        ? "This activity is submitted and waiting for grading."
        : "This activity is still pending final submission.";

  const detailTitle = document.getElementById("submittedDetailTitle");
  if (detailTitle) {
    detailTitle.innerHTML = `<i class="fas fa-file-circle-check"></i> ${escapeHtml(title)}`;
  }

  const detailBody = document.getElementById("submittedDetailBody");
  if (!detailBody) return;

  detailBody.innerHTML = `
        <article class="detail-shell">
            <header class="detail-head">
                <div class="detail-person">
                    <div class="student-avatar">${row.profileUrl ? `<img src="${escapeHtml(row.profileUrl)}" alt="${escapeHtml(row.displayName)}">` : escapeHtml(getInitials(row.displayName, "ST"))}</div>
                    <div>
                        <div class="detail-name">${escapeHtml(row.displayName)}</div>
                    </div>
                </div>
                <span class="status-pill ${statusClass(status)}">${escapeHtml(status)}</span>
            </header>

            <section class="detail-section">
                <h4>ACTIVITY</h4>
                <div class="detail-grid">
                    <div>
                        <span class="field-label">Title</span>
                        <span>${escapeHtml(title)}</span>
                    </div>
                </div>
            </section>

            <section class="detail-section">
                <h4>SUBMISSION</h4>
                <div class="detail-grid detail-grid-2">
                    <div>
                        <span class="field-label">Submitted At</span>
                        <span>${escapeHtml(submittedAt)}</span>
                    </div>
                    <div>
                        <span class="field-label">Submission Status</span>
                        <span>${escapeHtml(status)}</span>
                    </div>
                    ${
                      row.score != null
                        ? `
                    <div>
                        <span class="field-label">Score</span>
                        <span>${escapeHtml(String(row.score))}</span>
                    </div>`
                        : ""
                    }
                </div>
            </section>

            <section class="detail-section">
                <h4>GRADING</h4>
                <p class="detail-paragraph">${escapeHtml(gradingMessage)}</p>
            </section>

            <section class="detail-section">
                <h4>REPOSITORY</h4>
                <div class="detail-repo-row">
                    ${
                      row.repositoryUrl
                        ? `<a href="${escapeHtml(row.repositoryUrl)}" target="_blank" rel="noopener noreferrer" class="submission-repo-link">${escapeHtml(repositoryLabel)} <i class="fas fa-up-right-from-square"></i></a>`
                        : `<span class="repo-missing">${escapeHtml(repositoryLabel)}</span>`
                    }
                </div>
                ${
                  row.repositoryUrl
                    ? `
                <div class="detail-repo-actions">
                    <button type="button" class="btn btn-secondary btn-small" data-action="copy-submission-url"><i class="far fa-copy"></i> Copy URL</button>
                    <button type="button" class="btn btn-secondary btn-small" data-action="copy-clone-command"><i class="fas fa-terminal"></i> Copy Clone Command</button>
                </div>`
                    : ""
                }
                ${row.score != null ? `<div class="detail-meta-line"><strong>Score:</strong> ${escapeHtml(String(row.score))}</div>` : ""}
                ${row.feedback ? `<div class="detail-meta-line"><strong>Feedback:</strong> ${escapeHtml(row.feedback)}</div>` : ""}
            </section>
        </article>
    `;

  closeModal("submissionsModal");
  openModal("submittedDetailModal");
}

function openGradeModal(activityId, studentUserId) {
  const row = state.currentSubmissionRows.find(
    (item) => item.activityId === activityId && item.userId === studentUserId,
  );
  if (!row) {
    showNotification("Submission row not found.", "error");
    return;
  }

  if (row.status !== "SUBMITTED") {
    showNotification("Only SUBMITTED entries can be graded.", "error");
    return;
  }

  const activity = state.activities.find(
    (item) => getActivityId(item) === activityId,
  );
  const effectiveMaxScore =
    row.maxScore != null
      ? Number(row.maxScore)
      : activity?.maxScore != null
        ? Number(activity.maxScore)
        : null;

  setInputValue("gradeActivityId", activityId);
  setInputValue("gradeStudentUserId", studentUserId);
  setInputValue("gradeFeedback", row.feedback || "");
  setInputValue("gradeScore", row.score != null ? String(row.score) : "");
  setInputValue(
    "gradeMaxScore",
    effectiveMaxScore != null ? String(effectiveMaxScore) : "",
  );

  const scoreInput = document.getElementById("gradeScore");
  const scoreHint = document.getElementById("gradeScoreHint");
  if (scoreInput) {
    if (effectiveMaxScore != null && Number.isFinite(effectiveMaxScore)) {
      scoreInput.max = String(effectiveMaxScore);
    } else {
      scoreInput.removeAttribute("max");
    }
  }

  if (scoreHint) {
    scoreHint.textContent =
      effectiveMaxScore != null && Number.isFinite(effectiveMaxScore)
        ? `Maximum allowed score: ${effectiveMaxScore}`
        : "No maximum score was provided by backend for this entry.";
  }

  const info = document.getElementById("gradeStudentInfo");
  if (info) {
    const repoLink = row.repositoryUrl
      ? `<a href="${escapeHtml(row.repositoryUrl)}" target="_blank" rel="noopener noreferrer" class="repo-link">${escapeHtml(row.repositoryName || trimProtocol(row.repositoryUrl))}</a>`
      : '<span class="repo-missing">No repository URL</span>';

    const submittedAt = row.submittedAt
      ? formatDate(row.submittedAt)
      : row.updatedAt
        ? formatDate(row.updatedAt)
        : "N/A";

    info.innerHTML = `
            <strong>${escapeHtml(row.displayName)}</strong>
            <div class="grade-info-grid">
                <span><strong>Activity:</strong> ${escapeHtml(row.title || getActivityTitle(activity))}</span>
                <span><strong>Status:</strong> <span class="status-pill submitted">SUBMITTED</span></span>
                ${row.studentActivityId ? `<span><strong>Submission ID:</strong> ${escapeHtml(row.studentActivityId)}</span>` : ""}
                <span><strong>Repository:</strong> ${repoLink}</span>
                ${row.repositoryOwnerUsername ? `<span><strong>Owner:</strong> ${escapeHtml(row.repositoryOwnerUsername)}</span>` : ""}
                ${row.repositoryMode ? `<span><strong>Mode:</strong> ${escapeHtml(row.repositoryMode)}</span>` : ""}
                <span><strong>Submitted:</strong> ${escapeHtml(submittedAt)}</span>
                ${row.maxScore != null ? `<span><strong>Max Score:</strong> ${escapeHtml(String(row.maxScore))}</span>` : ""}
            </div>
            ${row.description ? `<div class="grade-activity-description">${escapeHtml(row.description)}</div>` : ""}
        `;
  }

  openModal("gradeModal");
}

async function handleSubmitGrade() {
  const activityId = asString(getInputValue("gradeActivityId"));
  const studentUserId = asString(getInputValue("gradeStudentUserId"));
  const feedback = asString(getInputValue("gradeFeedback"));
  const scoreRaw = asString(getInputValue("gradeScore"));
  const maxScoreRaw = asString(getInputValue("gradeMaxScore"));

  if (!activityId || !studentUserId) {
    showNotification("Grade target is missing.", "error");
    return;
  }

  const targetRow = state.currentSubmissionRows.find(
    (item) => item.activityId === activityId && item.userId === studentUserId,
  );
  if (!targetRow || targetRow.status !== "SUBMITTED") {
    showNotification("Only SUBMITTED entries can be graded.", "error");
    return;
  }

  const payload = {};

  if (feedback) {
    payload.feedback = feedback;
  }

  if (scoreRaw) {
    const score = Number(scoreRaw);
    if (!Number.isFinite(score) || score < 0) {
      showNotification("Score must be a non-negative number.", "error");
      return;
    }

    if (maxScoreRaw) {
      const maxScore = Number(maxScoreRaw);
      if (Number.isFinite(maxScore) && score > maxScore) {
        showNotification(
          `Score cannot exceed max score (${maxScore}).`,
          "error",
        );
        return;
      }
    }

    payload.score = score;
  }

  const button = document.getElementById("saveGradeBtn");
  if (button) {
    button.disabled = true;
    button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Grading...';
  }

  try {
    await apiRequest(
      `/classrooms/${encodeURIComponent(state.classroomId)}/activities/${encodeURIComponent(activityId)}/students/${encodeURIComponent(studentUserId)}/grade`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      },
    );

    closeModal("gradeModal");
    showNotification("Submission graded successfully.", "success");

    await loadSubmittedActivities();
    renderActivities();
    renderOverview();
    renderSubmissionsModal();
  } catch (error) {
    console.error("Failed to grade submission:", error);
    showNotification(error?.message || "Failed to grade submission.", "error");
  } finally {
    if (button) {
      button.disabled = false;
      button.innerHTML = '<i class="fas fa-check"></i> Submit Grade';
    }
  }
}

async function handleCreateActivity() {
  const title = asString(getInputValue("activityTitle"));
  const description = asString(getInputValue("activityDescription"));
  const dueDate = asString(getInputValue("dueDate"));
  const maxScoreRaw = asString(getInputValue("maxScore"));
  const status = asString(getInputValue("activityStatus"));

  if (!title || !status) {
    showNotification("Title and status are required.", "error");
    return;
  }

  const payload = {
    title,
    description: description || null,
    dueDate: dueDate ? `${dueDate}T23:59:00` : null,
    maxScore: null,
    status,
  };

  if (maxScoreRaw) {
    const parsed = Number(maxScoreRaw);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1000) {
      showNotification("Max score must be between 0 and 1000.", "error");
      return;
    }
    payload.maxScore = parsed;
  }

  const button = document.getElementById("saveActivityBtn");
  if (button) {
    button.disabled = true;
    button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating...';
  }

  try {
    await apiRequest(
      `/classrooms/${encodeURIComponent(state.classroomId)}/activities`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      },
    );

    closeModal("createActivityModal");
    showNotification("Activity created successfully.", "success");

    await loadActivities();
    renderActivities();
    renderOverview();
  } catch (error) {
    console.error("Failed to create activity:", error);
    showNotification(error?.message || "Failed to create activity.", "error");
  } finally {
    if (button) {
      button.disabled = false;
      button.innerHTML = '<i class="fas fa-save"></i> Create Activity';
    }
  }
}

function openEditActivityModal(activityId) {
  const activity = state.activities.find(
    (item) => getActivityId(item) === activityId,
  );
  if (!activity) {
    showNotification("Activity not found.", "error");
    return;
  }

  setInputValue("editActivityId", getActivityId(activity));
  setInputValue("editActivityTitle", asString(activity.title));
  setInputValue("editActivityDescription", asString(activity.description));
  setInputValue(
    "editMaxScore",
    activity.maxScore != null ? String(activity.maxScore) : "",
  );
  setInputValue("editActivityStatus", asString(activity.status) || "PUBLISHED");

  if (activity?.dueDate) {
    const parsed = new Date(activity.dueDate);
    if (!Number.isNaN(parsed.getTime())) {
      const yyyy = parsed.getFullYear();
      const mm = String(parsed.getMonth() + 1).padStart(2, "0");
      const dd = String(parsed.getDate()).padStart(2, "0");
      setInputValue("editDueDate", `${yyyy}-${mm}-${dd}`);
    } else {
      setInputValue("editDueDate", "");
    }
  } else {
    setInputValue("editDueDate", "");
  }

  openModal("editActivityModal");
}

async function handleEditActivity() {
  const activityId = asString(getInputValue("editActivityId"));
  const title = asString(getInputValue("editActivityTitle"));
  const description = asString(getInputValue("editActivityDescription"));
  const dueDate = asString(getInputValue("editDueDate"));
  const maxScoreRaw = asString(getInputValue("editMaxScore"));
  const status = asString(getInputValue("editActivityStatus"));

  if (!activityId) {
    showNotification("Activity ID is missing.", "error");
    return;
  }

  if (!title || !status) {
    showNotification("Title and status are required.", "error");
    return;
  }

  const payload = {
    title,
    description: description || null,
    dueDate: dueDate ? `${dueDate}T23:59:00` : null,
    maxScore: null,
    status,
  };

  if (maxScoreRaw) {
    const parsed = Number(maxScoreRaw);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1000) {
      showNotification("Max score must be between 0 and 1000.", "error");
      return;
    }
    payload.maxScore = parsed;
  }

  const button = document.getElementById("saveEditActivityBtn");
  if (button) {
    button.disabled = true;
    button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
  }

  try {
    await apiRequest(
      `/classrooms/${encodeURIComponent(state.classroomId)}/activities/${encodeURIComponent(activityId)}`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      },
    );

    closeModal("editActivityModal");
    showNotification("Activity updated successfully.", "success");

    await loadActivities();
    renderActivities();
    renderOverview();

    if (state.currentSubmissionsActivityId === activityId) {
      renderSubmissionsModal();
    }
  } catch (error) {
    console.error("Failed to update activity:", error);
    showNotification(error?.message || "Failed to update activity.", "error");
  } finally {
    if (button) {
      button.disabled = false;
      button.innerHTML = '<i class="fas fa-save"></i> Save Changes';
    }
  }
}

async function deleteActivity(activityId) {
  const confirmMessage =
    "Are you sure you want to delete this activity? This cannot be undone.";
  let approved = false;

  if (window.AppDialog?.confirm) {
    approved = await window.AppDialog.confirm(confirmMessage, {
      title: "Delete Activity",
      confirmText: "Delete",
      danger: true,
    });
  } else {
    approved = window.confirm(confirmMessage);
  }

  if (!approved) return;

  try {
    await apiRequest(
      `/classrooms/${encodeURIComponent(state.classroomId)}/activities/${encodeURIComponent(activityId)}`,
      {
        method: "DELETE",
      },
    );

    showNotification("Activity deleted successfully.", "success");

    await loadActivities();
    await loadSubmittedActivities();
    renderActivities();
    renderOverview();

    if (state.currentSubmissionsActivityId === activityId) {
      closeModal("submissionsModal");
      state.currentSubmissionsActivityId = null;
      state.currentSubmissionRows = [];
    }
  } catch (error) {
    console.error("Failed to delete activity:", error);
    showNotification(error?.message || "Failed to delete activity.", "error");
  }
}

function getActivityId(activity) {
  return asString(activity?.activityId || activity?.id);
}

function getActivityTitle(activity) {
  return asString(activity?.title || activity?.name) || "Untitled activity";
}

function getDueInfo(dueDate) {
  if (!dueDate) {
    return { label: "No due date" };
  }

  const parsed = new Date(dueDate);
  if (Number.isNaN(parsed.getTime())) {
    return { label: "Invalid due date" };
  }

  const now = new Date();
  const diffDays = Math.ceil((parsed - now) / (1000 * 60 * 60 * 24));
  const dueText = formatDate(parsed.toISOString());

  if (diffDays < 0) {
    return { label: `${dueText} (Overdue)` };
  }

  if (diffDays === 0) {
    return { label: `${dueText} (Due today)` };
  }

  return {
    label: `${dueText} (${diffDays} day${diffDays === 1 ? "" : "s"} left)`,
  };
}

function statusClass(value) {
  const status = asString(value).toUpperCase();
  if (status === "PENDING") return "pending";
  if (status === "SUBMITTED") return "submitted";
  if (status === "GRADED") return "graded";
  if (status === "DRAFT") return "draft";
  if (status === "PUBLISHED") return "published";
  if (status === "CLOSED") return "closed";
  if (status === "ARCHIVED") return "archived";
  return "none";
}

function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  modal.classList.add("active");
  document.body.classList.add("modal-open");
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  modal.classList.remove("active");

  const stillOpen = document.querySelector(".modal.active");
  if (!stillOpen) {
    document.body.classList.remove("modal-open");
  }
}

function showNotification(message, type = "info") {
  const note = document.createElement("div");
  note.className = `notification ${type}`;
  note.textContent = message;
  document.body.appendChild(note);

  setTimeout(() => {
    note.style.opacity = "0";
    setTimeout(() => note.remove(), 220);
  }, 2600);
}

function asString(value) {
  if (value == null) return "";
  return String(value).trim();
}

function getInitials(name, fallback) {
  const value = asString(name);
  if (!value) return fallback;

  const initials = value
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase();

  return initials || fallback;
}

function formatDate(dateString) {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "N/A";
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatDateTime(dateString) {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "N/A";
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function timeAgo(dateString) {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "recently";

  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;

  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;

  const years = Math.floor(months / 12);
  return `${years} year${years === 1 ? "" : "s"} ago`;
}

function trimProtocol(url) {
  return asString(url).replace(/^https?:\/\//i, "");
}

async function copyTextWithFeedback(value, successMessage) {
  const text = asString(value);
  if (!text) {
    showNotification("Nothing to copy.", "error");
    return;
  }

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const temp = document.createElement("textarea");
      temp.value = text;
      temp.setAttribute("readonly", "");
      temp.style.position = "absolute";
      temp.style.left = "-9999px";
      document.body.appendChild(temp);
      temp.select();
      document.execCommand("copy");
      temp.remove();
    }

    showNotification(successMessage, "success");
  } catch (error) {
    console.error("Copy failed:", error);
    showNotification("Failed to copy text.", "error");
  }
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value == null ? "" : String(value);
  return div.innerHTML;
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

function setInputValue(id, value) {
  const element = document.getElementById(id);
  if (element) element.value = value;
}

function getInputValue(id) {
  const element = document.getElementById(id);
  return element ? element.value : "";
}
/**
 * Navigate to Syntax Analyzer page with repository data
 * @param {string} repoUrl - GitHub repository URL
 * @param {string} activityTitle - Activity title
 * @param {string} studentName - Student name
 */

function navigateToSyntaxAnalyzer(repoUrl, activityTitle, studentName) {
    // Store the data in localStorage for the syntax page to use
    const analysisData = {
        repoUrl: repoUrl,
        activityTitle: activityTitle || 'Activity',
        studentName: studentName || 'Student',
        timestamp: new Date().toISOString(),
        source: 'professor_dashboard'
    };
    
    // Save to localStorage
    localStorage.setItem('pendingAnalysis', JSON.stringify(analysisData));
    
    // Also store in sessionStorage as backup
    sessionStorage.setItem('pendingAnalysis', JSON.stringify(analysisData));
    
    // Show notification
    showNotification(`Navigating to analyzer for: ${studentName}`, 'info');
    
    // Navigate to syntax.html
    // Adjust the path based on your file structure
    window.location.href = '/Syntax.html';
    // If Syntax.html is in the same directory, use:
    // window.location.href = 'Syntax.html';
    // If it's in a different folder, adjust accordingly:
    // window.location.href = '/frontend/Syntax.html';
}