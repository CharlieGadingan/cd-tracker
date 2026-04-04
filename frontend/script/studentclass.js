(function () {
  const apiClient = window.ApiClient;

  const submissionModal = document.getElementById('submissionModal');
  const modalAssignmentDetail = document.getElementById('modalAssignmentDetail');
  const githubLinkInput = document.getElementById('githubLink');
  const repositoryInputLabel = document.getElementById('repositoryInputLabel');
  const submissionModeSelect = document.getElementById('submissionMode');
  const assignmentsList = document.getElementById('assignmentsList');
  const needsSubmissionList = document.getElementById('needsSubmissionList');
  const assignmentCount = document.getElementById('assignmentCount');
  const pendingCount = document.getElementById('pendingCount');
  const activityStatusFilter = document.getElementById('activityStatusFilter');
  const submitAssignmentBtn = document.getElementById('submitAssignmentBtn');

  const params = new URLSearchParams(window.location.search);
  const classroomId = params.get('classroomId') || params.get('id') || '';
  const studentId = params.get('studentId') || '';

  const state = {
    activities: [],
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
    return !!state.needsSubmissionByActivityId[normalizedId];
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
    return state.activities.filter(activity => isNeedsRepositorySubmission(getActivityId(activity)));
  }

  function matchesActivityFilters(activity) {
    const status = getActivityStatus(activity);
    const statusFilter = state.filters.status;

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

  function renderNeedsSubmissionList() {
    if (!needsSubmissionList) return;

    const pendingActivities = getPendingActivities();

    if (pendingActivities.length === 0) {
      needsSubmissionList.innerHTML = `
        <div class="needs-empty">
          <i class="fas fa-check-circle"></i>
          <span>All repository submissions are complete.</span>
        </div>
      `;
      return;
    }

    needsSubmissionList.innerHTML = pendingActivities.map(activity => {
      const activityId = String(getActivityId(activity));
      const title = escapeHtml(getActivityTitle(activity));

      return `
        <button class="needs-item" type="button" data-assignment-id="${escapeHtml(activityId)}">
          <span class="needs-title">${title}</span>
        </button>
      `;
    }).join('');
  }

  function renderActivities() {
    if (!assignmentsList) return;

    if (!classroomId) {
      assignmentsList.innerHTML = renderEmptyState(
        'Missing classroom id',
        'Open this page from a classroom to load its activities.',
        'fas fa-link'
      );
      if (needsSubmissionList) {
        needsSubmissionList.innerHTML = '';
      }
      return;
    }

    const filteredActivities = state.activities.filter(matchesActivityFilters);

    if (assignmentCount) {
      assignmentCount.textContent = String(filteredActivities.length);
    }

    if (pendingCount) {
      pendingCount.textContent = String(getPendingActivities().length);
    }

    renderNeedsSubmissionList();

    if (filteredActivities.length === 0) {
      assignmentsList.innerHTML = renderEmptyState(
        'No activities match the filter',
        'Try a different status or submission filter.',
        'fas fa-tasks'
      );
      return;
    }

    assignmentsList.innerHTML = filteredActivities.map(activity => {
      const activityId = getActivityId(activity);
      const title = escapeHtml(getActivityTitle(activity));
      const description = getActivityDescription(activity);
      const dueDate = formatDate(activity?.dueDate);
      const daysLeft = getDaysLeft(activity?.dueDate);
      const badgeClass = getStatusBadgeClass(activity);
      const needsSubmission = isNeedsRepositorySubmission(activityId);
      const statusLabel = escapeHtml(getStatusLabel(activity));
      const statusIcon = badgeClass === 'expired' ? 'fas fa-hourglass-end' : 'fas fa-clock';
      const points = activity?.maxScore != null ? `<span class="points"><i class="fas fa-star"></i> ${escapeHtml(activity.maxScore)} points</span>` : '';
      const dueLabel = dueDate
        ? `<span class="assignment-due"><i class="fas fa-calendar-alt"></i><span class="days-left ${daysLeft != null && daysLeft <= 7 ? 'urgent' : 'normal'}">${daysLeft != null ? (daysLeft > 0 ? `${daysLeft} days left` : 'Overdue') : dueDate}</span></span>`
        : '<span class="assignment-due"><i class="fas fa-calendar-alt"></i><span class="days-left normal">No due date</span></span>';
      const cardActionLabel = needsSubmission ? 'Submit repository' : 'Repository submitted';

      return `
        <div class="assignment ${needsSubmission ? 'needs-submission is-clickable' : 'is-submitted'}" data-assignment-id="${escapeHtml(activityId)}" data-needs-submission="${needsSubmission ? 'true' : 'false'}" ${needsSubmission ? 'role="button" tabindex="0"' : ''}>
          <div class="assignment-header">
            <div class="assignment-title">
              <i class="fas fa-project-diagram"></i>
              ${title}
            </div>
            <div class="assignment-status ${badgeClass}">
              <i class="${statusIcon}"></i>
              ${statusLabel}
            </div>
          </div>
          ${description ? `<div class="assignment-desc">${escapeHtml(description)}</div>` : ''}
          <div class="assignment-meta">
            ${dueLabel}
            <span class="in-progress">
              <i class="fas fa-paper-plane"></i>
              ${cardActionLabel}
            </span>
            ${points}
          </div>
        </div>
      `;
    }).join('');
  }

  function setModalAssignment(activity) {
    if (!modalAssignmentDetail) return;

    const title = getActivityTitle(activity);
    const description = getActivityDescription(activity);

    modalAssignmentDetail.innerHTML = `
      <div class="assignment-detail-item">
        <i class="fas fa-tasks"></i>
        <div><strong>${escapeHtml(title)}</strong></div>
      </div>
      ${description ? `
        <div class="assignment-detail-item">
          <i class="fas fa-align-left"></i>
          <div>${escapeHtml(description)}</div>
        </div>
      ` : ''}
    `;
  }

  function openSubmissionModal(activityId) {
    const activity = state.activities.find(item => getActivityId(item) === activityId);

    if (!activity) {
      window.AppDialog.alert('Activity not found.', { title: 'Missing Activity' });
      return;
    }

    if (!isNeedsRepositorySubmission(activityId)) {
      return;
    }

    state.currentActivity = activity;
    setModalAssignment(activity);
    if (submissionModeSelect) {
      submissionModeSelect.value = 'existing';
      updateRepositoryInputMode('existing');
    }
    submissionModal.style.display = 'flex';
  }

  function closeSubmissionModal() {
    if (submissionModal) {
      submissionModal.style.display = 'none';
    }
  }

  function clearSubmissionForm() {
    if (githubLinkInput) githubLinkInput.value = '';
    const noteInput = document.getElementById('submissionNote');
    if (noteInput) noteInput.value = '';
    if (submissionModeSelect) submissionModeSelect.value = 'existing';
    updateRepositoryInputMode('existing');
  }

  function updateRepositoryInputMode(mode) {
    const normalizedMode = mode === 'new' ? 'new' : 'existing';
    const pasteGithubBtn = document.getElementById('pasteGithubBtn');

    if (!githubLinkInput) return;

    if (normalizedMode === 'new') {
      if (repositoryInputLabel) {
        repositoryInputLabel.innerHTML = `
          <i class="fab fa-github"></i>
          Repository Name
        `;
      }

      githubLinkInput.type = 'text';
      githubLinkInput.placeholder = 'my-awesome-project';
      githubLinkInput.value = '';

      if (pasteGithubBtn) {
        pasteGithubBtn.disabled = true;
        pasteGithubBtn.title = 'Paste is only available for existing repository URL mode';
      }
      return;
    }

    if (repositoryInputLabel) {
      repositoryInputLabel.innerHTML = `
        <i class="fab fa-github"></i>
        GitHub Repository Link
      `;
    }

    githubLinkInput.type = 'url';
    githubLinkInput.placeholder = 'https://github.com/username/repository';

    if (pasteGithubBtn) {
      pasteGithubBtn.disabled = false;
      pasteGithubBtn.title = 'Paste from clipboard';
    }
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
      setStudentProfile(data);
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
      
      // Check if error is enrollment-related (403 Forbidden or USER_NOT_CLASSROOM_STUDENT)
      const errorMessage = String(error?.message || error || '');
      const isEnrollmentError = 
        errorMessage.includes('403') || 
        errorMessage.includes('Forbidden') || 
        errorMessage.includes('USER_NOT_CLASSROOM_STUDENT') ||
        errorMessage.includes('not enrolled') ||
        errorMessage.includes('not a student');
      
      if (isEnrollmentError) {
        assignmentsList.innerHTML = renderEmptyState(
          'Not enrolled in this classroom',
          'You are not registered as a student in this classroom. Please join using a classroom code or ask your instructor to add you.',
          'fas fa-user-slash'
        );
        if (needsSubmissionList) {
          needsSubmissionList.innerHTML = '';
        }
        return;
      }
      
      state.activities = [];
      renderActivities();
    }
  }

  async function submitAssignment() {
    const activity = state.currentActivity;
    const repositoryInput = githubLinkInput?.value.trim() || '';
    const submissionMode = submissionModeSelect?.value === 'new' ? 'new' : 'existing';

    if (!activity) {
      await window.AppDialog.alert('Select an activity first.', { title: 'Missing Activity' });
      return;
    }

    if (!repositoryInput) {
      const missingMessage = submissionMode === 'new'
        ? 'Please enter a repository name.'
        : 'Please enter a GitHub repository link.';
      await window.AppDialog.alert(missingMessage, { title: 'Missing Repository' });
      return;
    }

    if (submissionMode === 'existing') {
      if (!repositoryInput.includes('github.com')) {
        await window.AppDialog.alert('Please enter a valid GitHub repository URL.', { title: 'Invalid Link' });
        return;
      }
    } else {
      const repositoryNamePattern = /^[A-Za-z0-9._-]+$/;
      if (!repositoryNamePattern.test(repositoryInput) || repositoryInput.includes('/')) {
        await window.AppDialog.alert('For new repository mode, enter only the repository name (letters, numbers, ., _, -).', {
          title: 'Invalid Repository Name'
        });
        return;
      }
    }

    if (!classroomId) {
      await window.AppDialog.alert('Missing classroom id in the page URL.', { title: 'Missing Classroom' });
      return;
    }

    const endpoint = `/classrooms/${encodeURIComponent(classroomId)}/activities/${encodeURIComponent(getActivityId(activity))}/submit/${submissionMode}`;

    try {
      const payload = submissionMode === 'new'
        ? { repositoryName: repositoryInput }
        : { repositoryUrl: repositoryInput };

      await apiClient.request(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      }, {
        redirectOnUnauthorized: false
      });

      await refreshNeedsRepositorySubmission();
      renderActivities();
      closeSubmissionModal();
      clearSubmissionForm();

      await window.AppDialog.alert('Repository submitted successfully.', {
        title: 'Repository Submitted'
      });
    } catch (error) {
      console.error('Error submitting assignment:', error);
      await window.AppDialog.alert(error.message || 'Failed to submit repository.', {
        title: 'Submission Failed'
      });
    }
  }

  function attachEventHandlers() {
    const closeModalBtn = document.getElementById('closeModal');
    const cancelSubmitBtn = document.getElementById('cancelSubmitBtn');
    const backToDashboardBtn = document.getElementById('backToDashboardBtn');
    const pasteGithubBtn = document.getElementById('pasteGithubBtn');
    const submitAssignmentBtn = document.getElementById('submitAssignmentBtn');

    if (closeModalBtn) closeModalBtn.addEventListener('click', closeSubmissionModal);
    if (cancelSubmitBtn) cancelSubmitBtn.addEventListener('click', closeSubmissionModal);

    if (backToDashboardBtn) {
      backToDashboardBtn.addEventListener('click', event => {
        event.preventDefault();
        window.location.href = '/dashboard/';
      });
    }

    if (pasteGithubBtn) {
      pasteGithubBtn.addEventListener('click', async () => {
        if (submissionModeSelect?.value === 'new') {
          return;
        }

        try {
          const text = await navigator.clipboard.readText();
          if (githubLinkInput) {
            githubLinkInput.value = text;
          }
        } catch (err) {
          await window.AppDialog.alert('Unable to paste from clipboard. Please paste manually.', {
            title: 'Clipboard Error'
          });
        }
      });
    }

    if (submitAssignmentBtn) {
      submitAssignmentBtn.addEventListener('click', submitAssignment);
    }

    if (submissionModeSelect) {
      submissionModeSelect.addEventListener('change', event => {
        updateRepositoryInputMode(event.target.value);
      });
      updateRepositoryInputMode(submissionModeSelect.value);
    }

    if (activityStatusFilter) {
      activityStatusFilter.addEventListener('change', event => {
        state.filters.status = event.target.value || 'ALL';
        renderActivities();
      });
    }

    if (assignmentsList) {
      assignmentsList.addEventListener('click', event => {
        const card = event.target.closest('.assignment');
        if (!card) return;

        const activityId = card.dataset.assignmentId;
        if (activityId && card.dataset.needsSubmission === 'true') {
          openSubmissionModal(activityId);
        }
      });

      assignmentsList.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;

        const card = event.target.closest('.assignment');
        if (!card || card.dataset.needsSubmission !== 'true') return;

        event.preventDefault();
        const activityId = card.dataset.assignmentId;
        if (activityId) openSubmissionModal(activityId);
      });
    }

    if (needsSubmissionList) {
      needsSubmissionList.addEventListener('click', event => {
        const item = event.target.closest('.needs-item');
        if (!item) return;

        const activityId = item.dataset.assignmentId;
        if (activityId) openSubmissionModal(activityId);
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

    if (!classroomId) {
      console.warn('studentclass loaded without a classroomId query parameter');
    }
  }

  init();
})();