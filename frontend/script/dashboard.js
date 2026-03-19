// ══════════════════════════════════════════════════════════════════════════════
// DASHBOARD.JS — Fixed with Professor Dashboard Navigation
// ══════════════════════════════════════════════════════════════════════════════

const apiRequest = window.ApiClient?.request;
const userApi = window.ApiClient?.user;

// ── DOM Elements ────────────────────────────────────────────────────────────
const createClassBtn       = document.getElementById('createClassBtn');
const joinClassBtn         = document.getElementById('joinClassBtn');
const createModal          = document.getElementById('createModal');
const joinModal            = document.getElementById('joinModal');
const profileModal         = document.getElementById('profileModal');
const confirmCreate        = document.getElementById('confirmCreate');
const confirmJoin          = document.getElementById('confirmJoin');
const cancelCreate         = document.getElementById('cancelCreate');
const cancelJoin           = document.getElementById('cancelJoin');
const manageModal          = document.getElementById('manageModal');
const userIcon             = document.getElementById('userIcon');
const profileDropdown      = document.getElementById('profileDropdown');
const viewProfileBtn       = document.getElementById('viewProfileBtn');
const logoutBtn            = document.getElementById('logoutBtn');
const closeProfileModal    = document.getElementById('closeProfileModal');
const cancelProfileModal   = document.getElementById('cancelProfileModal');
const uploadPictureBtn     = document.getElementById('uploadPictureBtn');
const removePictureBtn     = document.getElementById('removePictureBtn');
const profilePictureInput  = document.getElementById('profilePictureInput');
const saveProfileBtn       = document.getElementById('saveProfileBtn');

// Form inputs — Create Class
const classNameInput       = document.getElementById('classNameInput');
const classDescInput       = document.getElementById('classDescInput');
const maxStudentsInput     = document.getElementById('maxStudentsInput');
const passcodeToggle       = document.getElementById('passcodeToggle');
const passcodeSection      = document.getElementById('passcodeSection');
const passcodeInput        = document.getElementById('passcodeInput');
const requireApprovalInput = document.getElementById('requireApprovalInput');

// Form inputs — Join Class
const classCodeInput       = document.getElementById('classCodeInput');
const joinPasscodeToggle   = document.getElementById('joinPasscodeToggle');
const joinPasscodeSection  = document.getElementById('joinPasscodeSection');
const joinPasscodeInput    = document.getElementById('joinPasscodeInput');

// Tab state
let currentTab = 'created';
let classroomsData = { created: [], joined: [] };

// Manage modal state
let currentManageClassId = null;
let currentManageClassroomStatus = 'ACTIVE';

// Current user
let currentUser = null;

// ══════════════════════════════════════════════════════════════════════════════
// INITIALIZATION
// ══════════════════════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
    if (!apiRequest || !userApi) {
        showNotification('API client is not initialized.', 'error');
        return;
    }

    loadUserProfile();
    loadClasses();
    setupEventListeners();
});

// ══════════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ══════════════════════════════════════════════════════════════════════════════

function unwrap(val) {
    if (!val) return '';
    if (typeof val === 'string') return val;
    if (typeof val === 'object') {
        return val.value ?? val.number ?? val.date ?? val.name ?? '';
    }
    return String(val);
}

function resolveClassroomId(classroom) {
    if (!classroom || typeof classroom !== 'object') return '';

    const looksLikeClassroomId = (value) => /^cl-/i.test(value);
    const looksLikeUserId = (value) => /^usr-/i.test(value) || /^@t-/i.test(value);
    const normalize = (candidate, requireClassPrefix = true) => {
        const value = String(unwrap(candidate) || '').trim();
        if (!value || value === '[object Object]') return '';
        if (looksLikeUserId(value)) return '';
        if (requireClassPrefix && !looksLikeClassroomId(value)) return '';
        return value;
    };

    // Match backend contract from GetClassroomsProfessorData exactly.
    const topCandidates = [
        classroom.classroomId,
        classroom.classroomID,
        classroom.classId,
        classroom.classroomUid,
        classroom.classroomUUID,
        classroom.classroomUuid
    ];

    for (const candidate of topCandidates) {
        const value = normalize(candidate, true);
        if (value) return value;
    }

    // Some APIs wrap classroom payloads inside `classroom`.
    if (classroom.classroom && typeof classroom.classroom === 'object') {
        const nestedId = resolveClassroomId(classroom.classroom);
        if (nestedId) return nestedId;
    }

    // Fallback fields in case backend sends canonical ID as generic `id`.
    const fallbackCandidates = [classroom.id, classroom._id, classroom.uuid];
    for (const candidate of fallbackCandidates) {
        const value = normalize(candidate, true);
        if (value) return value;
    }

    return '';
}

