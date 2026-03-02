// ===== CONFIGURATION =====
const CATEGORIES = [
    { key: 'noSnack',          label: 'Niet gesnoept',   emoji: '🍪' },
    { key: 'breakfastHealthy', label: 'Gezond ontbijt',  emoji: '🌅' },
    { key: 'lunchHealthy',     label: 'Gezonde lunch',   emoji: '🥗' },
    { key: 'dinnerHealthy',    label: 'Gezond diner',    emoji: '🍽️' },
    { key: 'proteinShake',     label: 'Eiwitshake',      emoji: '🥛', trackStreak: false },
];

const STREAK_CATEGORIES = CATEGORIES.filter(c => c.trackStreak !== false);

const STORAGE_KEY = 'healthTracker';
const TOKEN_INTERVAL = 5; // earn a token every 5 days of streak

// ===== FIREBASE CONFIG =====
const firebaseConfig = {
    apiKey: "AIzaSyDjp5ePhewt1_lQSHybwLri3WQKM5Rz_KU",
    authDomain: "health-tracker-9b6e1.firebaseapp.com",
    databaseURL: "https://health-tracker-9b6e1-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "health-tracker-9b6e1",
    storageBucket: "health-tracker-9b6e1.firebasestorage.app",
    messagingSenderId: "994704005779",
    appId: "1:994704005779:web:a0a4d31ee2b7b4643b8b66"
};

// ===== FIREBASE INIT =====
let firebaseReady = false;
let firebaseDb = null;
let firebaseRef = null;
let isSyncing = false;

function initFirebase() {
    try {
        const app = firebase.initializeApp(firebaseConfig);
        firebaseDb = firebase.database();
        firebaseRef = firebaseDb.ref('health-tracker/days');

        // Anonymous auth
        firebase.auth().signInAnonymously().then(() => {
            firebaseReady = true;
            setSyncStatus('synced');

            // First fetch Firebase data, then start listener
            firebaseRef.once('value').then((snapshot) => {
                const firebaseDays = snapshot.val();
                if (firebaseDays && Object.keys(firebaseDays).length > 0) {
                    // Firebase has data — use it as truth
                    appData.days = firebaseDays;
                    saveDataLocal(appData);
                    renderAll();
                } else if (Object.keys(appData.days).length > 0) {
                    // Firebase is empty but we have local data — push it
                    syncToFirebase(appData);
                }
                listenToFirebase();
            });
        }).catch((err) => {
            console.warn('Firebase auth failed:', err);
            setSyncStatus('offline');
        });

        // Online/offline detection
        const connectedRef = firebase.database().ref('.info/connected');
        connectedRef.on('value', (snap) => {
            if (snap.val() === true) {
                if (firebaseReady) setSyncStatus('synced');
            } else {
                setSyncStatus('offline');
            }
        });

    } catch (err) {
        console.warn('Firebase init failed:', err);
        setSyncStatus('offline');
    }
}

function syncToFirebase(data) {
    if (!firebaseReady || !firebaseRef) return;

    isSyncing = true;
    setSyncStatus('syncing');

    firebaseRef.set(data.days).then(() => {
        isSyncing = false;
        setSyncStatus('synced');
    }).catch((err) => {
        console.warn('Firebase sync failed:', err);
        isSyncing = false;
        setSyncStatus('offline');
    });
}

function listenToFirebase() {
    if (!firebaseRef) return;

    firebaseRef.on('value', (snapshot) => {
        // Skip if we just wrote this data ourselves
        if (isSyncing) return;

        const firebaseDays = snapshot.val();
        if (firebaseDays) {
            appData.days = firebaseDays;
            saveDataLocal(appData);
            renderAll();
        }
    });
}

// ===== SYNC STATUS INDICATOR =====
function setSyncStatus(status) {
    const container = document.getElementById('syncStatus');
    const icon = document.getElementById('syncIcon');
    if (!container || !icon) return;

    container.className = 'sync-status';

    switch (status) {
        case 'synced':
            icon.textContent = '☁️';
            break;
        case 'syncing':
            icon.textContent = '⏳';
            container.classList.add('syncing');
            break;
        case 'offline':
            icon.textContent = '⚠️';
            container.classList.add('offline');
            break;
    }
}

// ===== DATA LAYER =====
function loadData() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { days: {} };
    try {
        return JSON.parse(raw);
    } catch {
        return { days: {} };
    }
}

