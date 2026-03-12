const API_BASE_URL = 'http://localhost:8080/api';
        let classroomId = null;
        let currentUser = null;
        let activities = [];
        let students = [];
        let activityLog = [];

        // ═══════════════════════════════════════════════════════════════════
        // INITIALIZATION
        // ═══════════════════════════════════════════════════════════════════

        document.addEventListener('DOMContentLoaded', () => {
            extractClassroomId();
            loadUserProfile();
            loadStudents();
            loadActivities();
            setupEventListeners();
        });

        // ═══════════════════════════════════════════════════════════════════
        // UTILITY FUNCTIONS
        // ═══════════════════════════════════════════════════════════════════

        function extractClassroomId() {
            const params = new URLSearchParams(window.location.search);
            classroomId = params.get('id');
            if (!classroomId) {
                showNotification('Classroom ID not found in URL', 'error');
                setTimeout(() => window.location.href = 'dashboard.html', 2000);
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
            document.getElementById('createActivityBtn').addEventListener('click', () => {
                document.getElementById('createActivityForm').reset();
                document.getElementById('activityStatus').value = 'PUBLISHED';
                openModal(document.getElementById('createActivityModal'));
            });

            document.getElementById('closeModalBtn').addEventListener('click', () => {
                closeModal(document.getElementById('createActivityModal'));
            });

            document.getElementById('cancelBtn').addEventListener('click', () => {
                closeModal(document.getElementById('createActivityModal'));
            });

            document.getElementById('saveActivityBtn').addEventListener('click', handleCreateActivity);

            document.getElementById('closeEditModalBtn').addEventListener('click', () => {
                closeModal(document.getElementById('editActivityModal'));
            });

            document.getElementById('cancelEditBtn').addEventListener('click', () => {
                closeModal(document.getElementById('editActivityModal'));
            });

            document.getElementById('saveEditActivityBtn').addEventListener('click', handleEditActivity);

            document.getElementById('activityFilter').addEventListener('change', (e) => {
                filterActivityLog(e.target.value);
            });

            document.getElementById('backToDashboardBtn').addEventListener('click', (e) => {
                e.preventDefault();
                // Navigate back to main dashboard
                window.location.href = 'dashboard.html';
            });

            window.addEventListener('click', (e) => {
                const createModal = document.getElementById('createActivityModal');
                const editModal = document.getElementById('editActivityModal');
                if (e.target === createModal) {
                    closeModal(createModal);
                }
                if (e.target === editModal) {
                    closeModal(editModal);
                }
            });
        }

        // ═══════════════════════════════════════════════════════════════════
        // USER PROFILE
        // ═══════════════════════════════════════════════════════════════════

        async function loadUserProfile() {
            try {
                const response = await fetch(`${API_BASE_URL}/users/profile`, {
                    method: 'GET',
                    credentials: 'include'
                });

                if (!response.ok) {
                    if (response.status === 401) {
                        window.location.replace('index.html');
                        return;
                    }
                    throw new Error(`Failed to fetch profile: ${response.status}`);
                }

                const data = await response.json();
                currentUser = data;

                const firstName  = data.firstName || '';
                const lastName   = data.lastName  || '';
                const fullName   = `${firstName} ${lastName}`.trim() || 'Professor';
                const profileUrl = data.profileUrl || '';
                const initials   = (firstName.charAt(0) + lastName.charAt(0)).toUpperCase() || 'IC';

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
                showNotification('Failed to load profile', 'error');
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
                const response = await fetch(
                    `${API_BASE_URL}/classrooms/${classroomId}/students`,
                    {
                        method: 'GET',
                        credentials: 'include'
                    }
                );

                const result = await response.json().catch(() => null);

                if (!response.ok || result?.success === false) {
                    if (response.status === 401) {
                        window.location.replace('index.html');
                        return;
                    }

                    if (response.status === 404 || response.status === 405) {
                        students = [];
                        renderStudents();
                        return;
                    }

                    throw new Error(result?.message || result?.error || 'Failed to load students');
                }

                students = Array.isArray(result?.data) ? result.data : [];
                renderStudents();

            } catch (error) {
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
                const analyticsUrl = `studentclass.html?classroomId=${encodeURIComponent(classroomId)}&studentId=${encodeURIComponent(studentId)}`;

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

                const response = await fetch(
                    `${API_BASE_URL}/classrooms/${classroomId}/activities`,
                    {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        credentials: 'include',
                        body: JSON.stringify({
                            title,
                            description: description || null,
                            dueDate: dueDateTimeString,
                            maxScore,
                            status
                        })
                    }
                );

                const responseText = await response.text();
                let payload = null;
                if (responseText) {
                    try {
                        payload = JSON.parse(responseText);
                    } catch (_) {
                        payload = null;
                    }
                }

                if (!response.ok) {
                    throw new Error(payload?.message || payload?.error || `Server error: ${response.status}`);
                }

                if (payload?.success === false) {
                    throw new Error(payload?.message || 'Failed to create activity');
                }

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
                const response = await fetch(
                    `${API_BASE_URL}/classrooms/${classroomId}/activities`,
                    {
                        method: 'GET',
                        credentials: 'include'
                    }
                );

                const result = await response.json();

                if (!response.ok || result.success === false) {
                    if (response.status === 404 || response.status === 405) {
                        activities = [];
                        renderActivities();
                        return;
                    }
                    throw new Error(result.error || 'Failed to load activities');
                }

                activities = Array.isArray(result.data) ? result.data : [];
                renderActivities();

            } catch (error) {
                console.error('Error loading activities:', error);
                showNotification(error.message || 'Failed to load activities', 'error');
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
                
                return `
                    <div class="assignment-card">
                        <div class="assignment-header">
                            <div class="assignment-title">
                                <i class="fas fa-tasks"></i>
                                ${activity.title}
                            </div>
                            <div class="assignment-actions">
                                <button class="action-btn" onclick="editActivity('${activity.activityId}')">
                                    <i class="fas fa-edit"></i>
                                </button>
                                <button class="action-btn" onclick="deleteActivity('${activity.activityId}')">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </div>
                        </div>
                        ${activity.description ? `<div class="assignment-desc">${activity.description}</div>` : ''}
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
                                ${activity.maxScore} points
                            </span>` : ''}
                        </div>
                    </div>
                `;
            }).join('');
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

                const response = await fetch(
                    `${API_BASE_URL}/classrooms/${classroomId}/activities/${activityId}`,
                    {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        credentials: 'include',
                        body: JSON.stringify({
                            title,
                            description: description || null,
                            dueDate: dueDateTimeString,
                            maxScore,
                            status
                        })
                    }
                );

                const responseText = await response.text();
                let payload = null;
                if (responseText) {
                    try {
                        payload = JSON.parse(responseText);
                    } catch (_) {
                        payload = null;
                    }
                }

                if (!response.ok) {
                    throw new Error(payload?.message || payload?.error || responseText || `Server error: ${response.status}`);
                }

                if (payload?.success === false) {
                    throw new Error(payload?.message || 'Failed to update activity');
                }

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
            if (!confirm('Are you sure you want to delete this activity?')) return;

            try {
                const response = await fetch(
                    `${API_BASE_URL}/classrooms/${classroomId}/activities/${activityId}`,
                    {
                        method: 'DELETE',
                        credentials: 'include'
                    }
                );

                const result = await response.json().catch(() => null);

                if (!response.ok || result?.success === false) {
                    throw new Error(result?.message || result?.error || 'Failed to delete activity');
                }

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