function capitalise(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

function resolveClassroomStatus(classroom) {
    if (!classroom || typeof classroom !== 'object') return '';

    const candidates = [
        classroom.status,
        classroom.classroomStatus,
        classroom.classStatus,
        classroom.state,
        classroom.settings?.status,
        classroom.settings?.classroomStatus,
        classroom.classroomSettings?.status,
        classroom.classroomSettings?.classroomStatus
    ];

    for (const candidate of candidates) {
        const value = String(unwrap(candidate) || '').trim().toUpperCase();
        if (value) return value;
    }

    const nestedContainers = [
        classroom.classroom,
        classroom.data,
        classroom.classroomData,
        classroom.settings,
        classroom.classroomSettings
    ];

    for (const nested of nestedContainers) {
        if (nested && typeof nested === 'object') {
            const nestedStatus = resolveClassroomStatus(nested);
            if (nestedStatus) return nestedStatus;
        }
    }

    return '';
}

function normalizeClassroomPayload(item) {
    const source = item && typeof item === 'object' ? item : {};
    const classroom = source.classroom && typeof source.classroom === 'object'
        ? source.classroom
        : source.classroomData && typeof source.classroomData === 'object'
            ? source.classroomData
            : source;

    const normalized = {
        ...source,
        ...classroom
    };

    const resolvedStatus = resolveClassroomStatus(source) || resolveClassroomStatus(classroom);
    if (resolvedStatus) {
        normalized.status = resolvedStatus;
        normalized.classroomStatus = resolvedStatus;
    }

    return normalized;
}

function updateCurrentStatusBadge(status) {
    const badge = document.getElementById('manageCurrentStatusBadge');
    if (!badge) return;

    const normalized = String(status || 'UNKNOWN').toUpperCase();
    badge.textContent = normalized;
    badge.classList.remove('active', 'closed', 'archived');

    if (normalized === 'ACTIVE') badge.classList.add('active');
    if (normalized === 'CLOSED') badge.classList.add('closed');
    if (normalized === 'ARCHIVED') badge.classList.add('archived');
}

function updateCloseStatusWarning(status) {
    const warning = document.getElementById('manageCloseStatusWarning');
    if (!warning) return;

    const normalized = String(status || '').toUpperCase();
    warning.classList.toggle('show', normalized !== 'CLOSED');
}

function syncCloseStatusAction(status) {
    const normalized = String(status || '').toUpperCase();
    const button = document.getElementById('updateStatusBtn');
    if (!button) return;

    if (normalized === 'CLOSED' || normalized === 'ARCHIVED') {
        button.disabled = true;
        button.innerHTML = '<i class="fas fa-lock"></i> Classroom Closed';
    } else {
        button.disabled = false;
        button.innerHTML = '<i class="fas fa-lock"></i> Close Classroom';
    }
}

function getInitials(name) {
    return name.split(' ').map(w => w[0]).join('').toUpperCase().substring(0, 2);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showNotification(message, type = 'info') {
    document.querySelector('.notification')?.remove();

    const colors = { success: '#10b981', error: '#ef4444', info: '#3b82f6', warning: '#f59e0b' };
    const n = document.createElement('div');
    n.className = `notification notification-${type}`;
    n.textContent = message;
    n.style.cssText = `
        position:fixed;top:20px;right:20px;padding:15px 20px;border-radius:8px;
        color:#fff;font-weight:500;z-index:10000;animation:slideIn .3s ease-out;
        box-shadow:0 4px 12px rgba(0,0,0,.15);max-width:400px;
        background-color:${colors[type] || colors.info};
    `;
    document.body.appendChild(n);
    setTimeout(() => {
        n.style.animation = 'slideOut .3s ease-in';
        setTimeout(() => n.remove(), 300);
    }, 3000);
}

// ══════════════════════════════════════════════════════════════════════════════
// MODAL HELPERS
// ══════════════════════════════════════════════════════════════════════════════

function openModal(modal) {
    if (modal) modal.style.display = 'flex';
}

function closeModal(modal) {
    if (!modal) return;
    modal.style.display = 'none';
    
    if (modal === createModal) {
        classNameInput.value       = '';
        classDescInput.value       = '';
        maxStudentsInput.value     = '50';
        passcodeToggle.checked     = false;
        passcodeSection.style.display = 'none';
        passcodeInput.value        = '';
        passcodeInput.required     = false;
        requireApprovalInput.checked = false;
    } else if (modal === joinModal) {
        classCodeInput.value = '';
        if (joinPasscodeSection) joinPasscodeSection.style.display = 'none';
        if (joinPasscodeInput) joinPasscodeInput.value = '';
        if (joinPasscodeToggle) joinPasscodeToggle.checked = false;
    } else if (modal === manageModal) {
        const box   = document.getElementById('deleteConfirmBox');
        const input = document.getElementById('deleteConfirmInput');
        if (box)   box.classList.remove('visible');
        if (input) { input.value = ''; input.classList.remove('match'); }
        document.getElementById('confirmDeleteBtn')?.setAttribute('disabled', 'true');
    }
}

function closeProfileDropdown() {
    if (profileDropdown) {
        profileDropdown.classList.remove('show');
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// EVENT LISTENERS SETUP
// ══════════════════════════════════════════════════════════════════════════════

function setupEventListeners() {
    // Modal triggers
    createClassBtn?.addEventListener('click', () => openModal(createModal));
    joinClassBtn?.addEventListener('click', () => openModal(joinModal));
    cancelCreate?.addEventListener('click', () => closeModal(createModal));
    cancelJoin?.addEventListener('click', () => closeModal(joinModal));

    // Form submissions
    confirmCreate?.addEventListener('click', handleCreateClass);
    confirmJoin?.addEventListener('click', handleJoinClass);
    saveProfileBtn?.addEventListener('click', handleSaveProfile);

    // Profile menu
    userIcon?.addEventListener('click', toggleProfileDropdown);
    viewProfileBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        closeProfileDropdown();
        openProfileModal();
    });
    logoutBtn?.addEventListener('click', handleLogout);

    // Profile modal
    closeProfileModal?.addEventListener('click', () => closeModal(profileModal));
    cancelProfileModal?.addEventListener('click', () => closeModal(profileModal));
    uploadPictureBtn?.addEventListener('click', () => profilePictureInput?.click());
    document.getElementById('profilePictureOverlay')?.addEventListener('click', () => profilePictureInput?.click());
    profilePictureInput?.addEventListener('change', handleProfilePictureUpload);
    removePictureBtn?.addEventListener('click', handleRemoveProfilePicture);

    // Create class passcode toggle
    passcodeToggle?.addEventListener('change', (e) => {
        if (e.target.checked) {
            passcodeSection.style.display = 'block';
            passcodeInput.required = true;
        } else {
            passcodeSection.style.display = 'none';
            passcodeInput.required = false;
            passcodeInput.value = '';
        }
    });

    // Join class passcode toggle
    joinPasscodeToggle?.addEventListener('change', (e) => {
        if (e.target.checked) {
            if (joinPasscodeSection) joinPasscodeSection.style.display = 'block';
            if (joinPasscodeInput) joinPasscodeInput.required = true;
        } else {
            if (joinPasscodeSection) joinPasscodeSection.style.display = 'none';
            if (joinPasscodeInput) {
                joinPasscodeInput.required = false;
                joinPasscodeInput.value = '';
            }
        }
    });

    // Manage modal
    document.getElementById('closeManageModal')?.addEventListener('click', () => closeModal(manageModal));
    document.getElementById('cancelManage')?.addEventListener('click',      () => closeModal(manageModal));
    document.getElementById('saveManageBtn')?.addEventListener('click',     handleUpdateClassroom);
    document.getElementById('updateStatusBtn')?.addEventListener('click',    handleUpdateStatus);
    // Delete — show typed-confirmation box
    document.getElementById('deleteClassBtn')?.addEventListener('click', () => {
        const box = document.getElementById('deleteConfirmBox');
        const input = document.getElementById('deleteConfirmInput');
        const target = document.getElementById('deleteConfirmTarget');
        const classroom = classroomsData.created.find(c => String(resolveClassroomId(c)) === String(currentManageClassId));
        if (target) target.textContent = classroom?.className || classroom?.name || 'the classroom name';
        if (input)  input.value = '';
        document.getElementById('confirmDeleteBtn')?.setAttribute('disabled', 'true');
        if (box) box.classList.add('visible');
        setTimeout(() => input?.focus(), 50);
    });

    document.getElementById('cancelDeleteBtn')?.addEventListener('click', () => {
        const box = document.getElementById('deleteConfirmBox');
        const input = document.getElementById('deleteConfirmInput');
        if (box)   box.classList.remove('visible');
        if (input) input.value = '';
        document.getElementById('confirmDeleteBtn')?.setAttribute('disabled', 'true');
    });

    document.getElementById('deleteConfirmInput')?.addEventListener('input', (e) => {
        const classroom = classroomsData.created.find(c => String(resolveClassroomId(c)) === String(currentManageClassId));
        const expected  = classroom?.className || classroom?.name || '';
        const matches   = e.target.value === expected;
        const btn = document.getElementById('confirmDeleteBtn');
        e.target.classList.toggle('match', matches);
        if (btn) matches ? btn.removeAttribute('disabled') : btn.setAttribute('disabled', 'true');
    });

    document.getElementById('confirmDeleteBtn')?.addEventListener('click', handleDeleteClassroom);

    // Tab switching
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('tab-button')) {
            switchTab(e.target.dataset.tab);
        }
    });

    // Modal close on background click
    window.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal') && e.target.style.display === 'flex') {
            closeModal(e.target);
        }
    });

    // Profile dropdown close on outside click
    document.addEventListener('click', (e) => {
        const isUserIconClick = userIcon && userIcon.contains(e.target);
        const isDropdownClick = profileDropdown && profileDropdown.contains(e.target);
        
        if (!isUserIconClick && !isDropdownClick) {
            closeProfileDropdown();
        }
    });
}