// Save to localStorage only (fast, synchronous)
function saveDataLocal(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

// Save to localStorage + sync to Firebase
function saveData(data) {
    saveDataLocal(data);
    syncToFirebase(data);
}

function getTodayKey() {
    return getDateKey(new Date());
}

function getDateKey(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function parseDate(dateKey) {
    const [y, m, d] = dateKey.split('-').map(Number);
    return new Date(y, m - 1, d);
}

function addDays(dateKey, n) {
    const date = parseDate(dateKey);
    date.setDate(date.getDate() + n);
    return getDateKey(date);
}

function getDayData(data, dateKey) {
    return data.days[dateKey] || null;
}

function ensureDayExists(data, dateKey) {
    if (!data.days[dateKey]) {
        data.days[dateKey] = {};
    }
    for (const cat of CATEGORIES) {
        if (!data.days[dateKey][cat.key]) {
            data.days[dateKey][cat.key] = { checked: false, tokenUsed: false };
        }
    }
    return data.days[dateKey];
}

function isCategoryValid(dayData, catKey) {
    if (!dayData || !dayData[catKey]) return false;
    return dayData[catKey].checked || dayData[catKey].tokenUsed;
}

function isDayPerfect(dayData) {
    if (!dayData) return false;
    return STREAK_CATEGORIES.every(cat => isCategoryValid(dayData, cat.key));
}

function getDayScore(dayData) {
    if (!dayData) return 0;
    return STREAK_CATEGORIES.filter(cat => isCategoryValid(dayData, cat.key)).length;
}

function dayHasTokenUsed(dayData) {
    if (!dayData) return false;
    return CATEGORIES.some(cat => dayData[cat.key] && dayData[cat.key].tokenUsed);
}

// ===== STREAK CALCULATION =====
function calculateCategoryStreak(data, catKey) {
    let streak = 0;
    let dateKey = getTodayKey();

    if (isCategoryValid(getDayData(data, dateKey), catKey)) {
        streak = 1;
        dateKey = addDays(dateKey, -1);
    } else {
        dateKey = addDays(dateKey, -1);
    }

    while (isCategoryValid(getDayData(data, dateKey), catKey)) {
        streak++;
        dateKey = addDays(dateKey, -1);
    }

    return streak;
}

function calculatePerfectStreak(data) {
    let streak = 0;
    let dateKey = getTodayKey();

    if (isDayPerfect(getDayData(data, dateKey))) {
        streak = 1;
        dateKey = addDays(dateKey, -1);
    } else {
        dateKey = addDays(dateKey, -1);
    }

    while (isDayPerfect(getDayData(data, dateKey))) {
        streak++;
        dateKey = addDays(dateKey, -1);
    }

    return streak;
}

// ===== TOKEN CALCULATION =====
function calculateTokens(data, catKey) {
    const streak = calculateCategoryStreak(data, catKey);
    const earned = Math.floor(streak / TOKEN_INTERVAL);

    let used = 0;
    let dateKey = getTodayKey();

    for (let i = 0; i < streak; i++) {
        const dayData = getDayData(data, dateKey);
        if (dayData && dayData[catKey] && dayData[catKey].tokenUsed) {
            used++;
        }
        dateKey = addDays(dateKey, -1);
    }

    return {
        earned,
        used,
        available: Math.max(0, earned - used)
    };
}

// Tokens available for a specific date (for retroactive use on past days)
// Calculates streak leading UP TO that date, not from today
function calculateTokensForDay(data, catKey, dateKey) {
    let streak = 0;
    let walkDate = addDays(dateKey, -1);

    while (isCategoryValid(getDayData(data, walkDate), catKey)) {
        streak++;
        walkDate = addDays(walkDate, -1);
    }

    const earned = Math.floor(streak / TOKEN_INTERVAL);

    let used = 0;
    walkDate = addDays(dateKey, -1);
    for (let i = 0; i < streak; i++) {
        const dayData = getDayData(data, walkDate);
        if (dayData && dayData[catKey] && dayData[catKey].tokenUsed) {
            used++;
        }
        walkDate = addDays(walkDate, -1);
    }

    return {
        earned,
        used,
        available: Math.max(0, earned - used)
    };
}

// ===== DATE FORMATTING =====
const MONTHS_NL = [
    'januari', 'februari', 'maart', 'april', 'mei', 'juni',
    'juli', 'augustus', 'september', 'oktober', 'november', 'december'
];

function formatDateHeading(dateKey) {
    const date = parseDate(dateKey);
    const todayKey = getTodayKey();

    if (dateKey === todayKey) {
        return `Vandaag, ${date.getDate()} ${MONTHS_NL[date.getMonth()]}`;
    }
    return `${date.getDate()} ${MONTHS_NL[date.getMonth()]} ${date.getFullYear()}`;
}

// ===== MOTIVATION TEXT =====
function getMotivationText(data) {
    const todayKey = getTodayKey();
    const dayData = getDayData(data, todayKey);
    const score = getDayScore(dayData);
    const perfectStreak = calculatePerfectStreak(data);
    const totalDays = Object.keys(data.days).length;

    if (totalDays === 0) return 'Begin je eerste streak! 💪';
    if (score === STREAK_CATEGORIES.length) {
        if (perfectStreak >= 7) return `Wauw, ${perfectStreak} dagen! Ongelooflijk! 🏆`;
        if (perfectStreak >= 3) return 'Je bent on fire! 🔥';
        return 'Perfecte dag! Goed bezig! 🎉';
    }
    if (score >= 2) return 'Je bent goed op weg vandaag!';
    if (perfectStreak >= 5) return `${perfectStreak} perfecte dagen! Houd vol! 💪`;
    if (perfectStreak >= 1) return 'Nieuwe dag, nieuwe kans! ☀️';
    return 'Laten we er een goede dag van maken!';
}

// ===== STATE =====
let appData = loadData();
let currentCalendarDate = new Date();
let expandedCard = null;
let selectedCalendarDay = null;

// ===== RENDER: PROGRESS RING =====
function renderProgressRing() {
    const todayKey = getTodayKey();
    const dayData = getDayData(appData, todayKey);
    const score = getDayScore(dayData);

    const circumference = 2 * Math.PI * 34;
    const total = STREAK_CATEGORIES.length;
    const offset = circumference - (score / total) * circumference;

    const fill = document.getElementById('progressRingFill');
    const text = document.getElementById('progressRingText');

    fill.style.strokeDashoffset = offset;
    text.textContent = `${score}/${total}`;
}

// ===== RENDER: HEADER =====
function renderHeader() {
    document.getElementById('dateHeading').textContent = formatDateHeading(getTodayKey());
    document.getElementById('motivationText').textContent = getMotivationText(appData);
}

// ===== RENDER: CHECKLIST =====
function renderChecklist() {
    const container = document.getElementById('checklist');
    const todayKey = getTodayKey();
    const dayData = getDayData(appData, todayKey);

    container.innerHTML = '';

    for (const cat of CATEGORIES) {
        const isChecked = dayData && dayData[cat.key] && dayData[cat.key].checked;
        const hasStreak = cat.trackStreak !== false;
        const isExpanded = expandedCard === cat.key;

        const card = document.createElement('div');
        card.className = `card${isExpanded ? ' expanded' : ''}`;
        card.dataset.category = cat.key;

        let detailsHtml = '';
        let streakBadgeHtml = '';
        let tokenBtnHtml = '';
        if (hasStreak) {
            const streak = calculateCategoryStreak(appData, cat.key);
            const tokens = calculateTokensForDay(appData, cat.key, todayKey);
            streakBadgeHtml = `<span class="card-streak-badge">🔥 ${streak}</span>`;
            if (!isChecked && tokens.available > 0) {
                tokenBtnHtml = `<button class="card-token-btn" data-cat="${cat.key}" aria-label="Cheat token gebruiken">🛡️</button>`;
            }
            detailsHtml = `
                <div class="card-details">
                    <div class="card-detail-row">
                        <span class="detail-streak">🔥 ${streak} ${streak === 1 ? 'dag' : 'dagen'}</span>
                        <span class="detail-tokens">🛡️ ${tokens.available} beschikbaar</span>
                    </div>
                </div>
            `;
        }

        card.innerHTML = `
            <div class="card-main">
                <span class="card-emoji">${cat.emoji}</span>
                <span class="card-label">${cat.label}</span>
                ${streakBadgeHtml}
                ${tokenBtnHtml}
                <button class="check-btn${isChecked ? ' checked' : ''}" data-cat="${cat.key}" aria-label="${cat.label} afvinken">
                    <span class="check-btn-front">
                        <svg class="checkmark-svg" viewBox="0 0 24 24">
                            <path class="checkmark-path" d="M5 13l4 4L19 7"/>
                        </svg>
                    </span>
                </button>
            </div>
            ${detailsHtml}
        `;

        card.querySelector('.card-main').addEventListener('click', (e) => {
            if (e.target.closest('.check-btn') || e.target.closest('.card-token-btn')) return;
            if (!hasStreak) return;
            expandedCard = expandedCard === cat.key ? null : cat.key;
            renderChecklist();
        });

        const cardTokenBtn = card.querySelector('.card-token-btn');
        if (cardTokenBtn) {
            cardTokenBtn.addEventListener('click', () => {
                openTokenModal(todayKey, cat.key);
            });
        }

        card.querySelector('.check-btn').addEventListener('click', () => {
            toggleCheck(cat.key);
        });

        container.appendChild(card);
    }
}

// ===== TOGGLE CHECK =====
function toggleCheck(catKey) {
    const todayKey = getTodayKey();
    const day = ensureDayExists(appData, todayKey);

    const wasComplete = isDayPerfect(day);
    day[catKey].checked = !day[catKey].checked;
    if (!day[catKey].checked) {
        day[catKey].tokenUsed = false;
    }
    const isNowComplete = isDayPerfect(day);

    saveData(appData);
    renderAll();

    if (!wasComplete && isNowComplete) {
        celebrate();
    }
}

// ===== CELEBRATION =====
function celebrate() {
    const msg = document.getElementById('completionMessage');
    msg.hidden = false;
    msg.classList.add('visible');
    setTimeout(() => {
        msg.classList.remove('visible');
        setTimeout(() => { msg.hidden = true; }, 400);
    }, 2500);

    document.querySelectorAll('.card').forEach(card => {
        card.classList.add('celebrate');
        setTimeout(() => card.classList.remove('celebrate'), 800);
    });

    const streakNum = document.getElementById('perfectStreakNumber');
    streakNum.classList.add('pop');
    setTimeout(() => streakNum.classList.remove('pop'), 400);

    launchConfetti();
}

// ===== CONFETTI =====
function launchConfetti() {
    const container = document.getElementById('confettiContainer');
    const colors = ['#FFD6E0', '#FFE5B4', '#C1E1C1', '#C4D7FF', '#E8D5F5', '#B794D6'];
    const count = 25;

    for (let i = 0; i < count; i++) {
        const piece = document.createElement('div');
        piece.className = 'confetti-piece';
        piece.style.left = Math.random() * 100 + '%';
        piece.style.top = '-10px';
        piece.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
        piece.style.animationDelay = Math.random() * 0.5 + 's';
        piece.style.animationDuration = (1.5 + Math.random()) + 's';
        piece.style.width = (6 + Math.random() * 8) + 'px';
        piece.style.height = (6 + Math.random() * 8) + 'px';
        piece.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
        container.appendChild(piece);
    }

    setTimeout(() => { container.innerHTML = ''; }, 2500);
}

// ===== RENDER: PERFECT STREAK =====
function renderPerfectStreak() {
    const streak = calculatePerfectStreak(appData);
    const section = document.getElementById('perfectStreakSection');
    const num = document.getElementById('perfectStreakNumber');

    num.textContent = streak;

    if (streak > 0) {
        section.classList.add('has-streak');
    } else {
        section.classList.remove('has-streak');
    }
}

// ===== RENDER: TOKENS OVERVIEW =====
function renderTokensOverview() {
    const grid = document.getElementById('tokensGrid');
    grid.innerHTML = '';

    for (const cat of STREAK_CATEGORIES) {
        const tokens = calculateTokens(appData, cat.key);

        const card = document.createElement('div');
        card.className = 'token-card';
        card.dataset.category = cat.key;

        card.innerHTML = `
            <span class="token-card-emoji">${cat.emoji}</span>
            <div class="token-card-info">
                <span class="token-card-label">${cat.label}</span>
                <span class="token-card-count">${tokens.available} <span class="shield-small">🛡️</span></span>
            </div>
        `;

        grid.appendChild(card);
    }
}

// ===== RENDER: CALENDAR =====
function renderCalendar() {
    const section = document.getElementById('calendarSection');

    const year = currentCalendarDate.getFullYear();
    const month = currentCalendarDate.getMonth();

    document.getElementById('calendarTitle').textContent =
        `${MONTHS_NL[month].charAt(0).toUpperCase() + MONTHS_NL[month].slice(1)} ${year}`;

    const grid = document.getElementById('calendarGrid');
    grid.innerHTML = '';

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const totalDaysInMonth = lastDay.getDate();

    let startDow = firstDay.getDay() - 1;
    if (startDow < 0) startDow = 6;

    const todayKey = getTodayKey();
    const today = parseDate(todayKey);

    for (let i = 0; i < startDow; i++) {
        const empty = document.createElement('div');
        empty.className = 'calendar-day empty';
        grid.appendChild(empty);
    }

    for (let d = 1; d <= totalDaysInMonth; d++) {
        const date = new Date(year, month, d);
        const dateKey = getDateKey(date);
        const dayData = getDayData(appData, dateKey);
        const score = getDayScore(dayData);
        const perfect = isDayPerfect(dayData);
        const hasToken = dayHasTokenUsed(dayData);
        const isFuture = date > today;
        const isToday = dateKey === todayKey;
        const isSelected = selectedCalendarDay === dateKey;

        const cell = document.createElement('div');
        cell.className = 'calendar-day';

        if (isToday) cell.classList.add('today');
        if (isSelected) cell.classList.add('selected');
        if (isFuture) {
            cell.classList.add('future');
        } else {
            cell.classList.add(`score-${score}`);
        }

        cell.textContent = d;

        if (perfect && !isFuture) {
            const star = document.createElement('span');
            star.className = 'star-indicator';
            star.textContent = '⭐';
            cell.appendChild(star);
        }

        if (hasToken && !isFuture) {
            const indicator = document.createElement('span');
            indicator.className = 'token-indicator';
            indicator.textContent = '🛡️';
            cell.appendChild(indicator);
        }

        if (!isFuture) {
            cell.addEventListener('click', () => {
                if (selectedCalendarDay === dateKey) {
                    selectedCalendarDay = null;
                } else {
                    selectedCalendarDay = dateKey;
                }
                renderCalendar();
            });
        }

        grid.appendChild(cell);
    }

    renderDayDetailPanel();
}

// ===== RENDER: INLINE DAY DETAIL PANEL =====
function renderDayDetailPanel() {
    const panel = document.getElementById('dayDetailPanel');
    const title = document.getElementById('dayDetailTitle');
    const badge = document.getElementById('dayDetailBadge');
    const itemsContainer = document.getElementById('dayDetailItems');

    if (!selectedCalendarDay) {
        panel.hidden = true;
        return;
    }

    const dateKey = selectedCalendarDay;
    const dayData = getDayData(appData, dateKey);
    const score = getDayScore(dayData);
    const perfect = isDayPerfect(dayData);

    title.textContent = formatDateHeading(dateKey);

    if (perfect) {
        badge.textContent = '⭐ Perfecte dag!';
        badge.className = 'day-detail-badge';
    } else if (score > 0) {
        badge.textContent = `${score}/${STREAK_CATEGORIES.length}`;
        badge.className = 'day-detail-badge';
    } else {
        badge.textContent = '';
        badge.className = 'day-detail-badge empty-badge';
    }

    itemsContainer.innerHTML = '';

    for (const cat of CATEGORIES) {
        const catData = dayData && dayData[cat.key];
        const isChecked = catData && catData.checked;
        const hasStreak = cat.trackStreak !== false;
        const isTokenUsed = hasStreak && catData && catData.tokenUsed;

        let statusClass = 'item-unchecked';
        let statusIcon = '—';

        if (isTokenUsed) {
            statusClass = 'item-token';
            statusIcon = '🛡️';
        } else if (isChecked) {
            statusClass = 'item-checked';
            statusIcon = '✓';
        }

        const item = document.createElement('div');
        item.className = `day-detail-item ${statusClass}`;

        let actionsHtml = '';

        if (isChecked) {
            actionsHtml += `<button class="day-detail-action-btn" data-action="uncheck" data-cat="${cat.key}" data-date="${dateKey}">Uitvinken</button>`;
        } else if (!isTokenUsed) {
            actionsHtml += `<button class="day-detail-action-btn" data-action="check" data-cat="${cat.key}" data-date="${dateKey}">Aanvinken</button>`;
        }

        if (hasStreak && !isChecked && !isTokenUsed) {
            const tokens = calculateTokensForDay(appData, cat.key, dateKey);
            if (tokens.available > 0) {
                actionsHtml += `<button class="day-detail-token-btn" data-action="token" data-cat="${cat.key}" data-date="${dateKey}">🛡️</button>`;
            }
        }

        if (isTokenUsed) {
            actionsHtml += `<button class="day-detail-action-btn" data-action="remove-token" data-cat="${cat.key}" data-date="${dateKey}">Verwijder</button>`;
        }

        item.innerHTML = `
            <span class="day-detail-item-left">
                <span class="day-detail-item-status">${statusIcon}</span>
                <span class="day-detail-item-label">${cat.emoji} ${cat.label}</span>
            </span>
            <span class="day-detail-item-actions">${actionsHtml}</span>
        `;

        itemsContainer.appendChild(item);
    }

    itemsContainer.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', () => {
            const action = btn.dataset.action;
            const catKey = btn.dataset.cat;
            const date = btn.dataset.date;

            if (action === 'token') {
                openTokenModal(date, catKey);
                return;
            }

            handleDayDetailAction(action, date, catKey);
            renderAll();
        });
    });

    panel.hidden = false;
}

