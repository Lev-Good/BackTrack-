// BackTrack Premium Client Logic

document.addEventListener('DOMContentLoaded', () => {
    // API Endpoints
    const API = {
        history: '/api/history',
        restore: '/api/restore',
        privateMode: '/api/private-mode',
        snapshots: '/api/snapshots',
        snapshotsCreate: '/api/snapshots/create',
        snapshotsRestore: '/api/snapshots/restore',
        snapshotsDelete: '/api/snapshots/delete',
        clipboard: '/api/clipboard',
        clipboardCopy: '/api/clipboard/copy',
        clipboardDelete: '/api/clipboard/delete'
    };

    // State Variables
    let isPrivateMode = false;
    let historyData = [];
    let clipboardData = [];
    let snapshotsData = [];
    
    let activeTab = 'history-tab';
    let historyFilter = 'all';
    let historySearch = '';
    let clipboardSearch = '';

    // DOM Elements
    const navItems = document.querySelectorAll('.nav-item');
    const tabContents = document.querySelectorAll('.tab-content');
    
    // Private Mode
    const privateModeToggle = document.getElementById('privateModeToggle');
    const privateOverlay = document.getElementById('privateOverlay');
    const privateIcon = document.getElementById('privateIcon');
    const privateDesc = document.getElementById('privateDesc');
    const disablePrivateBtn = document.getElementById('disablePrivateBtn');

    // History Tab
    const historyList = document.getElementById('historyList');
    const historyEmptyState = document.getElementById('historyEmptyState');
    const historySearchInput = document.getElementById('historySearch');
    const historyFilterTabs = document.querySelectorAll('#history-tab .filter-tab');
    const clearHistoryBtn = document.getElementById('clearHistoryBtn');

    // Clipboard Tab
    const clipboardList = document.getElementById('clipboardList');
    const clipboardEmptyState = document.getElementById('clipboardEmptyState');
    const clipboardSearchInput = document.getElementById('clipboardSearch');
    const clearClipboardBtn = document.getElementById('clearClipboardBtn');

    // Snapshots Tab
    const snapshotsList = document.getElementById('snapshotsList');
    const snapshotsEmptyState = document.getElementById('snapshotsEmptyState');
    const saveSnapshotBtn = document.getElementById('saveSnapshotBtn');
    
    // Snapshot Modal
    const snapshotModal = document.getElementById('snapshotModal');
    const snapshotNameInput = document.getElementById('snapshotNameInput');
    const cancelSnapshotBtn = document.getElementById('cancelSnapshotBtn');
    const confirmSnapshotBtn = document.getElementById('confirmSnapshotBtn');

    // Toast Notification Container
    const toastContainer = document.getElementById('toastContainer');

    // --- INITIALIZATION ---
    syncPrivateMode();
    fetchData();

    // Poll the status periodically (every 1.5 seconds)
    setInterval(() => {
        syncPrivateMode().then(() => {
            if (!isPrivateMode) {
                fetchData();
            }
        });
    }, 1500);

    // --- NAVIGATION CONTROLLER ---
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            navItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            
            activeTab = item.getAttribute('data-tab');
            tabContents.forEach(tab => {
                tab.classList.remove('active');
                if (tab.id === activeTab) {
                    tab.classList.add('active');
                }
            });
            fetchData();
        });
    });

    // --- PRIVATE MODE SYNC ---
    async function syncPrivateMode() {
        try {
            const response = await fetch(API.privateMode);
            if (response.ok) {
                const data = await response.json();
                if (isPrivateMode !== data.enabled) {
                    isPrivateMode = data.enabled;
                    updatePrivateModeUI();
                }
            }
        } catch (error) {
            console.error('Failed to sync private mode:', error);
        }
    }

    async function togglePrivateMode(enabled) {
        try {
            const response = await fetch(`${API.privateMode}?enabled=${enabled}`, { method: 'POST' });
            if (response.ok) {
                isPrivateMode = enabled;
                updatePrivateModeUI();
                showToast(enabled ? 'מצב פרטי הופעל. הניטור מושהה.' : 'מצב פרטי כבוי. הניטור הופעל מחדש.');
            }
        } catch (error) {
            console.error('Failed to toggle private mode:', error);
            showToast('שגיאה בשינוי מצב פרטי.');
        }
    }

    function updatePrivateModeUI() {
        privateModeToggle.checked = isPrivateMode;
        if (isPrivateMode) {
            privateOverlay.style.display = 'flex';
            privateIcon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#f87171" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>`; // Unlocked or warning lock
            privateDesc.textContent = 'הניטור מושהה כעת';
            privateDesc.style.color = '#f87171';
        } else {
            privateOverlay.style.display = 'none';
            privateIcon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`; // Standard Lock
            privateDesc.textContent = 'הניטור פועל כסדרו';
            privateDesc.style.color = '';
        }
    }

    privateModeToggle.addEventListener('change', (e) => {
        togglePrivateMode(e.target.checked);
    });

    disablePrivateBtn.addEventListener('click', () => {
        togglePrivateMode(false);
    });

    // --- DATA FETCHER ---
    async function fetchData() {
        if (isPrivateMode) return;

        if (activeTab === 'history-tab') {
            fetchHistory();
        } else if (activeTab === 'clipboard-tab') {
            fetchClipboard();
        } else if (activeTab === 'snapshots-tab') {
            fetchSnapshots();
        }
    }

    // --- 1. HISTORY MANAGEMENT ---
    async function fetchHistory() {
        try {
            const response = await fetch(API.history);
            if (response.ok) {
                const data = await response.json();
                if (JSON.stringify(data) !== JSON.stringify(historyData)) {
                    historyData = data;
                    renderHistory();
                } else {
                    updateRelativeTimes();
                }
            }
        } catch (error) {
            console.error('Failed to fetch history:', error);
        }
    }

    function renderHistory() {
        const filtered = historyData.filter(item => {
            if (historyFilter !== 'all' && item.Type !== historyFilter) return false;
            if (historySearch) {
                const search = historySearch.toLowerCase();
                return item.Name.toLowerCase().includes(search) || item.Path.toLowerCase().includes(search);
            }
            return true;
        });

        if (filtered.length === 0) {
            historyList.style.display = 'none';
            historyEmptyState.style.display = 'flex';
            return;
        }

        historyList.style.display = 'flex';
        historyEmptyState.style.display = 'none';
        historyList.innerHTML = '';

        filtered.forEach(item => {
            const card = document.createElement('div');
            card.className = 'history-card';
            card.setAttribute('data-id', item.Id);

            const iconInfo = getIconDetails(item);

            card.innerHTML = `
                <div class="card-details">
                    <div class="card-icon ${iconInfo.class}" title="${iconInfo.title}">
                        ${iconInfo.svg}
                    </div>
                    <div class="card-info">
                        <div class="card-title-row">
                            <span class="card-name" title="${item.Name}">${item.Name}</span>
                            <span class="card-time" data-timestamp="${item.Timestamp}">${getRelativeTime(item.Timestamp)}</span>
                        </div>
                        <div class="card-path" title="לחץ להעתקת הנתיב">${item.Path}</div>
                    </div>
                </div>
                <div class="card-actions">
                    <button class="btn btn-secondary btn-sm btn-restore-item">שחזר</button>
                    <button class="btn-card-action btn-delete-card" title="מחק מההיסטוריה">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
                        </svg>
                    </button>
                </div>
            `;

            // Bind actions
            card.querySelector('.btn-restore-item').addEventListener('click', () => restoreHistoryItem(item));
            card.querySelector('.btn-delete-card').addEventListener('click', () => deleteHistoryItem(item.Id, card));
            card.querySelector('.card-path').addEventListener('click', () => {
                navigator.clipboard.writeText(item.Path);
                showToast(`הנתיב הועתק ללוח: ${item.Path}`);
            });

            historyList.appendChild(card);
        });
    }

    async function restoreHistoryItem(item) {
        try {
            const response = await fetch(`${API.restore}?id=${encodeURIComponent(item.Id)}`, { method: 'POST' });
            if (response.ok) {
                const res = await response.json();
                if (res.success) {
                    const card = historyList.querySelector(`[data-id="${item.Id}"]`);
                    if (card) {
                        card.classList.add('removing');
                        setTimeout(() => {
                            historyData = historyData.filter(x => x.Id !== item.Id);
                            renderHistory();
                        }, 250);
                    }
                    
                    let typeLabel = 'התיקייה';
                    if (item.Type === 'file') typeLabel = 'הקובץ';
                    else if (item.Type === 'app') typeLabel = 'האפליקציה';
                    
                    showToast(`${typeLabel} "${item.Name}" נפתח/ה בהצלחה.`);
                } else {
                    showToast('שגיאה בשחזור הפריט. ייתכן והקובץ או התיקייה אינם קיימים עוד.');
                }
            }
        } catch (error) {
            console.error('Restore error:', error);
            showToast('שגיאה בשחזור.');
        }
    }

    async function deleteHistoryItem(id, cardElement) {
        try {
            const response = await fetch(`${API.history}/delete?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
            if (response.ok) {
                cardElement.classList.add('removing');
                setTimeout(() => {
                    historyData = historyData.filter(x => x.Id !== id);
                    renderHistory();
                }, 250);
            }
        } catch (error) {
            console.error('Delete history item error:', error);
        }
    }

    async function clearAllHistory() {
        try {
            const response = await fetch(API.history, { method: 'DELETE' });
            if (response.ok) {
                historyData = [];
                renderHistory();
                showToast('היסטוריית הסגירות נמחקה.');
            }
        } catch (error) {
            console.error('Clear history error:', error);
        }
    }

    // Bind History Filters & Search
    historySearchInput.addEventListener('input', (e) => {
        historySearch = e.target.value.trim();
        renderHistory();
    });

    historyFilterTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            historyFilterTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            historyFilter = tab.getAttribute('data-filter');
            renderHistory();
        });
    });

    clearHistoryBtn.addEventListener('click', () => {
        if (confirm('האם אתה בטוח שברצונך למחוק את כל היסטוריית הסגירות?')) {
            clearAllHistory();
        }
    });

    // --- 2. CLIPBOARD HISTORY MANAGEMENT ---
    async function fetchClipboard() {
        try {
            const response = await fetch(API.clipboard);
            if (response.ok) {
                const data = await response.json();
                if (JSON.stringify(data) !== JSON.stringify(clipboardData)) {
                    clipboardData = data;
                    renderClipboard();
                }
            }
        } catch (error) {
            console.error('Failed to fetch clipboard history:', error);
        }
    }

    function renderClipboard() {
        const filtered = clipboardData.filter(item => {
            if (clipboardSearch) {
                return item.Content.toLowerCase().includes(clipboardSearch.toLowerCase());
            }
            return true;
        });

        if (filtered.length === 0) {
            clipboardList.style.display = 'none';
            clipboardEmptyState.style.display = 'flex';
            return;
        }

        clipboardList.style.display = 'grid';
        clipboardEmptyState.style.display = 'none';
        clipboardList.innerHTML = '';

        filtered.forEach(item => {
            const card = document.createElement('div');
            card.className = 'clipboard-card';
            card.setAttribute('data-id', item.Id);

            // Escape HTML characters to prevent XSS
            const escapedContent = escapeHtml(item.Content);

            card.innerHTML = `
                <div class="clip-content" title="לחץ להעתקה מהירה">${escapedContent}</div>
                <div class="clip-footer">
                    <span class="clip-time">${getRelativeTime(item.Timestamp)}</span>
                    <div class="clip-actions">
                        <button class="btn-card-action btn-copy-clip" title="העתק מחדש ללוח">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <rect width="14" height="14" x="8" y="8" rx="2" ry="2"/>
                                <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
                            </svg>
                        </button>
                        <button class="btn-card-action btn-delete-clip" title="מחק מההיסטוריה">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
                            </svg>
                        </button>
                    </div>
                </div>
            `;

            // Clicking card content or copy button copies it back
            const performCopy = () => copyClipItem(item.Id, item.Content);
            card.querySelector('.clip-content').addEventListener('click', performCopy);
            card.querySelector('.btn-copy-clip').addEventListener('click', (e) => {
                e.stopPropagation();
                performCopy();
            });

            card.querySelector('.btn-delete-clip').addEventListener('click', (e) => {
                e.stopPropagation();
                deleteClipItem(item.Id, card);
            });

            clipboardList.appendChild(card);
        });
    }

    async function copyClipItem(id, text) {
        try {
            const response = await fetch(`${API.clipboardCopy}?id=${encodeURIComponent(id)}`, { method: 'POST' });
            if (response.ok) {
                const res = await response.json();
                if (res.success) {
                    showToast('הטקסט הועתק מחדש ללוח ההעתקה במחשב!');
                    
                    // Put it on the top of local array and re-render
                    fetchClipboard();
                }
            }
        } catch (error) {
            console.error('Copy clip item error:', error);
        }
    }

    async function deleteClipItem(id, cardElement) {
        try {
            const response = await fetch(`${API.clipboardDelete}?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
            if (response.ok) {
                cardElement.classList.add('removing');
                setTimeout(() => {
                    clipboardData = clipboardData.filter(x => x.Id !== id);
                    renderClipboard();
                }, 250);
            }
        } catch (error) {
            console.error('Delete clip error:', error);
        }
    }

    async function clearAllClipboard() {
        try {
            const response = await fetch(API.clipboard, { method: 'DELETE' });
            if (response.ok) {
                clipboardData = [];
                renderClipboard();
                showToast('היסטוריית לוח ההעתקה נמחקה.');
            }
        } catch (error) {
            console.error('Clear clipboard error:', error);
        }
    }

    // Bind Clipboard Search & Clear
    clipboardSearchInput.addEventListener('input', (e) => {
        clipboardSearch = e.target.value.trim();
        renderClipboard();
    });

    clearClipboardBtn.addEventListener('click', () => {
        if (confirm('האם אתה בטוח שברצונך למחוק את כל היסטוריית לוח ההעתקה?')) {
            clearAllClipboard();
        }
    });

    // --- 3. WORKSPACE SNAPSHOTS MANAGEMENT ---
    async function fetchSnapshots() {
        try {
            const response = await fetch(API.snapshots);
            if (response.ok) {
                const data = await response.json();
                if (JSON.stringify(data) !== JSON.stringify(snapshotsData)) {
                    snapshotsData = data;
                    renderSnapshots();
                }
            }
        } catch (error) {
            console.error('Failed to fetch snapshots:', error);
        }
    }

    function renderSnapshots() {
        if (snapshotsData.length === 0) {
            snapshotsList.style.display = 'none';
            snapshotsEmptyState.style.display = 'flex';
            return;
        }

        snapshotsList.style.display = 'flex';
        snapshotsEmptyState.style.display = 'none';
        snapshotsList.innerHTML = '';

        snapshotsData.forEach(item => {
            const card = document.createElement('div');
            card.className = 'snapshot-card';

            // List of paths inside snapshot
            const pathsHtml = item.Paths.map(p => `<span class="snapshot-path-item">${p}</span>`).join('');

            card.innerHTML = `
                <div class="snapshot-header">
                    <div class="snapshot-title-group">
                        <span class="snapshot-name">${item.Name}</span>
                        <span class="snapshot-meta">${item.Paths.length} תיקיות פתוחות • נשמר ב-${formatDateTime(item.Timestamp)}</span>
                    </div>
                    <div class="card-actions">
                        <button class="btn btn-primary btn-sm btn-restore-snapshot">פתח קבוצה</button>
                        <button class="btn-card-action btn-delete-snapshot" title="מחק קבוצה">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
                            </svg>
                        </button>
                    </div>
                </div>
                <div class="snapshot-paths">
                    ${pathsHtml}
                </div>
            `;

            card.querySelector('.btn-restore-snapshot').addEventListener('click', () => restoreSnapshot(item.Id, item.Name));
            card.querySelector('.btn-delete-snapshot').addEventListener('click', () => deleteSnapshot(item.Id, card));

            snapshotsList.appendChild(card);
        });
    }

    async function restoreSnapshot(id, name) {
        try {
            const response = await fetch(`${API.snapshotsRestore}?id=${encodeURIComponent(id)}`, { method: 'POST' });
            if (response.ok) {
                const res = await response.json();
                if (res.success) {
                    showToast(`כל התיקיות בקבוצה "${name}" נפתחו במחשב!`);
                } else {
                    showToast('שגיאה בפתיחת קבוצת התיקיות.');
                }
            }
        } catch (error) {
            console.error('Restore snapshot error:', error);
        }
    }

    async function deleteSnapshot(id, cardElement) {
        try {
            const response = await fetch(`${API.snapshotsDelete}?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
            if (response.ok) {
                cardElement.style.opacity = 0;
                cardElement.style.transform = 'translateY(10px)';
                cardElement.style.transition = 'all 0.25s ease-out';
                setTimeout(() => {
                    snapshotsData = snapshotsData.filter(x => x.Id !== id);
                    renderSnapshots();
                }, 250);
            }
        } catch (error) {
            console.error('Delete snapshot error:', error);
        }
    }

    // Modal Prompts for Snapshot
    saveSnapshotBtn.addEventListener('click', () => {
        snapshotNameInput.value = '';
        snapshotModal.style.display = 'flex';
        snapshotNameInput.focus();
    });

    cancelSnapshotBtn.addEventListener('click', () => {
        snapshotModal.style.display = 'none';
    });

    confirmSnapshotBtn.addEventListener('click', () => {
        const name = snapshotNameInput.value.trim();
        createSnapshot(name);
        snapshotModal.style.display = 'none';
    });

    snapshotNameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const name = snapshotNameInput.value.trim();
            createSnapshot(name);
            snapshotModal.style.display = 'none';
        } else if (e.key === 'Escape') {
            snapshotModal.style.display = 'none';
        }
    });

    async function createSnapshot(name) {
        try {
            // Encode named parameter for query URL (Hebrew Support)
            const queryName = name ? `?name=${encodeURIComponent(name)}` : '';
            const response = await fetch(`${API.snapshotsCreate}${queryName}`, { method: 'POST' });
            if (response.ok) {
                const res = await response.json();
                if (res.success) {
                    showToast(name ? `קבוצת התיקיות "${name}" נשמרה בהצלחה!` : 'קבוצת התיקיות הנוכחית נשמרה בהצלחה!');
                    fetchSnapshots();
                } else {
                    showToast('לא נמצאו תיקיות פתוחות לשמירה כקבוצה.');
                }
            }
        } catch (error) {
            console.error('Create snapshot error:', error);
        }
    }

    // --- HELPER UTILITIES ---

    // Get icon class and SVG code
    function getIconDetails(item) {
        if (item.Type === 'folder') {
            return {
                class: 'icon-folder',
                title: 'תיקייה',
                svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>`
            };
        }
        if (item.Type === 'app') {
            return {
                class: 'icon-app',
                title: 'אפליקציה',
                svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="16" x="2" y="3" rx="2"/><path d="M12 17v4"/><path d="M8 21h8"/></svg>`
            };
        }

        // File: Determine by extension
        const ext = item.Path.split('.').pop().toLowerCase();

        if (ext === 'pdf') {
            return {
                class: 'icon-file',
                title: 'קובץ PDF',
                svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><line x1="9" y1="15" x2="15" y2="15"/></svg>`
            };
        }
        if (['xlsx', 'xls', 'csv'].includes(ext)) {
            return {
                class: 'icon-file',
                title: 'גיליון נתונים (Excel)',
                svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/></svg>`
            };
        }
        if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp'].includes(ext)) {
            return {
                class: 'icon-file',
                title: 'קובץ תמונה',
                svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>`
            };
        }
        if (['cs', 'html', 'css', 'js', 'py', 'json', 'xml', 'cpp', 'h'].includes(ext)) {
            return {
                class: 'icon-file',
                title: 'קובץ קוד מקור',
                svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 16 4-4-4-4"/><path d="m6 8-4 4 4 4"/><path d="m14.5 4-5 16"/></svg>`
            };
        }
        if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) {
            return {
                class: 'icon-file',
                title: 'קובץ כיווץ (ארכיון)',
                svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="12" x="2" y="6" rx="2"/><path d="M12 12V6"/><path d="M12 18v-2"/></svg>`
            };
        }

        // Generic File
        return {
            class: 'icon-file',
            title: 'קובץ/מסמך',
            svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/></svg>`
        };
    }

    // Update timestamps on cards dynamically
    function updateRelativeTimes() {
        document.querySelectorAll('.card-time').forEach(el => {
            const timestamp = el.getAttribute('data-timestamp');
            if (timestamp) {
                el.textContent = getRelativeTime(timestamp);
            }
        });
        document.querySelectorAll('.clip-time').forEach(el => {
            const timestamp = el.getAttribute('data-timestamp');
            if (timestamp) {
                el.textContent = getRelativeTime(timestamp);
            }
        });
    }

    // Relative time in Hebrew
    function getRelativeTime(timestampStr) {
        const now = new Date();
        const date = new Date(timestampStr);
        const diffMs = now - date;
        const diffSec = Math.floor(diffMs / 1000);
        const diffMin = Math.floor(diffSec / 60);
        const diffHr = Math.floor(diffMin / 60);
        const diffDay = Math.floor(diffHr / 24);

        if (diffSec < 5) return 'כרגע';
        if (diffSec < 60) return `לפני ${diffSec} שניות`;
        if (diffMin === 1) return 'לפני דקה';
        if (diffMin === 2) return 'לפני שתי דקות';
        if (diffMin < 60) return `לפני ${diffMin} דקות`;
        if (diffHr === 1) return 'לפני שעה';
        if (diffHr === 2) return 'לפני שעתיים';
        if (diffHr < 24) return `לפני ${diffHr} שעות`;
        if (diffDay === 1) return 'אתמול';
        if (diffDay === 2) return 'שלשום';
        return `לפני ${diffDay} ימים`;
    }

    function formatDateTime(timestampStr) {
        const d = new Date(timestampStr);
        const hours = String(d.getHours()).padStart(2, '0');
        const minutes = String(d.getMinutes()).padStart(2, '0');
        return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()} בשעה ${hours}:${minutes}`;
    }

    function escapeHtml(text) {
        return text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    // Custom Toast Notification System
    function showToast(message) {
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.innerHTML = `
            <div class="toast-icon">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
            </div>
            <div class="toast-message">${message}</div>
        `;
        toastContainer.appendChild(toast);

        // Auto remove toast after 3s
        setTimeout(() => {
            toast.classList.add('removing');
            setTimeout(() => {
                toast.remove();
            }, 250);
        }, 3000);
    }
});