// ══════════════════════════════════════════════════════════════════════════════
// PROFILE MANAGEMENT
// ══════════════════════════════════════════════════════════════════════════════

async function loadUserProfile() {
    try {
        if (!apiRequest || !userApi) {
            throw new Error('API client is not initialized.');
        }

        const [profileData, authData] = await Promise.all([
            userApi.getProfile(),
            apiRequest('/auth/check', { method: 'GET' }, { redirectOnUnauthorized: false }).catch(() => ({}))
        ]);

        const data = { ...(profileData || {}), email: authData?.email || '' };

        currentUser = data;
        applyProfileToUI(data);

    } catch (error) {
        console.error('Error loading profile:', error);
        showNotification('Failed to load profile', 'error');
    }
}

function applyProfileToUI(data) {
    const firstName  = data.firstName || '';
    const lastName   = data.lastName  || '';
    const fullName   = `${firstName} ${lastName}`.trim() || 'User';
    const profileUrl = data.profileUrl || '';
    const email      = data.email || '';

    // Header
    const userNameEl = document.getElementById('userName');
    if (userNameEl) userNameEl.textContent = fullName;
    
    // Dropdown
    const fullNameEl = document.getElementById('fullName');
    if (fullNameEl) fullNameEl.textContent = fullName;
    
    const usernameEl = document.getElementById('username');
    if (usernameEl) usernameEl.textContent = email;

    // Avatar
    const iconEl = document.getElementById('userIcon');
    if (iconEl) {
        if (profileUrl) {
            iconEl.innerHTML = `<img src="${escapeHtml(profileUrl)}" alt="${escapeHtml(fullName)}">`;
        } else {
            iconEl.textContent = getInitials(fullName);
        }
    }
}

