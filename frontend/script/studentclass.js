(function () {
  const apiClient = window.ApiClient;

  const submissionModal = document.getElementById('submissionModal');
  const modalAssignmentDetail = document.getElementById('modalAssignmentDetail');
  const githubLinkInput = document.getElementById('githubLink');
  const submissionModeSelect = document.getElementById('submissionMode');
  const assignmentsList = document.getElementById('assignmentsList');
  const assignmentCount = document.getElementById('assignmentCount');
  const pendingCount = document.getElementById('pendingCount');
  const activityStatusFilter = document.getElementById('activityStatusFilter');
  const submitAssignmentBtn = document.getElementById('submitAssignmentBtn');

  const params = new URLSearchParams(window.location.search);
  const classroomId = params.get('classroomId') || params.get('id') || '';
  const studentId = params.get('studentId') || '';
  const storageKey = `studentclass.submissions.${classroomId || 'default'}.${studentId || 'all'}`;

  const state = {
    activities: [],
    submissions: loadSavedSubmissions(),
    currentStudentId: String(studentId || '').trim(),
    currentStudentUsername: '',
    needsSubmissionByActivityId: {},
    needsSubmissionLoaded: false,
    currentActivity: null,
    filters: {
      status: 'ALL'
    }
  };

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

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';

    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: '2-digit',
      year: 'numeric'
    }).format(date);
  }

  function getDaysLeft(value) {
    if (!value) return null;

    const dueDate = new Date(value);
    if (Number.isNaN(dueDate.getTime())) return null;

    const diffMs = dueDate.setHours(23, 59, 59, 999) - Date.now();
    return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  }

  function getActivityId(activity) {
    return activity?.activityId || activity?.id || activity?.activityID || '';
  }

  function getActivityTitle(activity) {
    return activity?.title || activity?.name || 'Untitled activity';
  }

  function getActivityDescription(activity) {
    return activity?.description || activity?.details || '';
  }

  function getActivityStatus(activity) {
    return String(activity?.status || '').trim().toUpperCase();
  }

  function isNeedsRepositorySubmission(activityId) {
    const normalizedId = String(activityId || '');

    if (state.needsSubmissionLoaded && Object.prototype.hasOwnProperty.call(state.needsSubmissionByActivityId, normalizedId)) {
      return !!state.needsSubmissionByActivityId[normalizedId];
    }

    const submission = state.submissions.find(item => String(item.activityId || '') === normalizedId && item.repositoryUrl);
    return !submission;
  }

  
  function getActivitySubmissionState(activityId) {
    return isNeedsRepositorySubmission(activityId) ? 'NOT_SUBMITTED' : 'SUBMITTED';
  }

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
    const url = repo.htmlUrl || repo.html_url || repo.url || '';
    return `<option value="${url}">${name}</option>`;
}).join('');
    } catch (error) {
        console.error('Failed to load GitHub repos:', error);
        repoSelect.innerHTML = '<option value="">Failed to load repositories</option>';
    } finally {
        repoSelect.disabled = false;
    }
}

