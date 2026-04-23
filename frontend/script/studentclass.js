(function () {
  const apiClient = window.ApiClient;

  // ── DOM refs ──────────────────────────────────────────────────
  const submissionModal     = document.getElementById('submissionModal');
  const modalAssignmentDetail = document.getElementById('modalAssignmentDetail');
  const submissionModeSelect  = document.getElementById('submissionMode');
  const assignmentsList       = document.getElementById('assignmentsList');
  const assignmentCount       = document.getElementById('assignmentCount');
  const pendingCount          = document.getElementById('pendingCount');
  const submitAssignmentBtn   = document.getElementById('submitAssignmentBtn');

  // ── URL params ────────────────────────────────────────────────
  const params      = new URLSearchParams(window.location.search);
  const classroomId = params.get('classroomId') || params.get('id') || '';
  const studentId   = params.get('studentId') || '';
  const storageKey  = `studentclass.submissions.${classroomId || 'default'}.${studentId || 'all'}`;

  // ── App state ─────────────────────────────────────────────────
  const state = {
    activities: [],
    submissions: loadSavedSubmissions(),
    currentStudentId: String(studentId || '').trim(),
    currentStudentUsername: '',
    needsSubmissionByActivityId: {},
    needsSubmissionLoaded: false,
    currentActivity: null,
    filters: { trackedSubmission: 'ALL' },
    currentActivityTab: 'needs-submission',
    loading: {
      profile: false,
      activities: true
    }
  };

  // ── Utilities ─────────────────────────────────────────────────
  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function formatDate(value) {
    if (!value) return '';
    const date = parseApiDate(value);
    if (!date) return '';
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: '2-digit', year: 'numeric' }).format(date);
  }

  function getDaysLeft(value) {
    if (!value) return null;
    const dueDate = parseApiDate(value);
    if (!dueDate) return null;
    dueDate.setHours(23, 59, 59, 999);
    return Math.ceil((dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  }

  function parseApiDate(value) {
    const raw = String(value ?? '').trim();
    if (!raw) return null;
    const direct = new Date(raw);
    if (!Number.isNaN(direct.getTime())) return direct;
    const withoutZoneRegion = raw.replace(/\[[^\]]+\]$/, '');
    const normalized = /^\d{4}-\d{2}-\d{2}$/.test(withoutZoneRegion)
      ? `${withoutZoneRegion}T00:00:00`
      : withoutZoneRegion;
    const parsed = new Date(normalized);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

  function getActivityId(activity)          { return activity?.activityId || activity?.id || activity?.activityID || ''; }
  function getActivityTitle(activity)       { return activity?.title || activity?.name || 'Untitled activity'; }
  function getActivityDescription(activity) { return activity?.description || activity?.details || ''; }
  function getActivityStatus(activity)      { return String(activity?.status || '').trim().toUpperCase(); }

  // ── Submission state helpers ──────────────────────────────────
  function isNeedsRepositorySubmission(activityId) {
    const nid = String(activityId || '');
    if (state.needsSubmissionLoaded && Object.prototype.hasOwnProperty.call(state.needsSubmissionByActivityId, nid)) {
      return !!state.needsSubmissionByActivityId[nid];
    }
    return !state.submissions.find(s => String(s.activityId || '') === nid && s.repositoryUrl);
  }

  function getActivitySubmissionState(activityId) {
    return isNeedsRepositorySubmission(activityId) ? 'NOT_SUBMITTED' : 'SUBMITTED';
  }

  function getActivitySubmissionStatus(activity) {
    const rawStatus = String(activity?.submissionStatus || '').trim().toUpperCase();
    if (rawStatus === 'SUBMITTED' || rawStatus === 'PENDING' || rawStatus === 'GRADED') return rawStatus;

    if (activity?.score != null || String(activity?.feedback || '').trim()) return 'GRADED';

    return getActivitySubmissionState(getActivityId(activity)) === 'NOT_SUBMITTED'
      ? 'PENDING'
      : 'SUBMITTED';
  }

  function getTrackedSubmissionStatus(activity) {
    return String(activity?.submissionStatus || '').trim().toUpperCase();
  }

  function isActivitySubmittedToInstructor(activityId) {
    const activity = state.activities.find(a => getActivityId(a) === String(activityId || ''));
    const status = String(activity?.submissionStatus || '').trim().toUpperCase();
    return status === 'SUBMITTED' || status === 'GRADED';
  }

  function getPendingActivities() {
    return state.activities.filter(a => getActivitySubmissionState(getActivityId(a)) === 'NOT_SUBMITTED');
  }

  // ── Badge helpers ─────────────────────────────────────────────
  function getStatusBadgeClass(activity) {
    const status = getActivityStatus(activity);
    const daysLeft = getDaysLeft(activity?.dueDate);
    if (status === 'ARCHIVED' || status === 'CLOSED') return 'expired';
    if (typeof daysLeft === 'number' && daysLeft <= 7) return 'due-soon';
    return 'due-later';
  }

  function getStatusLabel(activity) {
    const status = getActivityStatus(activity);
    const dueDate = formatDate(activity?.dueDate);
    const daysLeft = getDaysLeft(activity?.dueDate);
    if (status) return status;
    if (daysLeft === null) return 'Active';
    if (daysLeft < 0) return 'Overdue';
    return dueDate ? `Due ${dueDate}` : 'Active';
  }

  // ── Local storage ─────────────────────────────────────────────
  function loadSavedSubmissions() {
    try {
      const raw = localStorage.getItem(storageKey);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  }

  function saveSubmissions() {
    try { localStorage.setItem(storageKey, JSON.stringify(state.submissions)); } catch {}
  }

  // ── GitHub repos ──────────────────────────────────────────────
  async function loadGithubRepos() {
    const repoSelect = document.getElementById('repoSelect');
    if (!repoSelect) return;
    repoSelect.innerHTML = '<option value="">— Loading repositories... —</option>';
    repoSelect.disabled = true;
    try {
      const response = await apiClient.request('/github/repositories', { method: 'GET' });
      const repos = Array.isArray(response) ? response
        : Array.isArray(response?.data) ? response.data
        : Array.isArray(response?.repositories) ? response.repositories
        : [];
      if (repos.length === 0) {
        repoSelect.innerHTML = '<option value="">No repositories found</option>';
        return;
      }
      repoSelect.innerHTML = '<option value="">— Select a repository —</option>' +
        repos.map(repo => {
          const name = repo.fullName || repo.full_name || repo.name || '';
          const url  = repo.htmlUrl  || repo.html_url  || repo.url  || '';
          return `<option value="${url}">${name}</option>`;
        }).join('');
    } catch (error) {
      const msg = String(error?.message || '');
      if (msg.includes('500')) {
        repoSelect.innerHTML = '<option value="">GitHub repositories are temporarily unavailable</option>';
      } else {
        repoSelect.innerHTML = '<option value="">Failed to load repositories</option>';
      }
    } finally {
      repoSelect.disabled = false;
    }
  }

  // ── Classroom info ────────────────────────────────────────────
  function loadClassroomInfo() {
    const p    = new URLSearchParams(window.location.search);
    const name = p.get('name') || '—';
    const code = p.get('code') || '—';
    const nameEl = document.getElementById('classroomInfoName');
    const codeEl = document.getElementById('classroomInfoCode');
    if (nameEl) nameEl.textContent = decodeURIComponent(name);
    if (codeEl) codeEl.textContent = decodeURIComponent(code);
  }

  // ── Fetch unsubmitted from API ────────────────────────────────
  async function refreshNeedsRepositorySubmission() {
    if (!apiClient?.request || !classroomId || state.activities.length === 0) {
      state.needsSubmissionByActivityId = {};
      state.needsSubmissionLoaded = false;
      return;
    }
    const activityIds = state.activities
      .map(a => String(getActivityId(a) || '').trim())
      .filter(Boolean);
    if (activityIds.length === 0) {
      state.needsSubmissionByActivityId = {};
      state.needsSubmissionLoaded = false;
      return;
    }
    try {
      const response = await apiClient.request(
        `/classrooms/${encodeURIComponent(classroomId)}/activities/unsubmitted`,
        { method: 'GET' },
        { redirectOnUnauthorized: false }
      );
      const unsubmittedList = Array.isArray(response?.data) ? response.data
        : Array.isArray(response) ? response : [];
      const unsubmittedIds = new Set(
        unsubmittedList.map(a => String(a?.activityId || a?.id || '').trim()).filter(Boolean)
      );
      const map = {};
      activityIds.forEach(id => { map[id] = unsubmittedIds.has(id); });
      state.needsSubmissionByActivityId = map;
      state.needsSubmissionLoaded = true;
    } catch {
      state.needsSubmissionByActivityId = {};
      state.needsSubmissionLoaded = false;
    }
  }

  // ── Render ────────────────────────────────────────────────────
  function renderEmptyState(message, description, iconClass = 'fas fa-inbox') {
    return `
      <div class="empty-state">
        <i class="${iconClass}"></i>
        <h4>${escapeHtml(message)}</h4>
        <p>${escapeHtml(description)}</p>
      </div>`;
  }

  function renderLoadingSkeleton() {
    const container = document.getElementById('activitiesContainer');
    if (!container) return;
    container.innerHTML = Array(3).fill(`
      <div class="assignment">
        <div style="height:16px;width:55%;margin-bottom:10px;" class="skeleton"></div>
        <div style="height:12px;width:35%;margin-bottom:14px;" class="skeleton"></div>
        <div style="height:12px;width:80%;" class="skeleton"></div>
      </div>`).join('');
  }

  function renderActivities() {
    const activitiesContainer = document.getElementById('activitiesContainer');
    if (!activitiesContainer) return;

    if (!classroomId) {
      activitiesContainer.innerHTML = renderEmptyState(
        'Missing classroom id',
        'Open this page from a classroom to load its activities.',
        'fas fa-link'
      );
      return;
    }

    if (state.loading.activities) {
      renderLoadingSkeleton();
      return;
    }

    // Update stat counters
    if (assignmentCount) assignmentCount.textContent = String(state.activities.length);
    if (pendingCount)    pendingCount.textContent    = String(getPendingActivities().length);

    const submittedCountEl = document.getElementById('submittedCount');
    if (submittedCountEl) {
      const count = state.activities.filter(a => {
        const status = getActivitySubmissionStatus(a);
        return status === 'SUBMITTED' || status === 'GRADED';
      }).length;
      submittedCountEl.textContent = String(count);
    }

    // Split into tabs — submissionStatus is source of truth when present
    const unsubmitted = [];
    const submitted   = [];
    state.activities.forEach(a => {
      const status = String(a?.submissionStatus || '').trim().toUpperCase();
      if (status === 'SUBMITTED' || status === 'PENDING' || status === 'GRADED') {
        submitted.push(a);
      } else if (isNeedsRepositorySubmission(getActivityId(a))) {
        unsubmitted.push(a);
      } else {
        submitted.push(a);
      }
    });

    unsubmitted.sort((a, b) => {
      const at = parseApiDate(a.dueDate)?.getTime() ?? Number.POSITIVE_INFINITY;
      const bt = parseApiDate(b.dueDate)?.getTime() ?? Number.POSITIVE_INFINITY;
      return at - bt;
    });

    // Update tab badges
    const needsBadge   = document.getElementById('tabNeedsCount');
    const trackedBadge = document.getElementById('tabTrackedCount');
    if (needsBadge)   needsBadge.textContent   = unsubmitted.length;
    if (trackedBadge) trackedBadge.textContent = submitted.length;

    const trackedFilterGroup = document.getElementById('trackedFilterGroup');
    if (trackedFilterGroup) trackedFilterGroup.style.display = state.currentActivityTab === 'tracked' ? 'flex' : 'none';

    // Render active tab
    if (state.currentActivityTab === 'needs-submission') {
      activitiesContainer.innerHTML = unsubmitted.length === 0
        ? renderEmptyState('All caught up!', 'Every assignment already has a repository attached.', 'fas fa-check-double')
        : unsubmitted.map(renderAssignmentCard).join('');
    } else {
      const trackedSubmissionFilter = state.filters.trackedSubmission;
      const trackedActivities = submitted.filter(activity => {
        const status = getTrackedSubmissionStatus(activity);
        if (trackedSubmissionFilter === 'SUBMITTED') return status === 'SUBMITTED';
        if (trackedSubmissionFilter === 'NOT_SUBMITTED') return status === 'PENDING';
        if (trackedSubmissionFilter === 'GRADED') return status === 'GRADED';
        return true;
      });
      activitiesContainer.innerHTML = trackedActivities.length === 0
        ? renderEmptyState('No tracked activities yet', 'Activities will appear here once you submit them.', 'fas fa-tasks')
        : trackedActivities.map(renderAssignmentCard).join('');
    }
  }

  function renderAssignmentCard(activity) {
    const activityId    = getActivityId(activity);
    const title         = escapeHtml(getActivityTitle(activity));
    const description   = getActivityDescription(activity);
    const dueDate       = formatDate(activity?.dueDate);
    const daysLeft      = getDaysLeft(activity?.dueDate);
    const badgeClass    = getStatusBadgeClass(activity);
    const statusLabel   = escapeHtml(getStatusLabel(activity));
    const statusIcon    = badgeClass === 'expired' ? 'fas fa-hourglass-end' : 'fas fa-clock';
    const needsSubmission = isNeedsRepositorySubmission(activityId);

    const points = activity?.maxScore != null
      ? `<span class="points"><i class="fas fa-star"></i> ${escapeHtml(activity.maxScore)} pts</span>`
      : '';

    const submissionBadge = needsSubmission
      ? '<span class="assignment-repo-badge"><i class="fas fa-code-branch"></i> Needs repository</span>'
      : '<span class="assignment-repo-badge submitted"><i class="fas fa-check-circle"></i> Repository submitted</span>';

    const daysStr = daysLeft != null
      ? (daysLeft > 0 ? `${daysLeft}d left` : 'Overdue')
      : (dueDate || 'No due date');

    const urgentClass = daysLeft != null && daysLeft <= 7 ? 'urgent' : 'normal';

    const dueLabel = `<span class="assignment-due"><i class="fas fa-calendar-alt"></i><span class="days-left ${urgentClass}">${daysStr}</span></span>`;

    const submissionAction = needsSubmission
      ? `<button type="button" class="submit-repo-btn" data-submit-activity-id="${escapeHtml(activityId)}"><i class="fas fa-paper-plane"></i> Submit repo</button>`
      : '';

    const isPublished = getActivityStatus(activity) === 'PUBLISHED';
    const canSubmitActivity = !needsSubmission && !isActivitySubmittedToInstructor(activityId) && isPublished;
    const isSubmitBlockedByStatus = !needsSubmission && !isActivitySubmittedToInstructor(activityId) && !isPublished;
    const activitySubmitAction = canSubmitActivity
      ? `<button type="button" class="submit-repo-btn" data-submit-activity-only-id="${escapeHtml(activityId)}"><i class="fas fa-upload"></i> Submit activity</button>`
      : isSubmitBlockedByStatus
        ? `<button type="button" class="submit-repo-btn is-disabled" disabled title="Only published activities can be submitted."><i class="fas fa-ban"></i> Submit activity</button>`
      : '';

    const activitySubmittedPill = (!needsSubmission && isActivitySubmittedToInstructor(activityId))
      ? '<span class="repo-submitted-pill"><i class="fas fa-check-circle"></i> Activity submitted</span>'
      : '';

    return `
      <div class="assignment ${needsSubmission ? 'needs-submission' : ''}" data-assignment-id="${escapeHtml(activityId)}">
        <div class="assignment-header">
          <div class="assignment-title-wrap">
            <div class="assignment-title">
              <i class="fas fa-project-diagram"></i>
              ${title}
            </div>
            <div class="assignment-subtitle">${submissionBadge}</div>
          </div>
          <div class="assignment-status ${badgeClass}">
            <i class="${statusIcon}"></i>
            ${statusLabel}
          </div>
        </div>
        ${description ? `<div class="assignment-desc">${escapeHtml(description)}</div>` : ''}
        <div class="assignment-meta">
          ${dueLabel}
          ${points}
          ${submissionAction}
          ${activitySubmitAction}
          ${activitySubmittedPill}
        </div>
      </div>`;
  }

  // ── Tab switching ─────────────────────────────────────────────
  function switchActivityTab(tabName) {
    state.currentActivityTab = tabName;
    document.querySelectorAll('[data-tab]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabName);
    });
    renderActivities();
  }

  // ── Student profile ───────────────────────────────────────────
  function setStudentProfile(data) {
    const firstName  = data.firstName || '';
    const lastName   = data.lastName  || '';
    const fullName   = `${firstName} ${lastName}`.trim() || 'Student';
    const profileUrl = data.profileUrl || '';
    const initials   = `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase() || 'ST';

    const nameEl   = document.getElementById('studentName');
    const avatarEl = document.getElementById('studentAvatar');
    if (nameEl) nameEl.textContent = fullName;
    nameEl?.classList.toggle('is-loading', state.loading.profile);
    if (avatarEl) {
      avatarEl.innerHTML = profileUrl
        ? `<img src="${escapeHtml(profileUrl)}" alt="${escapeHtml(fullName)}">`
        : initials;
    }
  }

  // ── Submit button states ──────────────────────────────────────
  function setSubmitButtonState(mode) {
    if (!submitAssignmentBtn) return;
    submitAssignmentBtn.classList.remove('is-loading', 'is-success', 'is-error');

    if (mode === 'loading') {
      submitAssignmentBtn.disabled = true;
      submitAssignmentBtn.classList.add('is-loading');
      submitAssignmentBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';
    } else if (mode === 'success') {
      submitAssignmentBtn.disabled = true;
      submitAssignmentBtn.classList.add('is-success');
      submitAssignmentBtn.innerHTML = '<i class="fas fa-check"></i> Submitted!';
    } else if (mode === 'error') {
      submitAssignmentBtn.disabled = false;
      submitAssignmentBtn.classList.add('is-error');
      submitAssignmentBtn.innerHTML = '<i class="fas fa-triangle-exclamation"></i> Try Again';
    } else {
      submitAssignmentBtn.disabled = false;
      submitAssignmentBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit Assignment';
    }
  }

  // ── Modal helpers ─────────────────────────────────────────────
  function setModalAssignment(activity) {
    if (!modalAssignmentDetail) return;
    const title       = escapeHtml(getActivityTitle(activity));
    const description = escapeHtml(getActivityDescription(activity) || 'No description provided.');
    const dueDate     = formatDate(activity?.dueDate) || 'No due date';
    const status      = escapeHtml(getStatusLabel(activity));
    modalAssignmentDetail.innerHTML = `
      <div class="modal-assignment-title"><i class="fas fa-project-diagram"></i> ${title}</div>
      <div class="modal-assignment-meta">
        <span><i class="fas fa-calendar-alt"></i> ${dueDate}</span>
        <span><i class="fas fa-circle-info"></i> ${status}</span>
      </div>
      <p class="modal-assignment-description">${description}</p>`;
  }

  function openSubmissionModal(activityId) {
    const activity = state.activities.find(a => getActivityId(a) === activityId);
    if (!activity) {
      window.AppDialog?.alert('Activity not found.', { title: 'Missing Activity' });
      return;
    }
    state.currentActivity = activity;
    setModalAssignment(activity);
    if (submissionModeSelect) submissionModeSelect.value = '';
    applySubmissionMode('');
    const repoSelect = document.getElementById('repoSelect');
    if (repoSelect) { repoSelect.innerHTML = '<option value="">— Select a repository —</option>'; repoSelect.disabled = false; }
    if (submissionModal) {
      const mc = submissionModal.querySelector('.modal-content');
      if (mc) mc.scrollTop = 0;
      submissionModal.style.display = 'block';
      setTimeout(() => submissionModeSelect?.focus(), 100);
    }
  }

  function closeSubmissionModal() {
    if (!submissionModal) return;
    submissionModal.style.opacity = '0';
    setTimeout(() => {
      submissionModal.style.display = 'none';
      submissionModal.style.opacity = '';
      setSubmitButtonState('idle');
    }, 200);
  }

  function clearSubmissionForm() {
    const repoNameInput = document.getElementById('repositoryName');
    const noteInput     = document.getElementById('submissionNote');
    if (repoNameInput) repoNameInput.value = '';
    if (noteInput)     noteInput.value     = '';
    if (submissionModeSelect) submissionModeSelect.value = 'existing';
    applySubmissionMode('existing');
  }

  function applySubmissionMode(mode) {
    const isNew      = mode === 'new';
    const isExisting = mode === 'existing';
    const existingGroup  = document.getElementById('existingRepoGroup');
    const newGroup       = document.getElementById('newRepoGroup');
    const repoNameInput  = document.getElementById('repositoryName');
    const repoSelect     = document.getElementById('repoSelect');

    if (existingGroup) existingGroup.style.display = isExisting ? 'block' : 'none';
    if (newGroup)      newGroup.style.display      = isNew ? 'block' : 'none';
    if (repoSelect)    repoSelect.required         = isExisting;
    if (repoNameInput) { repoNameInput.required = isNew; if (!isNew) repoNameInput.value = ''; }
    if (isExisting)    loadGithubRepos();
  }

  // ── Build local submission record ─────────────────────────────
  function buildLocalSubmission(payload, activity, repositoryUrl, mode) {
    return {
      id:            payload?.submissionId || payload?.id || `${getActivityId(activity)}-${Date.now()}`,
      activityId:    getActivityId(activity),
      title:         getActivityTitle(activity),
      repositoryUrl,
      mode,
      modeLabel:     mode === 'new' ? 'New repository' : 'Existing repository',
      result:        'passed',
      resultLabel:   'Submitted',
      submittedAt:   new Date().toISOString()
    };
  }

  // ── API calls ─────────────────────────────────────────────────
  async function loadStudentProfile() {
    state.loading.profile = true;
    const nameEl = document.getElementById('studentName');
    nameEl?.classList.add('is-loading');
    try {
      if (!apiClient?.request) throw new Error('API client not initialized.');
      const data = await apiClient.request('/users/profile', { method: 'GET' }, { redirectOnUnauthorized: false });
      state.currentStudentId       = String(data?.userId || data?.id || data?.studentId || state.currentStudentId || '').trim();
      state.currentStudentUsername = String(data?.username || data?.githubUsername || data?.login || '').trim();
      setStudentProfile(data);
      await refreshNeedsRepositorySubmission();
      renderActivities();
    } catch {
      setStudentProfile({});
    } finally {
      state.loading.profile = false;
      nameEl?.classList.remove('is-loading');
    }
  }

  async function loadActivities() {
    state.loading.activities = true;
    renderActivities();
    if (!apiClient?.request || !classroomId) {
      state.loading.activities = false;
      renderActivities();
      return;
    }
    try {
      const [activitiesResult, submittedResult] = await Promise.allSettled([
        apiClient.request(
          `/classrooms/${encodeURIComponent(classroomId)}/activities/student`,
          { method: 'GET' },
          { redirectOnUnauthorized: false }
        ),
        apiClient.request(
          `/classrooms/${encodeURIComponent(classroomId)}/activities/submitted`,
          { method: 'GET' },
          { redirectOnUnauthorized: false }
        )
      ]);

      const activities = activitiesResult.status === 'fulfilled'
        ? (Array.isArray(activitiesResult.value?.data) ? activitiesResult.value.data
          : Array.isArray(activitiesResult.value) ? activitiesResult.value : [])
        : [];

      // /submitted returns Map<String, StudentActivityInfoUserData> keyed by activityId
      const submittedMap = submittedResult.status === 'fulfilled'
        ? (submittedResult.value?.data ?? submittedResult.value ?? {})
        : {};

      // Merge submission info onto each activity
      state.activities = activities.map(a => {
        const id = String(a?.activityId || a?.id || '');
        const info = submittedMap[id] ?? null;
        if (!info) return a;
        return {
          ...a,
          submissionStatus:        info.submissionStatus        ?? a.submissionStatus,
          repositoryId:            info.repositoryId            ?? a.repositoryId,
          repositoryName:          info.repositoryName          ?? a.repositoryName,
          repositoryUrl:           info.repositoryUrl           ?? a.repositoryUrl,
          repositoryOwnerUsername: info.repositoryOwnerUsername ?? a.repositoryOwnerUsername,
          repositoryMode:          info.repositoryMode          ?? a.repositoryMode,
          submittedAt:             info.submittedAt             ?? a.submittedAt,
          score:                   info.score                   ?? a.score,
          feedback:                info.feedback                ?? a.feedback,
        };
      });

      await refreshNeedsRepositorySubmission();
      renderActivities();
    } catch {
      state.activities = [];
      state.needsSubmissionByActivityId = {};
      state.needsSubmissionLoaded = false;
    } finally {
      state.loading.activities = false;
      renderActivities();
    }
  }

  async function submitAssignment() {
    if (submitAssignmentBtn?.disabled) return;
    const activity       = state.currentActivity;
    const submissionMode = submissionModeSelect?.value === 'new' ? 'new' : 'existing';
    const submissionNote = document.getElementById('submissionNote')?.value.trim() || '';

    if (!activity) {
      await window.AppDialog?.alert('Select an activity first.', { title: 'Missing Activity' });
      return;
    }

    let repositoryUrl = '';
    if (submissionMode === 'existing') {
      repositoryUrl = document.getElementById('repoSelect')?.value.trim() || '';
      if (!repositoryUrl) {
        await window.AppDialog?.alert('Please select a repository.', { title: 'No Repository Selected' });
        return;
      }
      if (!repositoryUrl.includes('github.com')) {
        await window.AppDialog?.alert('Please select a valid GitHub repository.', { title: 'Invalid Repository' });
        return;
      }
    } else {
      const repoName = document.getElementById('repositoryName')?.value.trim() || '';
      if (!repoName) {
        await window.AppDialog?.alert('Please enter a repository name.', { title: 'Missing Name' });
        return;
      }
      repositoryUrl = repoName;
    }

    if (!classroomId) {
      await window.AppDialog?.alert('Missing classroom id in the page URL.', { title: 'Missing Classroom' });
      return;
    }

    const endpoint = `/classrooms/${encodeURIComponent(classroomId)}/activities/${encodeURIComponent(getActivityId(activity))}/submit/${submissionMode}`;
    setSubmitButtonState('loading');

    try {
      const requestBody = submissionMode === 'new' ? { repositoryName: repositoryUrl } : { repositoryUrl };
      const response    = await apiClient.request(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      }, { redirectOnUnauthorized: false });

      const submitted = response?.data ?? response;
      const record    = buildLocalSubmission(submitted, activity, repositoryUrl, submissionMode);
      if (submissionNote) record.note = submissionNote;

      state.submissions = [record, ...state.submissions];
      saveSubmissions();
      await refreshNeedsRepositorySubmission();
      renderActivities();
      setSubmitButtonState('success');
      await sleep(700);
      closeSubmissionModal();
      clearSubmissionForm();
      await window.AppDialog?.alert('Assignment submitted successfully.', { title: 'Success' });
    } catch (error) {
      setSubmitButtonState('error');
      await window.AppDialog?.alert(error.message || 'Failed to submit assignment.', { title: 'Submission Failed' });
      await sleep(1200);
      setSubmitButtonState('idle');
    }
  }

  async function submitActivityGeneral(activityId) {
    const activity = state.activities.find(a => getActivityId(a) === activityId);
    if (!activity) { await window.AppDialog?.alert('Activity not found.', { title: 'Missing Activity' }); return; }
    if (!classroomId) { await window.AppDialog?.alert('Missing classroom id.', { title: 'Missing Classroom' }); return; }

    const confirmed = await window.AppDialog?.confirm('Mark this activity as submitted?', {
      title: 'Confirm Submission', confirmText: 'Submit'
    });
    if (!confirmed) return;

    const endpoint = `/classrooms/${encodeURIComponent(classroomId)}/activities/${encodeURIComponent(getActivityId(activity))}/submit`;
    try {
      setSubmitButtonState('loading');
      await apiClient.request(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }, { redirectOnUnauthorized: false });

      const record = {
        id:          `${getActivityId(activity)}-${Date.now()}`,
        activityId:  getActivityId(activity),
        title:       getActivityTitle(activity),
        mode:        'general',
        modeLabel:   'Submitted',
        result:      'passed',
        resultLabel: 'Submitted',
        submittedAt: new Date().toISOString()
      };
      state.submissions = [record, ...state.submissions];
      saveSubmissions();
      await refreshNeedsRepositorySubmission();
      renderActivities();
      setSubmitButtonState('success');
      await sleep(700);
      await window.AppDialog?.alert('Activity submitted successfully.', { title: 'Success' });
      setSubmitButtonState('idle');
    } catch (error) {
      setSubmitButtonState('error');
      await window.AppDialog?.alert(error.message || 'Failed to submit activity.', { title: 'Submission Failed' });
      await sleep(1200);
      setSubmitButtonState('idle');
    }
  }

  window.submitActivityGeneral = submitActivityGeneral;

  // ── Event wiring ──────────────────────────────────────────────
  function attachEventHandlers() {
    setSubmitButtonState('idle');

    // Tab switching
    document.querySelectorAll('[data-tab]').forEach(btn => {
      btn.addEventListener('click', () => switchActivityTab(btn.dataset.tab));
    });

    // Modal open/close
    document.getElementById('closeModal')?.addEventListener('click', closeSubmissionModal);
    document.getElementById('cancelSubmitBtn')?.addEventListener('click', closeSubmissionModal);
    window.addEventListener('click', e => { if (e.target === submissionModal) closeSubmissionModal(); });

    // Back button
    document.getElementById('backDashboardBtn')?.addEventListener('click', e => {
      e.preventDefault();
      window.location.href = '/dashboard/';
    });

    // Submission mode select
    if (submissionModeSelect) {
      submissionModeSelect.addEventListener('change', e => {
        applySubmissionMode(e.target.value === 'new' ? 'new' : 'existing');
      });
      applySubmissionMode(submissionModeSelect.value === 'new' ? 'new' : submissionModeSelect.value === 'existing' ? 'existing' : '');
    }

    // Submit button
    submitAssignmentBtn?.addEventListener('click', submitAssignment);

    // Card action buttons (event delegation)
    assignmentsList?.addEventListener('click', e => {
      const repoBtn = e.target.closest('[data-submit-activity-id]');
      if (repoBtn) { openSubmissionModal(String(repoBtn.getAttribute('data-submit-activity-id'))); return; }

      const actBtn = e.target.closest('[data-submit-activity-only-id]');
      if (actBtn) { submitActivityGeneral(String(actBtn.getAttribute('data-submit-activity-only-id'))); }
    });

    // ── Tracked filter buttons ──────────────────────────────────
    document.querySelectorAll('[data-tracked-filter]').forEach(filterBtn => {
      filterBtn.addEventListener('click', () => {
        const value = String(filterBtn.getAttribute('data-tracked-filter') || 'ALL');
        state.filters.trackedSubmission = value;
        document.querySelectorAll('[data-tracked-filter]').forEach(btn => {
          btn.classList.toggle('active', btn.getAttribute('data-tracked-filter') === value);
        });
        renderActivities();
      });
    });
  }

  // ── Init ──────────────────────────────────────────────────────
  function init() {
    renderLoadingSkeleton();
    attachEventHandlers();
    renderActivities();
  }

  async function initializeAsync() {
    await loadStudentProfile();
    await loadActivities();
    loadClassroomInfo();
    await new Promise(r => setTimeout(r, 100));
    renderActivities();
  }

  init();
  initializeAsync();
})();