function toggleProfileDropdown(e) {
    e.stopPropagation();
    if (profileDropdown) {
        profileDropdown.classList.toggle('show');
    }
}

async function openProfileModal() {
    try {
        if (!userApi) {
            throw new Error('API client is not initialized.');
        }

        const data = await userApi.getProfile();

        // Populate picture (left side)
        populateProfilePicture(data);

        // Populate form fields (right side)
        const firstNameEl = document.getElementById('editFirstNameInput');
        const lastNameEl  = document.getElementById('editLastNameInput');
        const phoneEl     = document.getElementById('editPhoneInput');
        const genderEl    = document.getElementById('editGenderInput');
        const birthdayEl  = document.getElementById('editBirthdayInput');
        const bioEl       = document.getElementById('editBioInput');

        if (firstNameEl) firstNameEl.value = data.firstName || '';
        if (lastNameEl)  lastNameEl.value  = data.lastName || '';
        if (phoneEl)     phoneEl.value     = unwrap(data.phoneNumber) || '';
        if (genderEl)    genderEl.value    = unwrap(data.gender) || '';
        if (birthdayEl)  birthdayEl.value  = unwrap(data.birthday) || '';
        if (bioEl)       bioEl.value       = data.bio || '';

        openModal(profileModal);

    } catch (error) {
        console.error('Error opening profile:', error);
        showNotification('Failed to load profile data', 'error');
    }
}

function populateProfilePicture(data) {
    const firstName  = data.firstName || '';
    const lastName   = data.lastName  || '';
    const fullName   = `${firstName} ${lastName}`.trim() || 'User';
    const profileUrl = data.profileUrl || '';

    const picEl = document.getElementById('profilePictureLarge');
    if (picEl) {
        if (profileUrl) {
            picEl.innerHTML = `<img src="${escapeHtml(profileUrl)}" alt="${escapeHtml(fullName)}">`;
            picEl.style.background = 'none';
        } else {
            picEl.innerHTML = `<span id="profileInitialsLarge">${getInitials(fullName)}</span>`;
            picEl.style.background = 'linear-gradient(135deg, #1f6feb 0%, #238636 100%)';
        }
    }

    const removeBtnEl = document.getElementById('removePictureBtn');
    if (removeBtnEl) {
        removeBtnEl.style.display = profileUrl ? 'flex' : 'none';
    }
}