function loadClassroomInfo() {
    const params = new URLSearchParams(window.location.search);
    const name = params.get('name') || '—';
    const code = params.get('code') || '—';
    const nameEl = document.getElementById('classroomInfoName');
    const codeEl = document.getElementById('classroomInfoCode');
    if (nameEl) nameEl.textContent = decodeURIComponent(name);
    if (codeEl) codeEl.textContent = decodeURIComponent(code);
}

  async function refreshNeedsRepositorySubmission() {
    if (!apiClient?.request || !classroomId || state.activities.length === 0) {
      state.needsSubmissionByActivityId = {};
      state.needsSubmissionLoaded = false;
      return;
    }

    const activityIds = state.activities
      .map(activity => String(getActivityId(activity) || '').trim())
      .filter(Boolean);

    if (activityIds.length === 0) {
      state.needsSubmissionByActivityId = {};
      state.needsSubmissionLoaded = false;
      return;
    }

    try {
      const response = await apiClient.request(`/classrooms/${encodeURIComponent(classroomId)}/activities/unsubmitted`, {
        method: 'GET'
      }, {
        redirectOnUnauthorized: false
      });

      const unsubmittedList = Array.isArray(response?.data)
        ? response.data
        : Array.isArray(response)
          ? response
          : [];

      const unsubmittedActivityIds = new Set(
        unsubmittedList
          .map(activity => String(activity?.activityId || activity?.id || '').trim())
          .filter(Boolean)
      );

      const map = {};
      activityIds.forEach(activityId => {
        map[activityId] = unsubmittedActivityIds.has(activityId);
      });

      state.needsSubmissionByActivityId = map;
      state.needsSubmissionLoaded = true;
    } catch (error) {
      console.error('Failed to load unsubmitted activities:', error);
      state.needsSubmissionByActivityId = {};
      state.needsSubmissionLoaded = false;
    }
  }

  function getPendingActivities() {
    return state.activities.filter(activity => getActivitySubmissionState(getActivityId(activity)) === 'NOT_SUBMITTED');
  }

  function matchesActivityFilters(activity) {
    const status = getActivityStatus(activity);
    const statusFilter = state.filters.status;

    if (statusFilter === 'NEEDS_SUBMISSION') {
      return isNeedsRepositorySubmission(getActivityId(activity));
    }

    const statusMatches = statusFilter === 'ALL' || status === statusFilter;
    return statusMatches;
  }

  function getStatusBadgeClass(activity) {
    const status = getActivityStatus(activity);
    const daysLeft = getDaysLeft(activity?.dueDate);

    if (status === 'ARCHIVED' || status === 'CLOSED') {
      return 'expired';
    }

    if (typeof daysLeft === 'number' && daysLeft <= 7) {
      return 'due-soon';
    }

    return 'due-later';
  }

  function getStatusLabel(activity) {
    const status = getActivityStatus(activity);
    const dueDate = formatDate(activity?.dueDate);
    const daysLeft = getDaysLeft(activity?.dueDate);

    if (status) {
      return status;
    }

    if (daysLeft === null) {
      return 'Active';
    }

    if (daysLeft < 0) {
      return 'Overdue';
    }

    return dueDate ? `Due ${dueDate}` : 'Active';
  }

  function loadSavedSubmissions() {
    try {
      const raw = localStorage.getItem(storageKey);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.error('Error loading saved submissions:', error);
      return [];
    }
  }

  function saveSubmissions() {
    try {
      localStorage.setItem(storageKey, JSON.stringify(state.submissions));
    } catch (error) {
      console.error('Error saving submissions:', error);
    }
  }

  function setStudentProfile(data) {
    const firstName = data.firstName || '';
    const lastName = data.lastName || '';
    const fullName = `${firstName} ${lastName}`.trim() || 'Student';
    const profileUrl = data.profileUrl || '';
    const initials = `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase() || 'ST';

    const nameEl = document.getElementById('studentName');
    const avatarEl = document.getElementById('studentAvatar');

    if (nameEl) nameEl.textContent = fullName;
    if (avatarEl) {
      if (profileUrl) {
        avatarEl.innerHTML = `<img src="${escapeHtml(profileUrl)}" alt="${escapeHtml(fullName)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
      } else {
        avatarEl.textContent = initials;
      }
    }
  }

  function renderEmptyState(message, description, iconClass = 'fas fa-inbox') {
    return `
      <div class="empty-state">
        <i class="${iconClass}"></i>
        <h4>${escapeHtml(message)}</h4>
        <p>${escapeHtml(description)}</p>
      </div>
    `;
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function setSubmitButtonState(mode) {
    if (!submitAssignmentBtn) return;

    submitAssignmentBtn.classList.remove('is-loading', 'is-success', 'is-error');

    if (mode === 'loading') {
      submitAssignmentBtn.disabled = true;
      submitAssignmentBtn.setAttribute('aria-busy', 'true');
      submitAssignmentBtn.classList.add('is-loading');
      submitAssignmentBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';
      return;
    }

    if (mode === 'success') {
      submitAssignmentBtn.disabled = true;
      submitAssignmentBtn.setAttribute('aria-busy', 'false');
      submitAssignmentBtn.classList.add('is-success');
      submitAssignmentBtn.innerHTML = '<i class="fas fa-check"></i> Submitted!';
      return;
    }

    if (mode === 'error') {
      submitAssignmentBtn.disabled = false;
      submitAssignmentBtn.setAttribute('aria-busy', 'false');
      submitAssignmentBtn.classList.add('is-error');
      submitAssignmentBtn.innerHTML = '<i class="fas fa-triangle-exclamation"></i> Try Again';
      return;
    }

    submitAssignmentBtn.disabled = false;
    submitAssignmentBtn.setAttribute('aria-busy', 'false');
    submitAssignmentBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit Assignment';
  }

  
  function renderActivities() {
    if (!assignmentsList) return;

    if (!classroomId) {
      document.getElementById('unsubmittedAssignments').innerHTML = renderEmptyState(
        'Missing classroom id',
        'Open this page from a classroom to load its activities.',
        'fas fa-link'
      );
      document.getElementById('submittedAssignments').innerHTML = '';
      return;
    }

    // ✅ ALL YOUR ORIGINAL LOGIC REMAINS 100% UNCHANGED HERE
    const filteredActivities = state.activities.filter(matchesActivityFilters);

    if (assignmentCount) {
      assignmentCount.textContent = String(filteredActivities.length);
    }
    if (pendingCount) {
      pendingCount.textContent = String(getPendingActivities().length);
    }

    const submittedCountEl = document.getElementById('submittedCount');
    if (submittedCountEl) {
        const submittedCount = state.activities.filter(
            activity => getActivitySubmissionState(getActivityId(activity)) === 'SUBMITTED'
        ).length;
        submittedCountEl.textContent = String(submittedCount);
    }

    if (filteredActivities.length === 0) {
      const isNeedsFilter = state.filters.status === 'NEEDS_SUBMISSION';
      document.getElementById('unsubmittedAssignments').innerHTML = renderEmptyState(
        isNeedsFilter ? 'No assignments need repository submission' : 'No activities match the filter',
        isNeedsFilter
          ? 'Every assignment in this classroom already has a repository attached, or data is still loading.'
          : 'Try a different status filter.',
        isNeedsFilter ? 'fas fa-code-branch' : 'fas fa-tasks'
      );
      document.getElementById('submittedAssignments').innerHTML = '';
      return;
    }


    // Split activities using EXACTLY the same logic you already use
    const unsubmitted = [];
    const submitted = [];
    filteredActivities.forEach(activity => {
      if (isNeedsRepositorySubmission(getActivityId(activity))) {
        unsubmitted.push(activity);
      } else {
        submitted.push(activity);
      }
    });

    // Nice default: unsubmitted sorted by most urgent first
    unsubmitted.sort((a,b) => new Date(a.dueDate) - new Date(b.dueDate));


    // Render Unsubmitted section
    const unsubmittedContainer = document.getElementById('unsubmittedAssignments');
    unsubmittedContainer.innerHTML = `
      <div class="section-header">
        <i class="fas fa-paper-plane"></i> Needs Submission
        <span class="section-count">(${unsubmitted.length})</span>
      </div>
    `;

    if (unsubmitted.length === 0) {
      unsubmittedContainer.innerHTML += `<div class="section-empty"><i class="fas fa-check-double"></i> All assignments have been submitted 🎉</div>`;
    } else {
      unsubmittedContainer.innerHTML += unsubmitted.map(renderAssignmentCard).join('');
    }


    // Render Submitted section
    const submittedContainer = document.getElementById('submittedAssignments');
    submittedContainer.innerHTML = `
      <div class="section-header">
        <i class="fas fa-check"></i> Submitted
        <span class="section-count">(${submitted.length})</span>
      </div>
    `;

    if (submitted.length === 0) {
      submittedContainer.innerHTML += `<div class="section-empty">No submitted assignments yet</div>`;
    } else {
      submittedContainer.innerHTML += submitted.map(renderAssignmentCard).join('');
    }
}


// ✅ We moved your original card template into this clean reusable helper!
// This is exactly your original code, not changed at all
function renderAssignmentCard(activity) {
  const activityId = getActivityId(activity);
  const title = escapeHtml(getActivityTitle(activity));
  const description = getActivityDescription(activity);
  const dueDate = formatDate(activity?.dueDate);
  const daysLeft = getDaysLeft(activity?.dueDate);
  const badgeClass = getStatusBadgeClass(activity);
  const statusLabel = escapeHtml(getStatusLabel(activity));
  const statusIcon = badgeClass === 'expired' ? 'fas fa-hourglass-end' : 'fas fa-clock';
  const points = activity?.maxScore != null ? `<span class="points"><i class="fas fa-star"></i> ${escapeHtml(activity.maxScore)} points</span>` : '';
  const needsSubmission = isNeedsRepositorySubmission(activityId);
  const submissionBadge = needsSubmission
    ? '<span class="assignment-repo-badge"><i class="fas fa-code-branch"></i> Needs repository submission</span>'
    : '<span class="assignment-repo-badge submitted"><i class="fas fa-check"></i> Repository submitted</span>';
  const dueLabel = dueDate
    ? `<span class="assignment-due"><i class="fas fa-calendar-alt"></i><span class="days-left ${daysLeft != null && daysLeft <= 7 ? 'urgent' : 'normal'}">${daysLeft != null ? (daysLeft > 0 ? `${daysLeft} days left` : 'Overdue') : dueDate}</span></span>`
    : '<span class="assignment-due"><i class="fas fa-calendar-alt"></i><span class="days-left normal">No due date</span></span>';
  const submissionAction = needsSubmission
    ? `<button type="button" class="submit-repo-btn" data-submit-activity-id="${escapeHtml(activityId)}"><i class="fas fa-paper-plane"></i> Submit repository</button>`
    : '<span class="repo-submitted-pill"><i class="fas fa-check"></i> Repository submitted</span>';

  return `
    <div class="assignment ${needsSubmission ? 'needs-submission' : ''}" data-assignment-id="${escapeHtml(activityId)}">
      <div class="assignment-header">
        <div class="assignment-title-wrap">
          <div class="assignment-title">
            <i class="fas fa-project-diagram"></i>
            ${title}
          </div>
          <div class="assignment-subtitle">
            ${submissionBadge}
          </div>
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
      </div>
    </div>
  `;
}

  function openSubmissionModal(activityId) {
    const activity = state.activities.find(item => getActivityId(item) === activityId);

    if (!activity) {
      window.AppDialog.alert('Activity not found.', { title: 'Missing Activity' });
      return;
    }

    state.currentActivity = activity;
    setModalAssignment(activity);
    if (submissionModeSelect) submissionModeSelect.value = '';
    applySubmissionMode('');

    const repoSelect = document.getElementById('repoSelect');
    if (repoSelect) {
      repoSelect.innerHTML = '<option value="">— Select a repository —</option>';
      repoSelect.disabled = false;
    }

    submissionModal.style.display = 'block';
}

  function closeSubmissionModal() {
    submissionModal.style.display = 'none';
    setSubmitButtonState('idle');
  }




  function clearSubmissionForm() {
    if (githubLinkInput) githubLinkInput.value = '';
    const repoNameInput = document.getElementById('repositoryName');
    if (repoNameInput) repoNameInput.value = '';
    const noteInput = document.getElementById('submissionNote');
    if (noteInput) noteInput.value = '';
    if (submissionModeSelect) submissionModeSelect.value = 'existing';
    applySubmissionMode('existing');
  }

  function applySubmissionMode(mode) {
    const isNew = mode === 'new';
    const isExisting = mode === 'existing';
    const existingRepoGroup = document.getElementById('existingRepoGroup');
    const newRepoGroup = document.getElementById('newRepoGroup');
    const repoNameInput = document.getElementById('repositoryName');
    const repoSelect = document.getElementById('repoSelect');

    if (existingRepoGroup) existingRepoGroup.style.display = isExisting ? 'block' : 'none';
    if (newRepoGroup) newRepoGroup.style.display = isNew ? 'block' : 'none';
    if (repoSelect) repoSelect.required = isExisting;
    if (repoNameInput) {
        repoNameInput.required = isNew;
        if (!isNew) repoNameInput.value = '';
    }

    if (isExisting) loadGithubRepos();
}

  
  function buildLocalSubmission(payload, activity, repositoryUrl, mode) {
    const modeLabel = mode === 'new' ? 'New repository' : 'Existing repository';

    return {
      id: payload?.submissionId || payload?.id || `${getActivityId(activity)}-${Date.now()}`,
      activityId: getActivityId(activity),
      title: getActivityTitle(activity),
      repositoryUrl,
      mode,
      modeLabel,
      result: 'passed',
      resultLabel: 'Submitted',
      submittedAt: new Date().toISOString()
    };
  }

  async function loadStudentProfile() {
    try {
      if (!apiClient?.request) {
        throw new Error('API client is not initialized.');
      }

      const data = await apiClient.request('/users/profile', {
        method: 'GET'
      }, {
        redirectOnUnauthorized: false
      });

      state.currentStudentId = String(data?.userId || data?.id || data?.studentId || state.currentStudentId || '').trim();
      state.currentStudentUsername = String(data?.username || data?.githubUsername || data?.login || '').trim();
      setStudentProfile(data);

      await refreshNeedsRepositorySubmission();
      renderActivities();
    } catch (error) {
      console.error('Error loading student profile:', error);
    }
  }

  async function loadActivities() {
    if (!apiClient?.request || !classroomId) {
      renderActivities();
      return;
    }

    try {
      const result = await apiClient.request(`/classrooms/${encodeURIComponent(classroomId)}/activities/student`, {
        method: 'GET'
      }, {
        redirectOnUnauthorized: false
      });

      const activities = Array.isArray(result?.data) ? result.data : Array.isArray(result) ? result : [];
      state.activities = activities;

      await refreshNeedsRepositorySubmission();
      renderActivities();
    } catch (error) {
      console.error('Error loading activities:', error);
      state.activities = [];
      state.needsSubmissionByActivityId = {};
      state.needsSubmissionLoaded = false;
      renderActivities();
    }
  }

  async function submitAssignment() {
    const activity = state.currentActivity;
    const submissionMode = submissionModeSelect?.value === 'new' ? 'new' : 'existing';
    const submissionNote = document.getElementById('submissionNote')?.value.trim() || '';

    if (!activity) {
      await window.AppDialog.alert('Select an activity first.', { title: 'Missing Activity' });
      return;
    }

    let repositoryUrl = '';
    if (submissionMode === 'existing') {
      repositoryUrl = document.getElementById('repoSelect')?.value.trim() || '';
      if (!repositoryUrl) {
        await window.AppDialog.alert('Please select a repository from the list.', { title: 'No Repository Selected' });
        return;
      }
      if (!repositoryUrl.includes('github.com')) {
        await window.AppDialog.alert('Please select a valid GitHub repository.', { title: 'Invalid Repository' });
        return;
      }
    } else {
      // For new repository - backend handles URL construction
      const repoName = document.getElementById('repositoryName')?.value.trim() || '';
      if (!repoName) {
        await window.AppDialog.alert('Please enter a repository name.', { title: 'Missing Name' });
        return;
      }
      repositoryUrl = repoName;
    }

    if (!classroomId) {
      await window.AppDialog.alert('Missing classroom id in the page URL.', { title: 'Missing Classroom' });
      return;
    }

    const endpoint = `/classrooms/${encodeURIComponent(classroomId)}/activities/${encodeURIComponent(getActivityId(activity))}/submit/${submissionMode}`;

    setSubmitButtonState('loading');

    try {
      const requestBody = submissionMode === 'new'
        ? { repositoryName: repositoryUrl }
        : { repositoryUrl };

      const response = await apiClient.request(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      }, {
        redirectOnUnauthorized: false
      });

      const submitted = response?.data ?? response;
      const record = buildLocalSubmission(submitted, activity, repositoryUrl, submissionMode);

      if (submissionNote) {
        record.note = submissionNote;
      }

      state.submissions = [record, ...state.submissions];
      saveSubmissions();

      await refreshNeedsRepositorySubmission();
      renderActivities();
      setSubmitButtonState('success');
      await sleep(700);
      closeSubmissionModal();
      clearSubmissionForm();

      await window.AppDialog.alert('Assignment submitted successfully.', {
        title: 'Success'
      });
    } catch (error) {
      console.error('Error submitting assignment:', error);
      setSubmitButtonState('error');
      await window.AppDialog.alert(error.message || 'Failed to submit assignment.', {
        title: 'Submission Failed'
      });
      await sleep(1200);
      setSubmitButtonState('idle');
    }
  }

  function attachEventHandlers() {
    const closeModalBtn = document.getElementById('closeModal');
    const cancelSubmitBtn = document.getElementById('cancelSubmitBtn');
    const backToDashboardBtn = document.getElementById('backToDashboardBtn');
    const pasteGithubBtn = document.getElementById('pasteGithubBtn');
    setSubmitButtonState('idle');
    const existingRepoGroup = document.getElementById('existingRepoGroup');
    const newRepoGroup = document.getElementById('newRepoGroup');

    if (closeModalBtn) closeModalBtn.addEventListener('click', closeSubmissionModal);
    if (cancelSubmitBtn) cancelSubmitBtn.addEventListener('click', closeSubmissionModal);

    if (submissionModeSelect) {
      submissionModeSelect.addEventListener('change', event => {
        applySubmissionMode(event.target.value === 'new' ? 'new' : 'existing');
      });

      applySubmissionMode(submissionModeSelect.value === 'new' ? 'new' : 'existing');
    }

    if (backToDashboardBtn) {
      backToDashboardBtn.addEventListener('click', event => {
        event.preventDefault();
        window.location.href = '/dashboard/';
      });
    }

    if (pasteGithubBtn) {
      pasteGithubBtn.addEventListener('click', async () => {
        try {
          const text = await navigator.clipboard.readText();
          githubLinkInput.value = text;
        } catch (error) {
          await window.AppDialog.alert('Unable to paste from clipboard. Please paste manually.', {
            title: 'Clipboard Error'
          });
        }
      });
    }

    if (submitAssignmentBtn) {
      submitAssignmentBtn.addEventListener('click', submitAssignment);
    }

    if (activityStatusFilter) {
      activityStatusFilter.addEventListener('change', event => {
        state.filters.status = event.target.value || 'ALL';
        renderActivities();
      });
    }

    if (assignmentsList) {
      assignmentsList.addEventListener('click', event => {
        const actionButton = event.target.closest('[data-submit-activity-id]');
        if (!actionButton) return;

        const activityId = actionButton.getAttribute('data-submit-activity-id');
        if (!activityId) return;

        openSubmissionModal(String(activityId));
      });
    }


    window.addEventListener('click', event => {
      if (event.target === submissionModal) closeSubmissionModal();
    });
  }

  function init() {
    attachEventHandlers();
    renderActivities();
    loadStudentProfile();
    loadActivities();
    loadClassroomInfo();
    if (!classroomId) {
      console.warn('studentclass loaded without a classroomId query parameter');
    }
  }

  init();
})();