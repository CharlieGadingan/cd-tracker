const submissionModal = document.getElementById('submissionModal');
      const submissionsModal = document.getElementById('submissionsModal');
      const modalAssignmentDetail = document.getElementById('modalAssignmentDetail');
      const githubLinkInput = document.getElementById('githubLink');

      const userApi = window.ApiClient?.user;

      // Load student profile
      (async function loadStudentProfile() {
          try {
            if (!userApi) {
              throw new Error('API client is not initialized.');
            }

            const data = await userApi.getProfile();
              const firstName  = data.firstName || '';
              const lastName   = data.lastName  || '';
              const fullName   = `${firstName} ${lastName}`.trim() || 'Student';
              const profileUrl = data.profileUrl || '';
              const initials   = (firstName.charAt(0) + lastName.charAt(0)).toUpperCase() || 'ST';

              const nameEl   = document.getElementById('studentName');
              const avatarEl = document.getElementById('studentAvatar');
              if (nameEl) nameEl.textContent = fullName;
              if (avatarEl) {
                  if (profileUrl) {
                      avatarEl.innerHTML = `<img src="${profileUrl}" alt="${fullName}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
                  } else {
                      avatarEl.textContent = initials;
                  }
              }
          } catch (e) {
              console.error('Error loading student profile:', e);
          }
      })();
      
      // Close buttons
      document.getElementById('closeModal').onclick = () => {
        submissionModal.style.display = 'none';
      };
      
      document.getElementById('closeSubmissionsModal').onclick = () => {
        submissionsModal.style.display = 'none';
      };

      document.getElementById('cancelSubmitBtn').onclick = () => {
        submissionModal.style.display = 'none';
      };
      
      // View All Submissions button
      document.getElementById('viewAllSubmissionsBtn').onclick = (e) => {
        e.preventDefault();
        submissionsModal.style.display = 'block';
      };
      
      // Back to Dashboard button
      document.getElementById('backToDashboardBtn').onclick = (e) => {
        e.preventDefault();
        window.location.href = 'dashboard.html';
      };

      // Paste from clipboard
      document.getElementById('pasteGithubBtn').onclick = async () => {
        try {
          const text = await navigator.clipboard.readText();
          githubLinkInput.value = text;
        } catch (err) {
          alert('Unable to paste from clipboard. Please paste manually.');
        }
      };

      // Submit button
      document.getElementById('submitAssignmentBtn').onclick = () => {
        const githubLink = githubLinkInput.value;
        const note = document.getElementById('submissionNote').value;
        
        if (!githubLink) {
          alert('Please enter a GitHub repository link');
          return;
        }

        // Validate GitHub URL
        if (!githubLink.includes('github.com')) {
          alert('Please enter a valid GitHub repository URL');
          return;
        }

        // Here you would send the data to your backend
        console.log('Submitting:', {
          assignment: currentAssignment,
          githubLink,
          note
        });

        alert('Assignment submitted successfully!');
        submissionModal.style.display = 'none';
        
        // Clear form
        githubLinkInput.value = '';
        document.getElementById('submissionNote').value = '';
      };

      // Close modals when clicking outside
      window.onclick = (e) => {
        if (e.target === submissionModal) {
          submissionModal.style.display = 'none';
        }
        if (e.target === submissionsModal) {
          submissionsModal.style.display = 'none';
        }
      };

      // Store current assignment
      let currentAssignment = null;

      // Add click handlers to all assignments and submissions
      document.querySelectorAll('.assignment, .submission-item').forEach(item => {
        item.addEventListener('click', (e) => {
          e.preventDefault();
          
          // Get assignment details
          const title = item.querySelector('.assignment-title, .submission-title').innerText;
          const description = item.querySelector('.assignment-desc, .submission-content').innerText;
          const status = item.querySelector('.assignment-status, .submission-badge')?.innerText || 'Active';
          
          // Check if it's an assignment (not a submission)
          const isAssignment = item.classList.contains('assignment');
          
          if (isAssignment) {
            // For active assignments, show submission modal
            const dueDate = item.querySelector('.assignment-status').innerText;
            
            modalAssignmentDetail.innerHTML = `
              <div class="assignment-detail-item">
                <i class="fas fa-tasks"></i>
                <div><strong>${title.split('\n')[0]}</strong></div>
              </div>
              <div class="assignment-detail-item">
                <i class="fas fa-align-left"></i>
                <div>${item.querySelector('.assignment-desc').innerText}</div>
              </div>
              <div class="assignment-detail-item">
                <i class="fas fa-calendar-alt"></i>
                <div><strong>Due:</strong> ${dueDate}</div>
              </div>
              <div class="assignment-detail-item">
                <i class="fas fa-star"></i>
                <div><strong>Points:</strong> ${item.querySelector('.points').innerText}</div>
              </div>
            `;
            
            currentAssignment = {
              id: item.dataset.assignmentId,
              title: title,
              description: description
            };
            
            submissionModal.style.display = 'block';
          } else {
            // For submissions, just show info (could be expanded later)
            alert(`Viewing submission: ${title}\n\n${description}`);
          }
        });
      });

      // Simulate due date checking
      function checkDueDates() {
        const today = new Date('2026-03-05');
        console.log('Today\'s date:', today.toDateString());
        console.log('Active assignments are those with due dates after today');
        console.log('Expired assignments have been moved to Recent Submissions');
      }

      // Run on page load
      checkDueDates();