async function handleSaveProfile() {
    const firstNameEl = document.getElementById('editFirstNameInput');
    const lastNameEl  = document.getElementById('editLastNameInput');
    const phoneEl     = document.getElementById('editPhoneInput');
    const genderEl    = document.getElementById('editGenderInput');
    const birthdayEl  = document.getElementById('editBirthdayInput');
    const bioEl       = document.getElementById('editBioInput');

    const firstName   = firstNameEl?.value.trim() || '';
    const lastName    = lastNameEl?.value.trim() || '';
    const phoneNumber = phoneEl?.value.trim() || '';
    const gender      = genderEl?.value.trim() || '';
    const birthday    = birthdayEl?.value || '';
    const bio         = bioEl?.value || '';

    if (!firstName || !lastName || !phoneNumber || !gender || !birthday) {
        showNotification('Please fill all required fields', 'error');
        return;
    }

    if (saveProfileBtn) {
        saveProfileBtn.disabled    = true;
        saveProfileBtn.innerHTML   = '<i class="fas fa-spinner fa-spin"></i> Saving...';
    }

    try {
        if (!userApi) {
            throw new Error('API client is not initialized.');
        }

        await userApi.updateProfile({ firstName, lastName, phoneNumber, gender, birthday, bio });

        showNotification('Profile updated successfully!', 'success');
        closeModal(profileModal);
        await loadUserProfile();

    } catch (error) {
        console.error(error);
        showNotification(error.message || 'Update failed', 'error');
    } finally {
        if (saveProfileBtn) {
            saveProfileBtn.disabled    = false;
            saveProfileBtn.innerHTML   = '<i class="fas fa-check"></i> Save Changes';
        }
    }
}

function handleLogout() {
    if (confirm('Are you sure you want to log out?')) {
        if (!apiRequest) {
            window.location.href = 'index.html';
            return;
        }

        apiRequest('/auth/logout', { method: 'POST' }, { redirectOnUnauthorized: false }).finally(() => {
            localStorage.clear();
            sessionStorage.clear();
            window.location.href = 'index.html';
        });
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// PROFILE PICTURE UPLOAD / REMOVE
// ══════════════════════════════════════════════════════════════════════════════

async function handleProfilePictureUpload() {
    const file = profilePictureInput?.files?.[0];
    if (!file) return;

    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
        showNotification('File is too large. Maximum size is 5MB.', 'error');
        profilePictureInput.value = '';
        return;
    }

    const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!validTypes.includes(file.type)) {
        showNotification('Invalid file type. Use JPEG, PNG, GIF or WebP.', 'error');
        profilePictureInput.value = '';
        return;
    }

    if (uploadPictureBtn) {
        uploadPictureBtn.disabled = true;
        uploadPictureBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';
    }

    try {
        if (!userApi) {
            throw new Error('API client is not initialized.');
        }

        await userApi.updateProfilePicture(file);

        showNotification('Profile picture updated!', 'success');

        // Refresh both the modal and the header avatar
        await loadUserProfile();
        if (currentUser) populateProfilePicture(currentUser);

    } catch (error) {
        console.error('Error uploading profile picture:', error);
        showNotification('Failed to upload profile picture', 'error');
    } finally {
        if (uploadPictureBtn) {
            uploadPictureBtn.disabled = false;
            uploadPictureBtn.innerHTML = '<i class="fas fa-upload"></i> Upload Photo';
        }
        if (profilePictureInput) profilePictureInput.value = '';
    }
}

async function handleRemoveProfilePicture() {
    if (!confirm('Remove your profile picture?')) return;

    if (removePictureBtn) {
        removePictureBtn.disabled = true;
        removePictureBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Removing...';
    }

    try {
        if (!userApi) {
            throw new Error('API client is not initialized.');
        }

        await userApi.removeProfilePicture();

        showNotification('Profile picture removed!', 'success');

        await loadUserProfile();
        if (currentUser) populateProfilePicture(currentUser);

    } catch (error) {
        console.error('Error removing profile picture:', error);
        showNotification('Failed to remove profile picture', 'error');
    } finally {
        if (removePictureBtn) {
            removePictureBtn.disabled = false;
            removePictureBtn.innerHTML = '<i class="fas fa-trash-alt"></i> Remove';
        }
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// CLASSROOM MANAGEMENT
// ══════════════════════════════════════════════════════════════════════════════

async function handleCreateClass() {
    const name            = classNameInput?.value.trim() || '';
    const description     = classDescInput?.value.trim() || '';
    const maxStudents     = parseInt(maxStudentsInput?.value || '50');
    const requireApproval = requireApprovalInput?.checked || false;
    const passcode        = passcodeToggle?.checked ? passcodeInput?.value.trim() : null;

    // Validation
    if (!name) {
        return showNotification('Please enter a class name', 'error');
    }
    if (name.length < 3 || name.length > 100) {
        return showNotification('Class name must be 3–100 characters', 'error');
    }
    if (description && description.length > 500) {
        return showNotification('Description cannot exceed 500 characters', 'error');
    }
    if (!maxStudents || maxStudents < 1 || maxStudents > 100) {
        return showNotification('Max students must be 1–100', 'error');
    }
    if (passcode && passcode.length < 4) {
        return showNotification('Passcode must be at least 4 characters', 'error');
    }

    if (confirmCreate) {
        confirmCreate.disabled    = true;
        confirmCreate.textContent = 'Creating...';
    }

    try {
        await apiRequest('/classrooms/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name,
                description: description || null,
                maxStudents,
                requireApproval,
                passcode: passcode || null
            })
        });

        showNotification('Classroom created successfully!', 'success');
        closeModal(createModal);
        await loadClasses();

    } catch (error) {
        console.error('Error creating classroom:', error);
        showNotification(error.message || 'Failed to create classroom. Please try again.', 'error');
    } finally {
        if (confirmCreate) {
            confirmCreate.disabled    = false;
            confirmCreate.textContent = 'Create Class';
        }
    }
}

