
    const apiRequest = window.ApiClient?.request;
            let classroomId = null;
            let currentUser = null;
            let activities = [];
            let students = [];
            let activityLog = [];
            let currentUnsubmittedActivityId = null;


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
            });

            // ═══════════════════════════════════════════════════════════════════
            // UTILITY FUNCTIONS
            // ═══════════════════════════════════════════════════════════════════

            function extractClassroomId() {
                const params = new URLSearchParams(window.location.search);
                classroomId = params.get('id');
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

                const activityFilter = document.getElementById('activityFilter');
                if (activityFilter) {
                    activityFilter.addEventListener('change', async (e) => {
                        await filterActivityLog(e.target.value);
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
                    if (e.target === createModal) {
                        closeModal(createModal);
                    }
                    if (e.target === editModal) {
                        closeModal(editModal);
                    }
                    if (e.target === unsubmittedModal) {
                        closeModal(unsubmittedModal);
                    }
                });
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

                    const studentId = student.studentUserId || '';
                    const analyticsUrl = `/studentclass/?classroomId=${encodeURIComponent(classroomId)}&studentId=${encodeURIComponent(studentId)}`;

                    return `
                        <a class="student-card-link" href="${analyticsUrl}">
                            <div class="student-card">
                                <div class="student-avatar">${profileUrl ? `<img src="${escapeHtml(profileUrl)}" alt="${escapeHtml(displayName)}">` : escapeHtml(initials)}</div>
                                <div class="student-info">
                                    <div class="student-name">${escapeHtml(displayName)}</div>
                                    <div class="student-last-active">
                                        <i class="far fa-clock"></i>
                                        ${escapeHtml(lastActiveText)}
                                    </div>
                                </div>
                                <div class="student-progress">
                                    <i class="fas fa-chevron-right" aria-hidden="true"></i>
                                </div>
                            </div>
                        </a>
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
                    renderActivities();

                } catch (error) {
                    if (String(error.message || '').includes('405') || String(error.message || '').includes('404')) {
                        activities = [];
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
                    renderActivities();
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
                    
                    return `
                        <div class="assignment-card">
                            <div class="assignment-header">
                                <div class="assignment-title">
                                    <i class="fas fa-tasks"></i>
                                    ${escapeHtml(getActivityTitle(activity))}
                                </div>
                                <div class="assignment-actions">
                                    <button class="action-btn" onclick="(async () => await showUnsubmittedStudents('${escapeHtml(activityId)}'))()" title="Needs Repository Submission">
                                        <i class="fas fa-user-clock"></i>
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
                            </div>
                        </div>
                    `;
                }).join('');
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

                } catch (error) {
                    console.error('Error deleting activity:', error);
                    showNotification(error.message || 'Failed to delete activity', 'error');
                }
            }

            function filterActivityLog(filter) {
                // Implement filtering logic if needed
            }

            window.showUnsubmittedStudents = showUnsubmittedStudents;
            window.editActivity = editActivity;
            window.deleteActivity = deleteActivity;

