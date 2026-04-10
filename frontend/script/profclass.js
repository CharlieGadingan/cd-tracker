
    const apiRequest = window.ApiClient?.request;
            let classroomId = null;
            let currentUser = null;
            let activities = [];
            let students = [];
            let activityLog = [];
            let currentUnsubmittedActivityId = null;
            let currentSubmittedActivityId = null;
            let currentStudentForSubmission = null;
            let currentActivityForSubmission = null;
            let submittedByActivityId = {};
            let currentSubmittedRepositories = [];
            let submittedSearchQuery = '';
            let submittedVisibleLimit = 8;
            const submittedVisibleStep = 8;
            let submittedDetailByKey = {};

            // ═══════════════════════════════════════════════════════════════════
            // INITIALIZATION
            // ═══════════════════════════════════════════════════════════════════

            document.addEventListener('DOMContentLoaded', async () => {
                if (!apiRequest) {
                    showNotification('API client is not initialized.', 'error');
                    return;
                }

                extractClassroomId();
                setupEventListeners();

                await loadUserProfile();
                await loadStudents();
                await loadActivities();
                await loadRecentActivities();
            });

            // ═══════════════════════════════════════════════════════════════════
            // UTILITY FUNCTIONS
            // ═══════════════════════════════════════════════════════════════════

            function extractClassroomId() {
                const params = new URLSearchParams(window.location.search);
                classroomId = params.get('id') || params.get('classroomId');
                if (!classroomId) {
                    showNotification('Classroom ID not found in URL', 'error');
                    setTimeout(() => window.location.href = '/dashboard/', 2000);
                }
            }

            function showNotification(message, type = 'info') {
                const notification = document.createElement('div');
                notification.className = `notification ${type}`;
                notification.textContent = message;
                document.body.appendChild(notification);

                setTimeout(() => {
                    notification.style.animation = 'slideInRight 0.3s ease-in reverse';
                    setTimeout(() => notification.remove(), 300);
                }, 3000);
            }

            function formatDate(dateString) {
                const date = new Date(dateString);
                return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            }

            function formatDateTime(dateString) {
                if (!dateString) return 'N/A';
                const date = new Date(dateString);
                if (Number.isNaN(date.getTime())) return 'N/A';
                return date.toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit'
                });
            }

            function escapeHtml(text) {
                const div = document.createElement('div');
                div.textContent = text ?? '';
                return div.innerHTML;
            }

            function getActivityId(activity) {
                return String(activity?.activityId || activity?.id || activity?.activityID || '').trim();
            }

            function getActivityTitle(activity) {
                return String(activity?.title || activity?.name || 'Untitled activity').trim() || 'Untitled activity';
            }

            function normalizeUnsubmittedStudent(entry) {
                const firstName = String(entry?.firstName || entry?.studentFirstName || '').trim();
                const lastName = String(entry?.lastName || entry?.studentLastName || '').trim();
                const fullName = String(entry?.fullName || entry?.studentName || '').trim();
                const username = String(entry?.username || entry?.githubUsername || '').trim();
                const profileUrl = String(entry?.profileUrl || entry?.avatarUrl || '').trim();
                const userId = String(entry?.studentId || entry?.userId || entry?.id || '').trim();

                const displayName = fullName || `${firstName} ${lastName}`.trim() || username || 'Student';
                const initials = displayName
                    .split(' ')
                    .filter(Boolean)
                    .map(part => part.charAt(0))
                    .join('')
                    .slice(0, 2)
                    .toUpperCase() || 'ST';

                return {
                    userId,
                    displayName,
                    username,
                    profileUrl,
                    initials
                };
            }

            function normalizeSubmittedEntry(entry, fallbackActivityId = '') {
                const activityId = String(entry?.activityId || entry?.id || fallbackActivityId || '').trim();
                const firstName = String(entry?.firstName || entry?.studentFirstName || '').trim();
                const lastName = String(entry?.lastName || entry?.studentLastName || '').trim();
                const fullName = String(entry?.fullName || entry?.studentName || '').trim();
                const username = String(entry?.username || entry?.githubUsername || '').trim();
                const profileUrl = String(entry?.profileUrl || entry?.avatarUrl || '').trim();
                const userId = String(entry?.studentId || entry?.userId || entry?.id || '').trim();
                const studentActivityId = String(entry?.studentActivityId || '').trim();
                const title = String(entry?.title || entry?.activityTitle || '').trim();
                const description = String(entry?.description || '').trim();
                const dueDate = String(entry?.dueDate || '').trim();
                const activityStatus = String(entry?.activityStatus || entry?.status || '').trim();
                const maxScore = entry?.maxScore;
                const submissionStatus = String(entry?.submissionStatus || '').trim();
                const feedback = String(entry?.feedback || '').trim();
                const repositoryUrl = String(
                    entry?.repositoryUrl ||
                    entry?.htmlUrl ||
                    entry?.html_url ||
                    entry?.url ||
                    ''
                ).trim();
                const repositoryOwnerUsername = String(entry?.repositoryOwnerUsername || '').trim();
                const repositoryId = String(entry?.repositoryId || '').trim();
                const repositoryName = String(entry?.repositoryName || '').trim();
                const repositoryMode = String(entry?.repositoryMode || '').trim();
                const submittedAt = String(entry?.submittedAt || entry?.createdAt || entry?.updatedAt || '').trim();

                const displayName = fullName || `${firstName} ${lastName}`.trim() || username || 'Student';
                const initials = displayName
                    .split(' ')
                    .filter(Boolean)
                    .map(part => part.charAt(0))
                    .join('')
                    .slice(0, 2)
                    .toUpperCase() || 'ST';

                return {
                    activityId,
                    userId,
                    studentActivityId,
                    title,
                    description,
                    dueDate,
                    activityStatus,
                    maxScore,
                    submissionStatus,
                    feedback,
                    displayName,
                    username,
                    profileUrl,
                    initials,
                    repositoryOwnerUsername,
                    repositoryId,
                    repositoryName,
                    repositoryMode,
                    repositoryUrl,
                    submittedAt
                };
            }

            function toSubmissionArray(value, fallbackActivityId = '') {
                if (!value) return [];

                if (Array.isArray(value)) {
                    return value
                        .filter(item => item && typeof item === 'object')
                        .map(item => normalizeSubmittedEntry(item, fallbackActivityId));
                }

                if (typeof value !== 'object') {
                    return [];
                }

                if (Array.isArray(value.data)) {
                    return toSubmissionArray(value.data, fallbackActivityId);
                }
                if (Array.isArray(value.submissions)) {
                    return toSubmissionArray(value.submissions, fallbackActivityId);
                }
                if (Array.isArray(value.students)) {
                    return toSubmissionArray(value.students, fallbackActivityId);
                }
                if (Array.isArray(value.users)) {
                    return toSubmissionArray(value.users, fallbackActivityId);
                }
                if (Array.isArray(value.submittedActivities)) {
                    const userId = String(value.userId || value.studentId || value.id || '').trim();
                    const firstName = String(value.firstName || '').trim();
                    const lastName = String(value.lastName || '').trim();
                    const profileUrl = String(value.profileUrl || '').trim();

                    return value.submittedActivities
                        .filter(item => item && typeof item === 'object')
                        .map(item => normalizeSubmittedEntry({
                            ...item,
                            userId: item.userId || userId,
                            firstName: item.firstName || firstName,
                            lastName: item.lastName || lastName,
                            profileUrl: item.profileUrl || profileUrl
                        }, fallbackActivityId));
                }

                const objectValues = Object.values(value).filter(item => item && typeof item === 'object');
                if (objectValues.length > 0) {
                    return objectValues.map(item => normalizeSubmittedEntry(item, fallbackActivityId));
                }

                return [normalizeSubmittedEntry(value, fallbackActivityId)];
            }

            function mapSubmittedByActivity(payload) {
                const map = {};

                if (Array.isArray(payload)) {
                    payload
                        .filter(item => item && typeof item === 'object')
                        .forEach(item => {
                            const normalized = normalizeSubmittedEntry(item);
                            const activityId = String(normalized.activityId || '').trim();
                            if (!activityId) return;
                            if (!Array.isArray(map[activityId])) map[activityId] = [];
                            map[activityId].push(normalized);
                        });
                    return map;
                }

                if (!payload || typeof payload !== 'object') {
                    return map;
                }

                Object.entries(payload).forEach(([key, value]) => {
                    const userKey = String(key || '').trim();

                    const submissions = toSubmissionArray(value)
                        .map(item => ({
                            ...item,
                            userId: String(item.userId || userKey).trim(),
                            activityId: String(item.activityId || '').trim()
                        }))
                        .filter(item => String(item.activityId || '').trim() !== '');

                    if (submissions.length > 0) {
                        submissions.forEach(item => {
                            const activityId = String(item.activityId || '').trim();
                            if (!activityId) return;
                            if (!Array.isArray(map[activityId])) map[activityId] = [];
                            map[activityId].push(item);
                        });
                    }
                });

                return map;
            }

            function extractSubmittedPayload(responseBody) {
                if (!responseBody || typeof responseBody !== 'object') {
                    return {};
                }

                // Expected backend shape: { data: { [userId]: SubmittedActivityUserData }, error: null }
                if (responseBody.data && typeof responseBody.data === 'object' && !Array.isArray(responseBody.data)) {
                    return responseBody.data;
                }

                // Some environments wrap payloads once more.
                if (responseBody.data?.data && typeof responseBody.data.data === 'object' && !Array.isArray(responseBody.data.data)) {
                    return responseBody.data.data;
                }

                // Fallback for direct map payloads.
                return responseBody;
            }

            function getSubmittedEntries(activityId) {
                const normalizedId = String(activityId || '').trim();
                return Array.isArray(submittedByActivityId[normalizedId]) ? submittedByActivityId[normalizedId] : [];
            }

            function getSubmittedRepositoryCount(activityId) {
                return getSubmittedEntries(activityId)
                    .filter(item => String(item.repositoryUrl || '').trim().length > 0)
                    .length;
            }

            function normalizeRecentActivity(entry) {
                const firstName = String(entry?.firstName || '').trim();
                const lastName = String(entry?.lastName || '').trim();
                const studentName = `${firstName} ${lastName}`.trim();
                const eventType = String(entry?.eventType || '').trim().toUpperCase();
                const occurredAt = String(entry?.occurredAt || '').trim();

                return {
                    eventType,
                    occurredAt,
                    studentUserId: String(entry?.studentUserId || '').trim(),
                    studentName,
                    profileUrl: String(entry?.profileUrl || '').trim(),
                    activityId: String(entry?.activityId || '').trim(),
                    activityTitle: String(entry?.activityTitle || '').trim(),
                    repositoryName: String(entry?.repositoryName || '').trim(),
                    repositoryUrl: String(entry?.repositoryUrl || '').trim()
                };
            }

            function extractRecentActivitiesPayload(responseBody) {
                if (!responseBody) return [];
                if (Array.isArray(responseBody)) return responseBody;
                if (Array.isArray(responseBody?.data)) return responseBody.data;
                if (Array.isArray(responseBody?.data?.data)) return responseBody.data.data;
                return [];
            }

            function getRecentActivityUi(eventType) {
                if (eventType === 'ACTIVITY_CREATED') {
                    return {
                        filter: 'activities',
                        badgeClass: 'badge-created',
                        badgeText: 'Activity',
                        iconClass: 'fas fa-tasks',
                        actor: 'Professor',
                        isProfessor: true
                    };
                }

                if (eventType === 'REPOSITORY_SUBMITTED') {
                    return {
                        filter: 'submissions',
                        badgeClass: 'badge-submitted',
                        badgeText: 'Submission',
                        iconClass: 'fas fa-code-branch',
                        actor: null,
                        isProfessor: false
                    };
                }

                if (eventType === 'STUDENT_JOINED') {
                    return {
                        filter: 'joins',
                        badgeClass: 'badge-joined',
                        badgeText: 'Join',
                        iconClass: 'fas fa-user-plus',
                        actor: null,
                        isProfessor: false
                    };
                }

                return {
                    filter: 'all',
                    badgeClass: 'badge-submitted',
                    badgeText: 'Activity',
                    iconClass: 'fas fa-bolt',
                    actor: null,
                    isProfessor: false
                };
            }

            function renderActivityLog(items = activityLog) {
                const activityList = document.getElementById('activityList');
                if (!activityList) return;

                if (!Array.isArray(items) || items.length === 0) {
                    activityList.innerHTML = `
                        <div class="empty-state">
                            <i class="fas fa-history"></i>
                            <p>No activity yet</p>
                        </div>
                    `;
                    return;
                }

                activityList.innerHTML = items.map(item => {
                    const ui = getRecentActivityUi(item.eventType);
                    const actorName = ui.actor || item.studentName || 'Student';
                    const initials = actorName
                        .split(' ')
                        .filter(Boolean)
                        .map(part => part.charAt(0))
                        .join('')
                        .slice(0, 2)
                        .toUpperCase() || 'CT';

                    let text = 'Classroom activity updated';
                    let details = '';

                    if (item.eventType === 'ACTIVITY_CREATED') {
                        text = `${actorName} created an activity`;
                        details = item.activityTitle ? `<i class="fas fa-book"></i> ${escapeHtml(item.activityTitle)}` : '';
                    } else if (item.eventType === 'REPOSITORY_SUBMITTED') {
                        text = `${actorName} submitted a repository`;
                        const parts = [];
                        if (item.activityTitle) parts.push(`<i class="fas fa-book"></i> ${escapeHtml(item.activityTitle)}`);
                        if (item.repositoryName) parts.push(`<i class="fas fa-folder-open"></i> ${escapeHtml(item.repositoryName)}`);
                        details = parts.join(' • ');
                    } else if (item.eventType === 'STUDENT_JOINED') {
                        text = `${actorName} joined the classroom`;
                    }

                    const avatarMarkup = item.profileUrl
                        ? `<img src="${escapeHtml(item.profileUrl)}" alt="${escapeHtml(actorName)}">`
                        : escapeHtml(initials);

                    return `
                        <div class="activity-item">
                            <div class="activity-avatar ${ui.isProfessor ? 'professor' : ''}">${avatarMarkup}</div>
                            <div class="activity-content">
                                <div class="activity-user">
                                    ${escapeHtml(actorName)}
                                    <span class="activity-badge ${ui.badgeClass}"><i class="${ui.iconClass}"></i> ${ui.badgeText}</span>
                                </div>
                                <div class="activity-text">${escapeHtml(text)}</div>
                                ${details ? `<div class="activity-details">${details}</div>` : ''}
                                <div class="activity-time"><i class="far fa-clock"></i> ${escapeHtml(item.occurredAt ? timeAgo(item.occurredAt) : 'Recently')}</div>
                            </div>
                        </div>
                    `;
                }).join('');
            }

            async function loadRecentActivities(limit = 20) {
                if (!classroomId) return;

                const activityList = document.getElementById('activityList');
                if (activityList) {
                    activityList.innerHTML = `
                        <div class="empty-state">
                            <i class="fas fa-spinner fa-spin"></i>
                            <p>Loading recent activity...</p>
                        </div>
                    `;
                }

                try {
                    const result = await apiRequest(`/classrooms/${encodeURIComponent(classroomId)}/recent-activities?limit=${encodeURIComponent(limit)}`, {
                        method: 'GET'
                    });

                    if (result?.error && !result?.data) {
                        activityLog = [];
                        renderActivityLog();
                        return;
                    }

                    const rawItems = extractRecentActivitiesPayload(result);
                    activityLog = rawItems
                        .filter(item => item && typeof item === 'object')
                        .map(normalizeRecentActivity)
                        .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());

                    const selectedFilter = document.getElementById('activityFilter')?.value || 'all';
                    filterActivityLog(selectedFilter);
                } catch (error) {
                    if (String(error.message || '').includes('405') || String(error.message || '').includes('404')) {
                        activityLog = [];
                        renderActivityLog();
                        return;
                    }
                    console.error('Error loading recent activity:', error);
                    activityLog = [];
                    renderActivityLog();
                }
            }

            function timeAgo(dateString) {
                const date = new Date(dateString);
                const seconds = Math.floor((new Date() - date) / 1000);
                
                let interval = seconds / 31536000;
                if (interval > 1) return Math.floor(interval) + ' years ago';
                
                interval = seconds / 2592000;
                if (interval > 1) return Math.floor(interval) + ' months ago';
                
                interval = seconds / 86400;
                if (interval > 1) return Math.floor(interval) + ' days ago';
                
                interval = seconds / 3600;
                if (interval > 1) return Math.floor(interval) + ' hours ago';
                
                interval = seconds / 60;
                if (interval > 1) return Math.floor(interval) + ' minutes ago';
                
                return 'just now';
            }

            function getDaysLeft(dueDate) {
                const due = new Date(dueDate);
                const today = new Date();
                const diffTime = due - today;
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                return diffDays;
            }

            // ═══════════════════════════════════════════════════════════════════
            // MODAL HELPERS
            // ═══════════════════════════════════════════════════════════════════

            function openModal(modal) {
                if (modal) modal.classList.add('active');
            }

            function closeModal(modal) {
                if (modal) modal.classList.remove('active');
            }

            // ═══════════════════════════════════════════════════════════════════
            // EVENT LISTENERS
            // ═══════════════════════════════════════════════════════════════════

            function setupEventListeners() {
                const createActivityBtn = document.getElementById('createActivityBtn');
                if (createActivityBtn) {
                    createActivityBtn.addEventListener('click', () => {
                        document.getElementById('createActivityForm').reset();
                        document.getElementById('activityStatus').value = 'PUBLISHED';
                        openModal(document.getElementById('createActivityModal'));
                    });
                }

                const closeModalBtn = document.getElementById('closeModalBtn');
                if (closeModalBtn) {
                    closeModalBtn.addEventListener('click', () => {
                        closeModal(document.getElementById('createActivityModal'));
                    });
                }

                const cancelBtn = document.getElementById('cancelBtn');
                if (cancelBtn) {
                    cancelBtn.addEventListener('click', () => {
                        closeModal(document.getElementById('createActivityModal'));
                    });
                }

                const saveActivityBtn = document.getElementById('saveActivityBtn');
                if (saveActivityBtn) {
                    saveActivityBtn.addEventListener('click', async () => {
                        await handleCreateActivity();
                    });
                }

                const closeEditModalBtn = document.getElementById('closeEditModalBtn');
                if (closeEditModalBtn) {
                    closeEditModalBtn.addEventListener('click', () => {
                        closeModal(document.getElementById('editActivityModal'));
                    });
                }

                const cancelEditBtn = document.getElementById('cancelEditBtn');
                if (cancelEditBtn) {
                    cancelEditBtn.addEventListener('click', () => {
                        closeModal(document.getElementById('editActivityModal'));
                    });
                }

                const saveEditActivityBtn = document.getElementById('saveEditActivityBtn');
                if (saveEditActivityBtn) {
                    saveEditActivityBtn.addEventListener('click', async () => {
                        await handleEditActivity();
                    });
                }

                const closeUnsubmittedModalBtn = document.getElementById('closeUnsubmittedModalBtn');
                const closeUnsubmittedBtn = document.getElementById('closeUnsubmittedBtn');
                if (closeUnsubmittedModalBtn) {
                    closeUnsubmittedModalBtn.addEventListener('click', () => {
                        closeModal(document.getElementById('unsubmittedModal'));
                    });
                }
                if (closeUnsubmittedBtn) {
                    closeUnsubmittedBtn.addEventListener('click', () => {
                        closeModal(document.getElementById('unsubmittedModal'));
                    });
                }

                const closeSubmittedDetailModalBtn = document.getElementById('closeSubmittedDetailModalBtn');
                const closeSubmittedDetailBtn = document.getElementById('closeSubmittedDetailBtn');
                if (closeSubmittedDetailModalBtn) {
                    closeSubmittedDetailModalBtn.addEventListener('click', () => {
                        closeSubmittedDetailModal();
                    });
                }
                if (closeSubmittedDetailBtn) {
                    closeSubmittedDetailBtn.addEventListener('click', () => {
                        closeSubmittedDetailModal();
                    });
                }

                // Student Submission Modal Event Listeners
                const closeSubmissionModalBtn = document.getElementById('closeSubmissionModalBtn');
                const cancelSubmissionBtn = document.getElementById('cancelSubmissionBtn');
                const submitForStudentBtn = document.getElementById('submitForStudentBtn');
                const submissionType = document.getElementById('submissionType');

                if (closeSubmissionModalBtn) {
                    closeSubmissionModalBtn.addEventListener('click', () => {
                        closeModal(document.getElementById('studentSubmissionModal'));
                    });
                }
                if (cancelSubmissionBtn) {
                    cancelSubmissionBtn.addEventListener('click', () => {
                        closeModal(document.getElementById('studentSubmissionModal'));
                    });
                }
                if (submitForStudentBtn) {
                    submitForStudentBtn.addEventListener('click', async () => {
                        await handleSubmitForStudent();
                    });
                }
                if (submissionType) {
                    submissionType.addEventListener('change', (e) => {
                        applySubmissionTypeUI(e.target.value);
                    });
                }

                const activityFilter = document.getElementById('activityFilter');
                if (activityFilter) {
                    activityFilter.addEventListener('change', async (e) => {
                        await filterActivityLog(e.target.value);
                    });
                }

                const assignmentsList = document.getElementById('assignmentsList');
                if (assignmentsList) {
                    assignmentsList.addEventListener('click', async (e) => {
                        if (e.target.closest('.assignment-actions') || e.target.closest('.action-btn')) {
                            return;
                        }

                        const card = e.target.closest('[data-submitted-activity-id]');
                        if (!card) return;

                        const activityId = card.getAttribute('data-submitted-activity-id');
                        if (!activityId) return;

                        await showSubmittedStudents(activityId);
                    });
                }

                const unsubmittedList = document.getElementById('unsubmittedList');
                if (unsubmittedList) {
                    unsubmittedList.addEventListener('input', (e) => {
                        const searchInput = e.target.closest('#submittedSearchInput');
                        if (!searchInput) return;

                        const selectionStart = searchInput.selectionStart;
                        const selectionEnd = searchInput.selectionEnd;
                        submittedSearchQuery = String(searchInput.value || '').trim().toLowerCase();
                        submittedVisibleLimit = submittedVisibleStep;
                        renderSubmittedList(currentSubmittedRepositories, {
                            preserveSearchFocus: true,
                            selectionStart,
                            selectionEnd
                        });
                    });

                    unsubmittedList.addEventListener('click', (e) => {
                        const showMoreBtn = e.target.closest('#submittedShowMoreBtn');
                        if (showMoreBtn) {
                            submittedVisibleLimit += submittedVisibleStep;
                            renderSubmittedList(currentSubmittedRepositories);
                            return;
                        }

                        const showLessBtn = e.target.closest('#submittedShowLessBtn');
                        if (showLessBtn) {
                            submittedVisibleLimit = submittedVisibleStep;
                            renderSubmittedList(currentSubmittedRepositories);
                            return;
                        }

                        const detailsTrigger = e.target.closest('[data-submission-key]');
                        if (detailsTrigger) {
                            const key = detailsTrigger.getAttribute('data-submission-key');
                            if (!key) return;
                            openSubmittedDetailsFromKey(key);
                        }
                    });
                }

                const backToDashboardBtn = document.getElementById('backDashboardBtn');
                if (backToDashboardBtn) {
                    backToDashboardBtn.addEventListener('click', (e) => {
                        e.preventDefault();
                        // Navigate back to main dashboard
                        window.location.href = '/dashboard/';
                    });
                }

                window.addEventListener('click', (e) => {
                    const createModal = document.getElementById('createActivityModal');
                    const editModal = document.getElementById('editActivityModal');
                    const unsubmittedModal = document.getElementById('unsubmittedModal');
                    const submittedDetailModal = document.getElementById('submittedDetailModal');
                    if (e.target === createModal) {
                        closeModal(createModal);
                    }
                    if (e.target === editModal) {
                        closeModal(editModal);
                    }
                    if (e.target === unsubmittedModal) {
                        closeModal(unsubmittedModal);
                    }
                    if (e.target === submittedDetailModal) {
                        closeSubmittedDetailModal();
                    }
                });
            }

            function closeSubmittedDetailModal() {
                const submittedDetailModal = document.getElementById('submittedDetailModal');
                const unsubmittedModal = document.getElementById('unsubmittedModal');
                closeModal(submittedDetailModal);
                if (currentSubmittedActivityId) {
                    openModal(unsubmittedModal);
                }
            }

            function renderSubmittedDetailCard(student) {
                const repositoryUrl = String(student.repositoryUrl || '').trim();
                const submittedExactText = student.submittedAt ? formatDateTime(student.submittedAt) : '';
                const repoName = String(student.repositoryName || '').trim();
                const repoOwner = String(student.repositoryOwnerUsername || '').trim();
                const repoMode = String(student.repositoryMode || '').trim();
                const status = String(student.submissionStatus || '').trim();
                const dueDateText = student.dueDate ? formatDate(student.dueDate) : '';
                const maxScoreText = student.maxScore != null ? `${escapeHtml(student.maxScore)} pts` : '';
                const description = String(student.description || '').trim();

                const renderDetailRow = (label, value) => {
                    if (!value) return '';
                    return `<div class="submitted-detail-row"><span class="submitted-detail-key">${label}</span><span class="submitted-detail-value">${escapeHtml(value)}</span></div>`;
                };

                const activityRows = [
                    renderDetailRow('Title', student.title || 'Untitled'),
                    renderDetailRow('Due Date', dueDateText),
                    maxScoreText ? `<div class="submitted-detail-row"><span class="submitted-detail-key">Max Score</span><span class="submitted-detail-value">${maxScoreText}</span></div>` : ''
                ].filter(Boolean).join('');

                const submissionRows = [
                    renderDetailRow('Submitted At', submittedExactText),
                    renderDetailRow('Submission Status', status),
                    renderDetailRow('Repository Name', repoName),
                    renderDetailRow('Repository Owner', repoOwner),
                    renderDetailRow('Repository Mode', repoMode)
                ].filter(Boolean).join('');

                const activitySection = activityRows
                    ? `
                    <div class="submitted-detail-section">
                        <div class="submitted-detail-title">Activity</div>
                        <div class="submitted-detail-grid">
                            ${activityRows}
                        </div>
                    </div>
                `
                    : '';

                const submissionSection = submissionRows
                    ? `
                    <div class="submitted-detail-section">
                        <div class="submitted-detail-title">Submission</div>
                        <div class="submitted-detail-grid">
                            ${submissionRows}
                        </div>
                    </div>
                `
                    : '';

                const detailsMarkup = `
                    ${activitySection}
                    ${submissionSection}
                    ${description ? `<div class="submitted-detail-section"><div class="submitted-detail-title">Description</div><div class="submitted-detail-note">${escapeHtml(description)}</div></div>` : ''}
                `;

                const repositoryUrlContainer = repositoryUrl
                    ? `
                        <a class="submitted-url-container" href="${escapeHtml(repositoryUrl)}" target="_blank" rel="noopener noreferrer">
                            <div class="submitted-url-main">
                                <div class="submitted-url-label">Repository URL</div>
                                <div class="submitted-url-value">${escapeHtml(repositoryUrl.replace(/^https?:\/\//i, ''))}</div>
                            </div>
                            <span class="submitted-url-arrow"><i class="fas fa-arrow-right"></i></span>
                        </a>
                    `
                    : '';

                return `
                    <div class="submitted-item submitted-item-detailed">
                        <div class="submitted-avatar">${student.profileUrl ? `<img src="${escapeHtml(student.profileUrl)}" alt="${escapeHtml(student.displayName)}">` : escapeHtml(student.initials)}</div>
                        <div class="submitted-content">
                            <div class="submitted-header-row">
                                <div class="submitted-name-wrap">
                                    <div class="submitted-name">${escapeHtml(student.displayName)}</div>
                                    ${student.username ? `<div class="submitted-username">@${escapeHtml(student.username)}</div>` : ''}
                                </div>
                                <div class="submitted-time-chip"><i class="fas fa-check-circle"></i> ${student.submittedAt ? `Submitted ${escapeHtml(timeAgo(student.submittedAt))}` : 'Submission time unavailable'}</div>
                            </div>
                            ${detailsMarkup}
                            ${repositoryUrlContainer ? `<div class="submitted-actions-row">${repositoryUrlContainer}</div>` : ''}
                        </div>
                    </div>
                `;
            }

            function openSubmittedDetailsFromKey(key) {
                const student = submittedDetailByKey[key];
                if (!student) return;

                const activity = activities.find(item => getActivityId(item) === currentSubmittedActivityId);
                const detailTitle = document.getElementById('submittedDetailTitle');
                const detailBody = document.getElementById('submittedDetailBody');
                const unsubmittedModal = document.getElementById('unsubmittedModal');
                const submittedDetailModal = document.getElementById('submittedDetailModal');

                if (!detailTitle || !detailBody || !submittedDetailModal) return;

                detailTitle.innerHTML = `<i class="fas fa-file-circle-check"></i> ${escapeHtml(getActivityTitle(activity))}`;
                detailBody.innerHTML = renderSubmittedDetailCard(student);

                closeModal(unsubmittedModal);
                openModal(submittedDetailModal);
            }

            // ═══════════════════════════════════════════════════════════════════
            // USER PROFILE
            // ═══════════════════════════════════════════════════════════════════

            async function loadUserProfile() {
                try {
                    const data = await apiRequest('/users/profile', { method: 'GET' });
                    currentUser = data;

                    const firstName  = data.firstName || '';
                    const lastName   = data.lastName  || '';
                    const fullName   = `${firstName} ${lastName}`.trim() || 'Professor';
                    const profileUrl = data.profileUrl || '';
                    const initials   = (firstName.charAt(0) + lastName.charAt(0)).toUpperCase() || 'PR';

                    document.getElementById('professorName').textContent = fullName;

                    const avatarEl = document.getElementById('professorAvatar');
                    if (avatarEl) {
                        if (profileUrl) {
                            avatarEl.innerHTML = `<img src="${escapeHtml(profileUrl)}" alt="${escapeHtml(fullName)}">`;
                        } else {
                            avatarEl.textContent = initials;
                        }
                    }

                } catch (error) {
                    console.error('Error loading profile:', error);
                    // Gracefully handle - show defaults
                    const professorNameEl = document.getElementById('professorName');
                    if (professorNameEl) {
                        professorNameEl.textContent = 'Professor';
                    }
                    const avatarEl = document.getElementById('professorAvatar');
                    if (avatarEl) {
                        avatarEl.textContent = 'PR';
                    }
                }
            }

            // ═══════════════════════════════════════════════════════════════════
            // STUDENTS
            // ═══════════════════════════════════════════════════════════════════

            async function loadStudents() {
                if (!classroomId) return;

                const studentsList = document.getElementById('studentsList');
                if (studentsList) {
                    studentsList.innerHTML = `
                        <div class="empty-state">
                            <i class="fas fa-spinner fa-spin"></i>
                            <p>Loading students...</p>
                        </div>
                    `;
                }

                try {
                    const result = await apiRequest(`/classrooms/${encodeURIComponent(classroomId)}/students`, {
                        method: 'GET'
                    });

                    if (Array.isArray(result)) {
                        students = result;
                    } else if (Array.isArray(result?.data)) {
                        students = result.data;
                    } else {
                        students = [];
                    }
                    renderStudents();

                } catch (error) {
                    if (String(error.message || '').includes('405') || String(error.message || '').includes('404')) {
                        students = [];
                        renderStudents();
                        return;
                    }
                    console.error('Error loading students:', error);
                    students = [];
                    renderStudents();
                }
            }

            function renderStudents() {
                const studentsList = document.getElementById('studentsList');
                if (!studentsList) return;

                if (students.length === 0) {
                    studentsList.innerHTML = `
                        <div class="empty-state">
                            <i class="fas fa-users"></i>
                            <p>No students enrolled yet</p>
                        </div>
                    `;
                    return;
                }

                studentsList.innerHTML = students.map(student => {
                    const firstName = String(student.firstName || '').trim();
                    const lastName = String(student.lastName || '').trim();
                    const displayName = `${firstName} ${lastName}`.trim() || 'Student';
                    const profileUrl = String(student.profileUrl || '').trim();
                    const initials = displayName
                        .split(' ')
                        .filter(Boolean)
                        .map(part => part.charAt(0))
                        .join('')
                        .slice(0, 2)
                        .toUpperCase() || 'ST';

                    const lastActiveText = student.lastActiveAt
                        ? `${timeAgo(student.lastActiveAt)}`
                        : 'No recent activity';

                    return `
                        <div class="student-card">
                            <div class="student-avatar">${profileUrl ? `<img src="${escapeHtml(profileUrl)}" alt="${escapeHtml(displayName)}">` : escapeHtml(initials)}</div>
                            <div class="student-info">
                                <div class="student-name">${escapeHtml(displayName)}</div>
                                <div class="student-last-active">
                                    <i class="far fa-clock"></i>
                                    ${escapeHtml(lastActiveText)}
                                </div>
                            </div>
                        </div>
                    `;
                }).join('');
            }

            // ═══════════════════════════════════════════════════════════════════
            // ACTIVITIES
            // ═══════════════════════════════════════════════════════════════════

            async function handleCreateActivity() {
                const title = document.getElementById('activityTitle').value.trim();
                const description = document.getElementById('activityDescription').value.trim();
                const dueDate = document.getElementById('dueDate').value;
                const maxScoreRaw = document.getElementById('maxScore').value;
                const maxScore = maxScoreRaw !== '' ? parseInt(maxScoreRaw) : null;
                const status = document.getElementById('activityStatus').value;

                // Validation — only title and status are required
                if (!title || !status) {
                    showNotification('Title and Status are required', 'error');
                    return;
                }

                if (maxScore !== null && (Number.isNaN(maxScore) || maxScore < 0 || maxScore > 1000)) {
                    showNotification('Max score must be between 0 and 1000', 'error');
                    return;
                }

                if (!classroomId) {
                    showNotification('Classroom ID is missing', 'error');
                    return;
                }

                const btn = document.getElementById('saveActivityBtn');
                btn.disabled = true;
                btn.textContent = 'Creating...';

                try {
                    // Convert date to ISO datetime string only if provided
                    const dueDateTimeString = dueDate ? `${dueDate}T23:59:00` : null;

                    const payload = await apiRequest(`/classrooms/${encodeURIComponent(classroomId)}/activities`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            title,
                            description: description || null,
                            dueDate: dueDateTimeString,
                            maxScore,
                            status
                        })
                    });

                    const createdActivity = payload?.data ?? payload;
                    if (createdActivity && createdActivity.activityId) {
                        activities = [createdActivity, ...activities];
                        renderActivities();
                    }

                    showNotification('Activity created successfully!', 'success');
                    await loadRecentActivities();
                    
                    closeModal(document.getElementById('createActivityModal'));
                    document.getElementById('createActivityForm').reset();

                } catch (error) {
                    console.error('Error creating activity:', error);
                    showNotification(error.message || 'Failed to create activity', 'error');
                } finally {
                    btn.disabled = false;
                    btn.textContent = 'Create Activity';
                }
            }

            async function loadActivities() {
                if (!classroomId) return;

                try {
                    const result = await apiRequest(`/classrooms/${encodeURIComponent(classroomId)}/activities/owner`, {
                        method: 'GET'
                    });

                    const payload = Array.isArray(result?.data) ? result.data : Array.isArray(result) ? result : [];
                    activities = payload;
                    await loadSubmittedActivities();
                    renderActivities();

                } catch (error) {
                    if (String(error.message || '').includes('405') || String(error.message || '').includes('404')) {
                        activities = [];
                        submittedByActivityId = {};
                        renderActivities();
                        return;
                    }
                    if (String(error.message || '').includes('401') || String(error.message || '').includes('Authentication')) {
                        console.log('Authentication error - token may have expired');
                        activities = [];
                        renderActivities();
                        return;
                    }
                    console.error('Error loading activities:', error);
                    showNotification(error.message || 'Failed to load activities', 'error');
                    activities = [];
                    submittedByActivityId = {};
                    renderActivities();
                }
            }

            async function loadSubmittedActivities() {
                if (!classroomId) {
                    submittedByActivityId = {};
                    return;
                }

                try {
                    const result = await apiRequest(`/classrooms/${encodeURIComponent(classroomId)}/activities/submitted`, {
                        method: 'GET'
                    });

                    if (result?.error && !result?.data) {
                        submittedByActivityId = {};
                        console.warn('Submitted endpoint returned error payload:', result.error);
                        showNotification(result.error || 'Failed to load submitted repositories', 'error');
                        return;
                    }

                    const payload = extractSubmittedPayload(result);
                    submittedByActivityId = mapSubmittedByActivity(payload);
                } catch (error) {
                    console.error('Error loading submitted activities:', error);
                    submittedByActivityId = {};
                    showNotification(error?.message || 'Failed to load submitted repositories', 'error');
                }
            }

            function renderActivities() {
                const assignmentsList = document.getElementById('assignmentsList');
                
                if (activities.length === 0) {
                    assignmentsList.innerHTML = `
                        <div class="empty-state">
                            <i class="fas fa-inbox"></i>
                            <p>No activities yet. Create your first one!</p>
                        </div>
                    `;
                    return;
                }

                assignmentsList.innerHTML = activities.map(activity => {
                    const hasDueDate = !!activity.dueDate;
                    const daysLeft = hasDueDate ? getDaysLeft(activity.dueDate) : null;
                    const formattedDueDate = hasDueDate ? formatDate(activity.dueDate) : null;
                    const activityId = getActivityId(activity);
                    const submittedRepoCount = getSubmittedRepositoryCount(activityId);
                    
                    return `
                        <div class="assignment-card" data-submitted-activity-id="${escapeHtml(activityId)}">
                            <div class="assignment-header">
                                <div class="assignment-title">
                                    <i class="fas fa-tasks"></i>
                                    ${escapeHtml(getActivityTitle(activity))}
                                </div>
                                <div class="assignment-actions">
                                    <button class="action-btn" onclick="(async () => await showUnsubmittedStudents('${escapeHtml(activityId)}'))()" title="Needs Repository Submission">
                                        <i class="fas fa-user-clock"></i>
                                    </button>
                                    <button class="action-btn" onclick="(async () => await showSubmittedStudents('${escapeHtml(activityId)}'))()" title="View Submitted Repositories">
                                        <i class="fas fa-check-circle"></i>
                                    </button>
                                    <button class="action-btn" onclick="(async () => await editActivity('${escapeHtml(activityId)}'))()" >
                                        <i class="fas fa-edit"></i>
                                    </button>
                                    <button class="action-btn" onclick="(async () => await deleteActivity('${escapeHtml(activityId)}'))()" >
                                        <i class="fas fa-trash"></i>
                                    </button>
                                </div>
                            </div>
                            ${activity.description ? `<div class="assignment-desc">${escapeHtml(activity.description)}</div>` : ''}
                            <div class="assignment-meta">
                                ${hasDueDate ? `
                                <span>
                                    <i class="fas fa-calendar-alt"></i>
                                    Due: ${formattedDueDate}
                                </span>
                                <span class="days-left ${daysLeft <= 7 ? 'urgent' : 'normal'}">
                                    <i class="fas fa-hourglass-half"></i>
                                    ${daysLeft > 0 ? daysLeft + ' days left' : 'Overdue'}
                                </span>` : `
                                <span>
                                    <i class="fas fa-calendar-alt"></i>
                                    No due date
                                </span>`}
                                ${activity.maxScore != null ? `
                                <span class="points">
                                    <i class="fas fa-star"></i>
                                    ${escapeHtml(activity.maxScore)} points
                                </span>` : ''}
                                <span class="points submitted-count">
                                    <i class="fas fa-check-circle"></i>
                                    ${submittedRepoCount} submitted ${submittedRepoCount === 1 ? 'repository' : 'repositories'}
                                </span>
                            </div>
                        </div>
                    `;
                }).join('');
            }

            function renderSubmittedList(items, options = {}) {
                const unsubmittedList = document.getElementById('unsubmittedList');
                if (!unsubmittedList) return;

                const preserveSearchFocus = options.preserveSearchFocus === true;
                const selectionStart = Number.isInteger(options.selectionStart) ? options.selectionStart : null;
                const selectionEnd = Number.isInteger(options.selectionEnd) ? options.selectionEnd : null;

                const restoreSearchFocus = () => {
                    if (!preserveSearchFocus) return;
                    const nextInput = unsubmittedList.querySelector('#submittedSearchInput');
                    if (!nextInput) return;

                    nextInput.focus();
                    const max = nextInput.value.length;
                    const start = selectionStart == null ? max : Math.max(0, Math.min(selectionStart, max));
                    const end = selectionEnd == null ? start : Math.max(start, Math.min(selectionEnd, max));
                    nextInput.setSelectionRange(start, end);
                };

                if (!Array.isArray(items) || items.length === 0) {
                    unsubmittedList.innerHTML = `
                        <div class="empty-state">
                            <i class="fas fa-inbox"></i>
                            <p>No submitted repositories yet for this activity.</p>
                        </div>
                    `;
                    return;
                }

                const sortedItems = [...items].sort((a, b) => {
                    const aTime = new Date(a?.submittedAt || 0).getTime();
                    const bTime = new Date(b?.submittedAt || 0).getTime();
                    return bTime - aTime;
                });

                const filteredItems = sortedItems.filter(student => {
                    if (!submittedSearchQuery) return true;

                    const name = String(student?.displayName || '').toLowerCase();
                    const username = String(student?.username || '').toLowerCase();
                    const repositoryUrl = String(student?.repositoryUrl || '').toLowerCase();
                    return name.includes(submittedSearchQuery)
                        || username.includes(submittedSearchQuery)
                        || repositoryUrl.includes(submittedSearchQuery);
                });

                if (filteredItems.length === 0) {
                    unsubmittedList.innerHTML = `
                        <div class="submitted-toolbar">
                            <input id="submittedSearchInput" class="submitted-search-input" type="search" placeholder="Search student or repository" value="${escapeHtml(submittedSearchQuery)}" />
                        </div>
                        <div class="empty-state">
                            <i class="fas fa-magnifying-glass"></i>
                            <p>No submissions match your search.</p>
                        </div>
                    `;
                    restoreSearchFocus();
                    return;
                }

                const visibleItems = filteredItems.slice(0, submittedVisibleLimit);
                const hasMore = filteredItems.length > visibleItems.length;
                const showLess = filteredItems.length > submittedVisibleStep && visibleItems.length > submittedVisibleStep;
                submittedDetailByKey = {};

                const submittedItemsMarkup = visibleItems.map((student, index) => {
                    const name = escapeHtml(student.displayName);
                    const username = student.username ? `<div class="submitted-username">@${escapeHtml(student.username)}</div>` : '';
                    const submittedText = student.submittedAt ? `Submitted ${escapeHtml(timeAgo(student.submittedAt))}` : 'Submission time unavailable';
                    const previewKey = String(student.studentActivityId || `${student.userId}-${student.activityId}-${student.submittedAt || ''}-${index}`);
                    submittedDetailByKey[previewKey] = student;

                    return `
                        <div class="submitted-item" data-student-id="${escapeHtml(student.userId)}">
                            <div class="submitted-avatar">${student.profileUrl ? `<img src="${escapeHtml(student.profileUrl)}" alt="${name}">` : escapeHtml(student.initials)}</div>
                            <div class="submitted-content">
                                <div class="submitted-header-row">
                                    <div class="submitted-name-wrap">
                                        <div class="submitted-name">${name}</div>
                                        ${username}
                                    </div>
                                    <div class="submitted-time-chip"><i class="fas fa-check-circle"></i> ${submittedText}</div>
                                </div>
                                <div class="submitted-actions-row">
                                    <button type="button" class="submitted-preview-container" data-submission-key="${escapeHtml(previewKey)}">
                                        <span class="submitted-url-value">Show Details</span>
                                        <span class="submitted-url-arrow"><i class="fas fa-arrow-right"></i></span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    `;
                }).join('');

                unsubmittedList.innerHTML = `
                    <div class="submitted-toolbar">
                        <div class="submitted-toolbar-meta">Showing ${visibleItems.length} of ${filteredItems.length} submissions</div>
                        <input id="submittedSearchInput" class="submitted-search-input" type="search" placeholder="Search student or repository" value="${escapeHtml(submittedSearchQuery)}" />
                    </div>
                    <div class="submitted-list-grid">
                        ${submittedItemsMarkup}
                    </div>
                    <div class="submitted-list-actions">
                        ${hasMore ? '<button type="button" class="btn btn-secondary" id="submittedShowMoreBtn"><i class="fas fa-chevron-down"></i> Show more</button>' : ''}
                        ${showLess ? '<button type="button" class="btn btn-secondary" id="submittedShowLessBtn"><i class="fas fa-chevron-up"></i> Show less</button>' : ''}
                    </div>
                `;

                restoreSearchFocus();
            }

            async function showSubmittedStudents(activityId) {
                if (!classroomId || !activityId) {
                    showNotification('Classroom or activity ID is missing', 'error');
                    return;
                }

                currentSubmittedActivityId = activityId;
                const activity = activities.find(item => getActivityId(item) === activityId);
                const modal = document.getElementById('unsubmittedModal');
                const title = document.getElementById('unsubmittedModalTitle');
                const subtitle = document.getElementById('unsubmittedSubtitle');
                const list = document.getElementById('unsubmittedList');

                if (!modal || !title || !subtitle || !list) return;

                title.innerHTML = `<i class="fas fa-check-circle"></i> ${escapeHtml(getActivityTitle(activity))}`;
                subtitle.textContent = 'Loading submitted repositories...';
                list.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-spinner fa-spin"></i>
                        <p>Loading submitted repositories...</p>
                    </div>
                `;
                openModal(modal);

                await loadSubmittedActivities();
                if (currentSubmittedActivityId !== activityId) return;

                const allEntries = getSubmittedEntries(activityId);
                const submittedRepositories = allEntries;
                const withRepositoryUrlCount = allEntries.filter(item => String(item.repositoryUrl || '').trim().length > 0).length;

                currentSubmittedRepositories = submittedRepositories;
                submittedSearchQuery = '';
                submittedVisibleLimit = submittedVisibleStep;

                subtitle.textContent = `${allEntries.length} submission${allEntries.length === 1 ? '' : 's'} (${withRepositoryUrlCount} with repository URL)`;
                renderSubmittedList(currentSubmittedRepositories);
            }

            function renderUnsubmittedList(items) {
                const unsubmittedList = document.getElementById('unsubmittedList');
                if (!unsubmittedList) return;

                if (!Array.isArray(items) || items.length === 0) {
                    unsubmittedList.innerHTML = `
                        <div class="empty-state">
                            <i class="fas fa-check-circle"></i>
                            <p>No students currently need repository submission.</p>
                        </div>
                    `;
                    return;
                }

                unsubmittedList.innerHTML = items.map(student => {
                    const name = escapeHtml(student.displayName);
                    const username = student.username ? `<div class="unsubmitted-username">@${escapeHtml(student.username)}</div>` : '';

                    return `
                        <div class="unsubmitted-item" data-student-id="${escapeHtml(student.userId)}">
                            <div class="unsubmitted-avatar">${student.profileUrl ? `<img src="${escapeHtml(student.profileUrl)}" alt="${name}">` : escapeHtml(student.initials)}</div>
                            <div class="unsubmitted-info">
                                <div class="unsubmitted-name">${name}</div>
                                ${username}
                            </div>
                            <div class="unsubmitted-state">
                                <i class="fas fa-hourglass-half"></i>
                                Needs repository submission
                            </div>

                        </div>
                    `;
                }).join('');
            }

            async function showUnsubmittedStudents(activityId) {
                if (!classroomId || !activityId) {
                    showNotification('Classroom or activity ID is missing', 'error');
                    return;
                }

                currentUnsubmittedActivityId = activityId;
                currentSubmittedRepositories = [];
                const activity = activities.find(item => getActivityId(item) === activityId);
                const modal = document.getElementById('unsubmittedModal');
                const title = document.getElementById('unsubmittedModalTitle');
                const subtitle = document.getElementById('unsubmittedSubtitle');
                const list = document.getElementById('unsubmittedList');

                if (!modal || !title || !subtitle || !list) return;

                title.textContent = getActivityTitle(activity);
                subtitle.textContent = 'Loading students who need repository submission...';
                list.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-spinner fa-spin"></i>
                        <p>Checking who needs repository submission...</p>
                    </div>
                `;
                openModal(modal);

                try {
                    const result = await apiRequest(`/classrooms/${encodeURIComponent(classroomId)}/activities/unsubmitted`, {
                        method: 'GET'
                    });

                    if (currentUnsubmittedActivityId !== activityId) return;

                    const rawItems = Array.isArray(result?.data) ? result.data : Array.isArray(result) ? result : [];
                    const normalized = rawItems
                        .filter(item => {
                            const hasStudentShape = item && (
                                item.studentId || item.userId || item.firstName || item.lastName || item.fullName || item.username
                            );
                            return !!hasStudentShape;
                        })
                        .map(normalizeUnsubmittedStudent);

                    if (normalized.length === 0 && rawItems.length > 0) {
                        subtitle.textContent = 'This backend currently returns activity-level unsubmitted data, not per-student entries.';
                        list.innerHTML = `
                            <div class="empty-state">
                                <i class="fas fa-circle-info"></i>
                                <p>Per-student repository submission details are unavailable from this endpoint.</p>
                            </div>
                        `;
                        return;
                    }

                    subtitle.textContent = normalized.length > 0
                        ? `${normalized.length} student${normalized.length === 1 ? '' : 's'} need repository submission`
                        : 'No students need repository submission';
                    renderUnsubmittedList(normalized);
                } catch (error) {
                    if (currentUnsubmittedActivityId !== activityId) return;

                    console.error('Error loading unsubmitted repositories:', error);
                    subtitle.textContent = 'Could not load students who need repository submission';
                    list.innerHTML = `
                        <div class="empty-state">
                            <i class="fas fa-triangle-exclamation"></i>
                            <p>${escapeHtml(error.message || 'Failed to load students who need repository submission')}</p>
                        </div>
                    `;
                }

            }

            function editActivity(activityId) {
                const activity = activities.find(a => a.activityId === activityId);
                if (!activity) {
                    showNotification('Activity not found', 'error');
                    return;
                }

                document.getElementById('editActivityId').value = activity.activityId;
                document.getElementById('editActivityTitle').value = activity.title || '';
                document.getElementById('editActivityDescription').value = activity.description || '';
                document.getElementById('editMaxScore').value = activity.maxScore != null ? activity.maxScore : 100;
                document.getElementById('editActivityStatus').value = activity.status || 'DRAFT';

                if (activity.dueDate) {
                    const date = new Date(activity.dueDate);
                    const yyyy = date.getFullYear();
                    const mm = String(date.getMonth() + 1).padStart(2, '0');
                    const dd = String(date.getDate()).padStart(2, '0');
                    document.getElementById('editDueDate').value = `${yyyy}-${mm}-${dd}`;
                } else {
                    document.getElementById('editDueDate').value = '';
                }

                // Restrict status options based on current status transitions
                const statusSelect = document.getElementById('editActivityStatus');
                const currentStatus = activity.status;
                const allowedTransitions = {
                    'DRAFT': ['DRAFT', 'PUBLISHED'],
                    'PUBLISHED': ['PUBLISHED', 'CLOSED'],
                    'CLOSED': ['CLOSED', 'ARCHIVED'],
                    'ARCHIVED': []
                };
                const allowed = allowedTransitions[currentStatus] || [];
                Array.from(statusSelect.options).forEach(option => {
                    option.disabled = !allowed.includes(option.value);
                });

                openModal(document.getElementById('editActivityModal'));
            }

            async function handleEditActivity() {
                const activityId = document.getElementById('editActivityId').value;
                const title = document.getElementById('editActivityTitle').value.trim();
                const description = document.getElementById('editActivityDescription').value.trim();
                const dueDate = document.getElementById('editDueDate').value;
                const maxScoreRaw = document.getElementById('editMaxScore').value;
                const maxScore = maxScoreRaw !== '' ? parseInt(maxScoreRaw) : null;
                const status = document.getElementById('editActivityStatus').value;


                if (!title || !status) {
                    showNotification('Title and Status are required', 'error');
                    return;
                }

                if (maxScore !== null && (Number.isNaN(maxScore) || maxScore < 0 || maxScore > 1000)) {
                    showNotification('Max score must be between 0 and 1000', 'error');
                    return;
                }

                const btn = document.getElementById('saveEditActivityBtn');
                btn.disabled = true;
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';

                try {
                    const dueDateTimeString = dueDate ? `${dueDate}T23:59:00` : null;

                    await apiRequest(`/classrooms/${encodeURIComponent(classroomId)}/activities/${encodeURIComponent(activityId)}`, {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            title,
                            description: description || null,
                            dueDate: dueDateTimeString,
                            maxScore,
                            status
                        })
                    });

                    showNotification('Activity updated successfully!', 'success');
                    closeModal(document.getElementById('editActivityModal'));
                    await loadActivities();
                    await loadRecentActivities();

                } catch (error) {
                    console.error('Error updating activity:', error);
                    showNotification(error.message || 'Failed to update activity', 'error');
                } finally {
                    btn.disabled = false;
                    btn.innerHTML = '<i class="fas fa-save"></i> Save Changes';
                }
            }

            async function deleteActivity(activityId) {
                const confirmed = await window.AppDialog.confirm('Are you sure you want to delete this activity?', {
                    title: 'Delete Activity',
                    confirmText: 'Delete',
                    danger: true
                });

                if (!confirmed) return;

                try {
                    await apiRequest(`/classrooms/${encodeURIComponent(classroomId)}/activities/${encodeURIComponent(activityId)}`, {
                        method: 'DELETE'
                    });

                    showNotification('Activity deleted successfully', 'success');
                    await loadActivities();
                    await loadRecentActivities();

                } catch (error) {
                    console.error('Error deleting activity:', error);
                    showNotification(error.message || 'Failed to delete activity', 'error');
                }
            }

            function filterActivityLog(filter) {
                if (!Array.isArray(activityLog) || activityLog.length === 0) {
                    renderActivityLog([]);
                    return;
                }

                if (filter === 'all') {
                    renderActivityLog(activityLog);
                    return;
                }

                const filtered = activityLog.filter(item => getRecentActivityUi(item.eventType).filter === filter);
                renderActivityLog(filtered);
            }

            window.showUnsubmittedStudents = showUnsubmittedStudents;
            window.showSubmittedStudents = showSubmittedStudents;
            window.editActivity = editActivity;
            window.deleteActivity = deleteActivity;