async function handleJoinClass() {
    const code = classCodeInput?.value.trim() || '';
    const passcode = joinPasscodeToggle?.checked ? joinPasscodeInput?.value.trim() : undefined;

    if (!code) {
        return showNotification('Please enter a class code', 'error');
    }

    if (confirmJoin) {
        confirmJoin.disabled    = true;
        confirmJoin.textContent = 'Joining...';
    }

    try {
        const payload = { code };
        if (passcode) {
            payload.passcode = passcode;
        }

        await apiRequest('/classrooms/join', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        showNotification('Successfully joined classroom!', 'success');
        closeModal(joinModal);
        await loadClasses();

    } catch (error) {
        console.error('Error joining classroom:', error);
        showNotification(error.message || 'Failed to join classroom. Please try again.', 'error');
    } finally {
        if (confirmJoin) {
            confirmJoin.disabled    = false;
            confirmJoin.textContent = 'Join Class';
        }
    }
}

async function loadClasses() {
    const container = document.getElementById('classroomGrid');
    if (!container) return;

    container.innerHTML = '<p class="loading-message">Loading your classes...</p>';
 
    let createdClasses = [];
    let joinedClasses = [];

    // Created and joined are loaded independently so one failing endpoint
    // does not wipe the other tab.
    try {
        const createdResult = await apiRequest('/classrooms/me', { method: 'GET' });
        const createdRaw = Array.isArray(createdResult) ? createdResult : createdResult?.data || [];
        createdClasses = Array.isArray(createdRaw)
            ? createdRaw.map(item => normalizeClassroomPayload(item))
            : [];
    } catch (error) {
        console.warn('Failed to load created classrooms:', error);
    }

    try {
        const joinedData = await apiRequest('/classrooms/join', { method: 'GET' }, { redirectOnUnauthorized: false });
        const joinedRaw = Array.isArray(joinedData) ? joinedData : joinedData?.data || [];
        joinedClasses = Array.isArray(joinedRaw)
            ? joinedRaw.map(item => ({
                ...normalizeClassroomPayload(item),
                studentCount:
                    item?.studentCount ??
                    item?.classroom?.studentCount ??
                    item?.classroomData?.studentCount ??
                    0
            }))
            : [];
    } catch (error) {
        console.warn('Failed to load joined classrooms:', error);
    }

    classroomsData.created = createdClasses;
    classroomsData.joined  = joinedClasses;

    updateTabCounts();
    renderClasses();
}

function switchTab(tab) {
    if (!tab) return;
    currentTab = tab;
    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    renderClasses();
}

function updateTabCounts() {
    const createdTab = document.querySelector('[data-tab="created"]');
    const joinedTab  = document.querySelector('[data-tab="joined"]');
    if (createdTab) createdTab.innerHTML = `My Classes <span class="tab-count">${classroomsData.created.length}</span>`;
    if (joinedTab)  joinedTab.innerHTML  = `Joined Classes <span class="tab-count">${classroomsData.joined.length}</span>`;
}

function renderClasses() {
    const container = document.getElementById('classroomGrid');
    if (!container) return;

    const classes   = classroomsData[currentTab] || [];
    const isCreated = currentTab === 'created';

    if (classes.length === 0) {
        const msg = isCreated
            ? 'No classes created yet. Create your first class to get started!'
            : "You haven't joined any classes yet.";
        container.innerHTML = `<p class="empty-message">${msg}</p>`;
        return;
    }

    container.innerHTML = classes.map(c => createClassCard(c, isCreated)).join('');
    attachClassCardHandlers();
}

function createClassCard(classroom, isCreated) {
    const studentCount    = classroom.studentCount  || classroom.students?.length || classroom.enrolledCount || classroom.memberCount || 0;
    const maxStudents     = classroom.maxStudents   || classroom.capacity || 50;
    const classCode       = classroom.classCode     || classroom.code || classroom.inviteCode || classroom.id || 'N/A';
    const description     = classroom.description   || classroom.desc || 'No description provided';
    const hasPasscode     = !!(classroom.hasPasscode || classroom.requiresPasscode || classroom.passcode || classroom.isPasswordProtected);
    const requireApproval = !!(classroom.requireApproval || classroom.requiresApproval || classroom.needsApproval || classroom.manualApproval);
    const classId         = resolveClassroomId(classroom) || 'unknown';
    const className       = classroom.className || classroom.name || classroom.title || 'Unnamed Class';

    return `
        <div class="class-card" data-class-id="${escapeHtml(classId)}">
            <div class="class-card-header">
                <h4 class="class-name">${escapeHtml(className)}</h4>
                ${isCreated
                    ? '<span class="badge badge-owner">Owner</span>'
                    : '<span class="badge badge-member">Member</span>'}
            </div>
            <p class="class-description">${escapeHtml(description)}</p>
            <div class="class-info">
                <div class="info-item">
                    <i class="fas fa-users"></i>
                    <span>${studentCount} / ${maxStudents} students</span>
                </div>
                <div class="info-item">
                    <i class="fas fa-code"></i>
                    <span>Code: <strong>${escapeHtml(String(classCode))}</strong></span>
                </div>
            </div>
            ${hasPasscode || requireApproval ? `
                <div class="class-settings">
                    ${hasPasscode     ? '<span class="setting-badge"><i class="fas fa-lock"></i> Passcode</span>'        : ''}
                    ${requireApproval ? '<span class="setting-badge"><i class="fas fa-user-check"></i> Approval</span>' : ''}
                </div>` : ''}
            <div class="class-actions">
                <button class="btn btn-primary view-class" data-class-id="${escapeHtml(classId)}" data-role="${isCreated ? 'prof' : 'student'}">${isCreated ? 'View Class' : 'Go to Class'}</button>
                ${isCreated ? `<button class="btn btn-secondary manage-class" data-class-id="${escapeHtml(classId)}">Manage</button>` : ''}
            </div>
        </div>
    `;
}

function attachClassCardHandlers() {
    document.querySelectorAll('.view-class').forEach(btn => {
        btn.addEventListener('click', e => {
            const classId = e.currentTarget.dataset.classId;
            const role    = e.currentTarget.dataset.role;
            if (classId) viewClassroom(classId, role);
        });
    });
    document.querySelectorAll('.manage-class').forEach(btn => {
        btn.addEventListener('click', e => {
            const classId = e.currentTarget.dataset.classId;
            if (classId) manageClassroom(classId);
        });
    });
}

// ══════════════════════════════════════════════════════════════════════════════
// FIXED NAVIGATION TO PROFESSOR DASHBOARD
// ══════════════════════════════════════════════════════════════════════════════

function viewClassroom(classId, role) {
    if (classId && classId !== 'unknown') {
        const page = role === 'student' ? 'studentclass.html' : 'profclass.html';
        window.location.href = `${page}?id=${encodeURIComponent(classId)}`;
    } else {
        showNotification('Invalid classroom ID', 'error');
    }
}

function manageClassroom(classId) {
    if (classId && classId !== 'unknown') {
        openManageModal(classId);
    } else {
        showNotification('Invalid classroom ID', 'error');
    }
}

async function openManageModal(classId) {
    currentManageClassId = classId;
    currentManageClassroomStatus = 'ACTIVE';
    updateCurrentStatusBadge('UNKNOWN');
    updateCloseStatusWarning('UNKNOWN');
    syncCloseStatusAction('UNKNOWN');

    const classroom = classroomsData.created.find(c => {
        const id = resolveClassroomId(c);
        return String(id) === String(classId);
    });

    const classNameEl = document.getElementById('manageClassName');
    if (classNameEl) classNameEl.textContent = classroom?.className || classroom?.name || 'Classroom';

    // Pre-populate form
    const nameEl    = document.getElementById('manageNameInput');
    const descEl    = document.getElementById('manageDescInput');
    const maxEl     = document.getElementById('manageMaxInput');

    if (classroom) {
        if (nameEl)  nameEl.value  = classroom.className   || classroom.name || '';
        if (descEl)  descEl.value  = classroom.description || '';
        if (maxEl)   maxEl.value   = classroom.maxStudents  || 50;
    }

    if (classroom) {
        const classroomStatus = resolveClassroomStatus(classroom) || 'ACTIVE';
        currentManageClassroomStatus = classroomStatus;

        updateCurrentStatusBadge(classroomStatus);
        updateCloseStatusWarning(classroomStatus);
        syncCloseStatusAction(classroomStatus);
    }

    // Reset stats to loading state
    ['statTotalStudents', 'statTotalActivities', 'statActiveActivities'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = '<i class="fas fa-spinner fa-spin" style="font-size:11px;color:#484f58"></i>';
    });

    openModal(manageModal);
    await fetchClassroomStats(classId);
}