// ===== CALENDAR NAVIGATION =====
function setupCalendarNav() {
    document.getElementById('prevMonth').addEventListener('click', () => {
        selectedCalendarDay = null;
        currentCalendarDate.setMonth(currentCalendarDate.getMonth() - 1);
        renderCalendar();
    });

    document.getElementById('nextMonth').addEventListener('click', () => {
        selectedCalendarDay = null;
        currentCalendarDate.setMonth(currentCalendarDate.getMonth() + 1);
        renderCalendar();
    });
}

// ===== DAY DETAIL ACTIONS =====
function handleDayDetailAction(action, dateKey, catKey) {
    const day = ensureDayExists(appData, dateKey);

    switch (action) {
        case 'check':
            day[catKey].checked = true;
            break;
        case 'uncheck':
            day[catKey].checked = false;
            break;
        case 'remove-token':
            day[catKey].tokenUsed = false;
            break;
    }

    saveData(appData);
    renderAll();
}

// ===== TOKEN MODAL =====
let pendingTokenUse = null;

function openTokenModal(dateKey, catKey) {
    const modal = document.getElementById('tokenModal');
    const cat = CATEGORIES.find(c => c.key === catKey);
    const tokens = calculateTokens(appData, catKey);

    document.getElementById('tokenModalTitle').textContent = 'Cheat token gebruiken?';
    document.getElementById('tokenModalDesc').textContent =
        `Gebruik een token om "${cat.label}" te beschermen op ${formatDateHeading(dateKey)}.`;

    const shields = document.getElementById('tokenModalShields');
    shields.innerHTML = '';
    const maxShow = Math.max(tokens.available, 3);
    for (let i = 0; i < maxShow; i++) {
        const shield = document.createElement('span');
        shield.className = `shield-icon${i < tokens.available ? ' active' : ''}`;
        shield.textContent = '🛡️';
        shields.appendChild(shield);
    }

    pendingTokenUse = { dateKey, catKey };
    modal.showModal();
}

function setupTokenModal() {
    const modal = document.getElementById('tokenModal');

    document.getElementById('tokenCancel').addEventListener('click', () => {
        pendingTokenUse = null;
        modal.close();
    });

    document.getElementById('tokenUse').addEventListener('click', () => {
        if (pendingTokenUse) {
            const { dateKey, catKey } = pendingTokenUse;
            const day = ensureDayExists(appData, dateKey);
            day[catKey].tokenUsed = true;
            saveData(appData);
            renderAll();
            pendingTokenUse = null;
        }
        modal.close();
    });
}

// ===== RENDER ALL =====
function renderAll() {
    renderHeader();
    renderProgressRing();
    renderChecklist();
    renderPerfectStreak();
    renderTokensOverview();
    renderCalendar();
}

// ===== INIT =====
function init() {
    renderAll();
    setupCalendarNav();
    setupTokenModal();
    initFirebase();
}

document.addEventListener('DOMContentLoaded', init);
