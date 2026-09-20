document.addEventListener('DOMContentLoaded', () => {
    const adminQueriesBtn = document.getElementById('adminQueriesBtn');
    const adminQueriesModal = document.getElementById('adminQueriesModal');
    const closeQueriesModalBtn = document.getElementById('closeQueriesModalBtn');
    const queriesListContainer = document.getElementById('queriesListContainer');
    const queryCountBadge = document.getElementById('queryCountBadge');
    const authForm = document.getElementById('authForm');
    // Expanded Data Structure
    let activeQueries = [
        {
            id: 'q_1001',
            type: 'issue',
            message: 'The node synchronization fails on startup.',
            timestamp: new Date().toISOString(),
            status: 'unread', // 'unread', 'read', or 'verified'
            reply: null
        },
        {
            id: 'q_1002',
            type: 'query',
            message: 'How do I reset my admin credentials?',
            timestamp: new Date().toISOString(),
            status: 'verified',
            reply: 'Check the systems documentation under the Auth section.'
        }
    ];
    let role = 'user';

    // show or hide ui accordinhg to role
    const autoFetchRole = (userData) => {
        switch (userData?.role) {
            case "user":
                adminQueriesBtn.classList.add('hidden');
                break;
            case "admin":
                adminQueriesBtn.classList.remove('hidden');
                // renderQueries();
                break;
            case "coadmin":
                adminQueriesBtn.classList.remove('hidden');
                // renderQueries();
                break;

            default:
                adminQueriesBtn.classList.add('hidden');
        }
    }


    window.sendUserDataToQueryManager = (userData) => {
        console.log("DATA RECIVED FROM APP.JS:", userData)
        role = userData?.role || "user";
        autoFetchRole(userData);
    }

    // 1. Reveal Button on Admin Login Success
    if (authForm) {
        authForm.addEventListener('submit', (e) => {
            // After successful auth verification logic:
            adminQueriesBtn.classList.remove('hidden');
            adminQueriesBtn.classList.add('flex');
        });
    }






    // 2. Open/Close Modal Logic
    const toggleQueriesModal = (show) => {
        if (show) {
            adminQueriesModal.classList.remove('hidden');
            renderQueries(); // Refresh UI when opening
        } else {
            adminQueriesModal.classList.add('hidden');
        }
    };

    adminQueriesBtn.addEventListener('click', () => toggleQueriesModal(true));
    closeQueriesModalBtn.addEventListener('click', () => toggleQueriesModal(false));

    // Close on backdrop click
    adminQueriesModal.addEventListener('click', (e) => {
        if (e.target === adminQueriesModal) toggleQueriesModal(false);
    });

    // 3. Render Queries UI
    const renderQueries = () => {
        const queryCountBadge = document.getElementById('queryCountBadge');
        const queriesListContainer = document.getElementById('queriesListContainer');

        queryCountBadge.textContent = activeQueries.length;

        if (activeQueries.length === 0) {
            queriesListContainer.innerHTML = `
            <div class="h-full flex flex-col items-center justify-center text-slate-500 space-y-3">
                <i class="fa-solid fa-inbox text-3xl"></i>
                <p class="text-xs">No active queries found.</p>
            </div>`;
            return;
        }

        queriesListContainer.innerHTML = activeQueries.map((q) => {
            // Type Badge Styling
            const typeColors = {
                query: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
                issue: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
                feedback: 'bg-amber-500/10 text-amber-400 border-amber-500/20'
            };
            const typeBadge = typeColors[q.type] || typeColors.query;

            // Status Badge Styling
            const isVerified = q.status === 'verified';
            const statusBadge = isVerified
                ? '<span class="text-[9px] font-bold text-emerald-400"><i class="fa-solid fa-check-double"></i> Verified</span>'
                : (q.status === 'read' ? '<span class="text-[9px] font-bold text-slate-400"><i class="fa-solid fa-check"></i> Read</span>' : '<span class="text-[9px] font-bold text-rose-400 animate-pulse">Unread</span>');

            // Reply UI Block
            const replyHtml = q.reply
                ? `<div class="mt-2 p-3 bg-slate-950/50 rounded-lg border border-indigo-500/20">
                 <p class="text-[10px] font-bold text-indigo-400 mb-1"><i class="fa-solid fa-reply"></i> Admin Reply:</p>
                 <p class="text-xs text-slate-300">${q.reply}</p>
               </div>`
                : '';

            return `
        <div class="bg-slate-900 border ${isVerified ? 'border-emerald-500/30' : 'border-slate-700/50'} rounded-xl p-4 flex flex-col gap-3 shadow-lg transition-all">
            <div class="flex justify-between items-start">
                <div class="flex items-center gap-2">
                    <span class="inline-flex items-center gap-1.5 py-0.5 px-2.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${typeBadge}">
                        ${q.type}
                    </span>
                    ${statusBadge}
                </div>
                <span class="text-[10px] font-mono text-slate-500">${new Date(q.timestamp).toLocaleTimeString()}</span>
            </div>
            
            <p class="text-xs text-slate-200 leading-relaxed break-words">${q.message}</p>
            
            ${replyHtml}

            <!-- Action Buttons -->
            <div class="flex flex-wrap justify-end gap-2 mt-2 border-t border-slate-800 pt-3">
                <button onclick="editQuery('${q.id}')" class="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-[10px] font-bold rounded-lg transition flex items-center gap-1.5">
                    <i class="fa-solid fa-pen"></i> Edit
                </button>
                
                <button onclick="replyQuery('${q.id}')" class="px-2.5 py-1.5 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/20 text-[10px] font-bold rounded-lg transition flex items-center gap-1.5">
                    <i class="fa-solid fa-reply"></i> ${q.reply ? 'Edit Reply' : 'Reply'}
                </button>
                
                <button onclick="toggleVerifyQuery('${q.id}')" class="px-2.5 py-1.5 ${isVerified ? 'bg-emerald-600/20 text-emerald-400 border-emerald-500/40' : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 border-emerald-500/20'} text-[10px] font-bold rounded-lg transition flex items-center gap-1.5">
                    <i class="fa-solid fa-shield-check"></i> ${isVerified ? 'Verified' : 'Verify'}
                </button>
                
                <button onclick="deleteQuery('${q.id}')" class="px-2.5 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 text-[10px] font-bold rounded-lg transition flex items-center gap-1.5">
                    <i class="fa-solid fa-trash"></i> Delete
                </button>
            </div>
        </div>`;
        }).join('');
    };

    // Global function to remove items (can be bound to socket emits)
    window.removeQuery = (index) => {
        activeQueries.splice(index, 1);
        renderQueries();
    };



    // 4. Function to receive new feedback (Tie this to your Socket.io listener)
    window.receiveNewFeedback = (payload) => {
        activeQueries.unshift(payload); // Add to top
        queryCountBadge.textContent = activeQueries.length;

        // Add a visual pulse to the admin button to notify them
        adminQueriesBtn.classList.add('animate-pulse', 'border-indigo-400');
        setTimeout(() => {
            adminQueriesBtn.classList.remove('animate-pulse', 'border-indigo-400');
        }, 2000);

        if (!adminQueriesModal.classList.contains('hidden')) {
            renderQueries();
        }
    };



    window.deleteQuery = (id) => {
        // Alternatively, tie this into your confirmModal from index.html
        if (confirm('Are you sure you want to delete this query?')) {
            activeQueries = activeQueries.filter(q => q.id !== id);
            renderQueries();
        }
    };

    // Toggle Read / Verified Status
    window.toggleVerifyQuery = (id) => {
        const query = activeQueries.find(q => q.id === id);
        if (query) {
            query.status = query.status === 'verified' ? 'read' : 'verified';
            renderQueries();
        }
    };

    // Edit User Message (Admin override)
    window.editQuery = (id) => {
        const query = activeQueries.find(q => q.id === id);
        if (query) {
            // You can wire this up to your custom promptModal later
            const newMsg = prompt('Edit user message:', query.message);
            if (newMsg !== null && newMsg.trim() !== '') {
                query.message = newMsg.trim();
                renderQueries();
            }
        }
    };

    // Reply to Query
    window.replyQuery = (id) => {
        const query = activeQueries.find(q => q.id === id);
        if (query) {
            const replyText = prompt('Enter your admin reply:', query.reply || '');
            if (replyText !== null) {
                query.reply = replyText.trim();
                if (query.status === 'unread') query.status = 'read'; // Auto-mark read
                renderQueries();
            }
        }
    };



});