async function fetchClassroomStats(classId) {
    try {
        if (!classId || classId === 'unknown') {
            throw new Error('Missing classroom ID for stats request');
        }
        if (!/^cl-/i.test(classId)) {
            throw new Error(`Invalid classroom ID received: ${classId}`);
        }

        const encodedClassId = encodeURIComponent(classId);
        const statsUrl = `/classrooms/${encodedClassId}/stats`;
        console.debug('[stats] request', { classroomId: classId, url: statsUrl });

        const data = await apiRequest(statsUrl, { method: 'GET' });
        const stats = data?.data ?? data;

        const studentsEl   = document.getElementById('statTotalStudents');
        const activitiesEl = document.getElementById('statTotalActivities');
        const activeEl     = document.getElementById('statActiveActivities');

        if (studentsEl)   studentsEl.textContent   = stats?.totalStudents         ?? '0';
        if (activitiesEl) activitiesEl.textContent = stats?.totalActivities       ?? '0';
        if (activeEl)     activeEl.textContent     = stats?.totalActiveActivities ?? stats?.activeActivities ?? '0';

    } catch (error) {
        console.error('Error fetching classroom stats:', error);
        showNotification(error.message || 'Failed to load classroom stats', 'error');
        ['statTotalStudents', 'statTotalActivities', 'statActiveActivities'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = '—';
        });
    }
}

async function handleUpdateClassroom() {
    const name        = document.getElementById('manageNameInput')?.value.trim()  || '';
    const description = document.getElementById('manageDescInput')?.value.trim()  || '';
    const maxStudents = parseInt(document.getElementById('manageMaxInput')?.value || '50');

    if (!name) return showNotification('Please enter a class name', 'error');
    if (name.length < 3 || name.length > 100) return showNotification('Class name must be 3–100 characters', 'error');
    if (!maxStudents || maxStudents < 1 || maxStudents > 100) return showNotification('Max students must be 1–100', 'error');

    const saveBtn = document.getElementById('saveManageBtn');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...'; }

    try {
        await apiRequest(`/classrooms/${encodeURIComponent(currentManageClassId)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name,
                description: description || null,
                maxStudents,
                status: (currentManageClassroomStatus || 'ACTIVE').toUpperCase()
            })
        });

        showNotification('Classroom updated!', 'success');
        closeModal(manageModal);
        await loadClasses();

    } catch (error) {
        console.error('Update classroom error:', error);
        showNotification(error.message || 'Update failed', 'error');
    } finally {
        if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = '<i class="fas fa-check"></i> Save Changes'; }
    }
}

async function handleUpdateStatus() {
    const sourceStatus = (currentManageClassroomStatus || 'ACTIVE').toUpperCase();

    if (sourceStatus === 'CLOSED' || sourceStatus === 'ARCHIVED') {
        return showNotification('Classroom is already closed.', 'info');
    }

    const confirmed = window.confirm('Close this classroom? This is irreversible from the dashboard.');
    if (!confirmed) return;

    const btn = document.getElementById('updateStatusBtn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Updating...'; }

    try {
        const response = await apiRequest(`/classrooms/${encodeURIComponent(currentManageClassId)}/close`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        showNotification('Classroom closed successfully!', 'success');
        currentManageClassroomStatus = 'CLOSED';
        updateCurrentStatusBadge('CLOSED');
        updateCloseStatusWarning('CLOSED');
        syncCloseStatusAction('CLOSED');
        closeModal(manageModal);
        await loadClasses();

    } catch (error) {
        console.error('Close classroom error:', error);
        showNotification(error.message || 'Failed to close classroom', 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-lock"></i> Close Classroom'; }
    }
}

async function handleDeleteClassroom() {
    const box = document.getElementById('deleteConfirmBox');
    if (box) box.classList.remove('visible');

    const deleteBtn = document.getElementById('confirmDeleteBtn');
    if (deleteBtn) { deleteBtn.disabled = true; deleteBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Deleting...'; }

    try {
        await apiRequest(`/classrooms/${encodeURIComponent(currentManageClassId)}`, { method: 'DELETE' });

        showNotification('Classroom deleted.', 'success');
        closeModal(manageModal);
        await loadClasses();

    } catch (error) {
        console.error('Delete classroom error:', error);
        showNotification(error.message || 'Delete failed', 'error');
    } finally {
        if (deleteBtn) { deleteBtn.disabled = false; deleteBtn.innerHTML = '<i class="fas fa-trash-alt"></i> Yes, delete permanently'; }
        const input = document.getElementById('deleteConfirmInput');
        if (input) { input.value = ''; input.classList.remove('match'); }
    }
}

// Add animations
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn  { from { transform:translateX(400px);opacity:0 } to { transform:translateX(0);opacity:1 } }
    @keyframes slideOut { from { transform:translateX(0);opacity:1 } to { transform:translateX(400px);opacity:0 } }
`;
document.head.appendChild(style);