import { get, ref, update } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-database.js";
import { canonicalizeThemeLabel } from "./theme-normalizer.js";

/**
 * ChessIQ Admin Control Center
 *
 * This module intentionally has no startup side effects. The homepage creates it
 * once, then calls syncAuthorization after Firebase Auth has resolved. The modal,
 * trigger, and all operational reads are rendered only for an authorized account.
 */

const BOOTSTRAP_ADMIN_USERNAMES = new Set(["boandmeog"]);
const BOOTSTRAP_COACH_USERNAMES = new Set(["coachmoses"]);
const ROLE_META = Object.freeze({
    og:    { label: "OG",          note: "Early-member recognition", tone: "gold" },
    coach: { label: "Chess Coach", note: "Expert chess contributor",  tone: "blue" },
    admin: { label: "Admin",       note: "Control Center access",     tone: "violet" },
});

const DIFFICULTY_ORDER = ["Easy", "Medium", "Hard"];
const BASELINE_BY_TIER = Object.freeze({ Easy: 2.5, Medium: 5, Hard: 8 });

const svg = {
    shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 4.5 6v5.4c0 4.7 3.2 8.9 7.5 9.9 4.3-1 7.5-5.2 7.5-9.9V6L12 3Z"/><path d="m9.1 12 1.9 1.9 4-4"/></svg>',
    users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 20v-1.6A4.4 4.4 0 0 0 11.6 14H7.4A4.4 4.4 0 0 0 3 18.4V20"/><circle cx="9.5" cy="7" r="3.4"/><path d="M17 10.4a3.2 3.2 0 0 0 0-6.2M21 20v-1.6a4.4 4.4 0 0 0-2.8-4.1"/></svg>',
    database: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><ellipse cx="12" cy="5" rx="7.5" ry="2.7"/><path d="M4.5 5v7c0 1.5 3.4 2.7 7.5 2.7s7.5-1.2 7.5-2.7V5"/><path d="M4.5 12v7c0 1.5 3.4 2.7 7.5 2.7s7.5-1.2 7.5-2.7v-7"/></svg>',
    layers: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 3 8.2 4.5L12 12 3.8 7.5 12 3Z"/><path d="m3.8 12 8.2 4.5 8.2-4.5"/><path d="m3.8 16.5 8.2 4.5 8.2-4.5"/></svg>',
    pulse: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12h4l2.1-5 4 10 2.2-5H21"/></svg>',
    refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11a8 8 0 0 0-14.9-3L3 10"/><path d="M3 4v6h6"/><path d="M4 13a8 8 0 0 0 14.9 3L21 14"/><path d="M21 20v-6h-6"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.3 4.3"/></svg>',
    warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.4 4.1 2.8 18a2 2 0 0 0 1.8 2.9h14.8a2 2 0 0 0 1.8-2.9L13.6 4.1a1.8 1.8 0 0 0-3.2 0Z"/><path d="M12 9v4.3M12 17h.01"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 10v5M12 7h.01"/></svg>',
    clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.2 2"/></svg>',
    chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
};

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>'"]/g, char => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
    }[char]));
}

function asNumber(value, fallback = 0) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
}

function formatNumber(value, fallback = "—") {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.round(numeric).toLocaleString() : fallback;
}

function formatOneDecimal(value, fallback = "—") {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric.toFixed(1) : fallback;
}

function formatPercent(numerator, denominator) {
    return denominator > 0 ? `${Math.round((numerator / denominator) * 100)}%` : "—";
}

function formatDate(timestamp) {
    const value = Number(timestamp);
    if (!Number.isFinite(value) || value <= 0) return "Not recorded";
    return new Intl.DateTimeFormat(undefined, {
        year: "numeric", month: "short", day: "numeric",
    }).format(new Date(value));
}

function formatRelativeTime(timestamp) {
    const value = Number(timestamp);
    if (!Number.isFinite(value) || value <= 0) return "Not recorded";
    const diff = Math.max(0, Date.now() - value);
    const days = Math.floor(diff / 86400000);
    if (days === 0) return "Today";
    if (days === 1) return "Yesterday";
    if (days < 30) return `${days}d ago`;
    if (days < 365) return `${Math.floor(days / 30)}mo ago`;
    return `${Math.floor(days / 365)}y ago`;
}

function formatDuration(seconds) {
    const minutes = Math.round(asNumber(seconds) / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

function hasExplicitRole(record, role) {
    return !!record?.roles && Object.prototype.hasOwnProperty.call(record.roles, role);
}

function normalizedUsername(record) {
    return String(record?.username || "").trim().toLowerCase();
}

function legacyOG(record) {
    const username = normalizedUsername(record);
    if (username === "shaurya") return true;
    if (username === "ronit" || username === "entyalt") return false;
    const createdAt = asNumber(record?.createdAt, 0);
    return createdAt >= Date.UTC(2025, 7, 1) && createdAt < Date.UTC(2026, 7, 2);
}

function effectiveRoles(record) {
    const username = normalizedUsername(record);
    const roles = record?.roles || {};
    const og = hasExplicitRole(record, "og") ? roles.og === true : legacyOG(record);
    const coach = hasExplicitRole(record, "coach")
        ? roles.coach === true
        : BOOTSTRAP_COACH_USERNAMES.has(username);
    const admin = hasExplicitRole(record, "admin")
        ? roles.admin === true
        : BOOTSTRAP_ADMIN_USERNAMES.has(username);
    return { og, coach, admin };
}

function initialRatingForPosition(position) {
    const tier = position?.Difficulty || "Medium";
    const baseline = BASELINE_BY_TIER[tier] ?? BASELINE_BY_TIER.Medium;
    const geminiRating = asNumber(position?.AIExplanation?.difficultyRating, NaN);
    return Number.isFinite(geminiRating) && geminiRating >= 1 && geminiRating <= 10
        ? (baseline * 0.75) + (geminiRating * 0.25)
        : baseline;
}

export function createAdminControlCenter({ db, getSession, getPositions }) {
    let modal = null;
    let cache = null;
    let activeTab = "overview";
    let usersQuery = "";
    let pendingAction = false;

    const getAuthorizedSession = () => {
        const session = getSession?.() || {};
        const account = session.account || {};
        const username = String(session.username || account.username || "").trim().toLowerCase();
        const roles = account.roles || {};
        const grantedByRole = roles.admin === true;
        const grantedByBootstrap = BOOTSTRAP_ADMIN_USERNAMES.has(username);
        const isAuthorized = !!session.user && !!session.uid && !session.isGuest && (grantedByRole || grantedByBootstrap);
        return { ...session, account, username, isAuthorized };
    };

    const removeControlCenter = () => {
        document.getElementById("admin-control-btn")?.remove();
        document.getElementById("admin-control-center")?.remove();
        document.body.classList.remove("admin-modal-open");
        modal = null;
        cache = null;
    };

    const ensureTrigger = () => {
        const session = getAuthorizedSession();
        const existing = document.getElementById("admin-control-btn");
        if (!session.isAuthorized) {
            existing?.remove();
            return false;
        }
        if (existing) return true;

        const controls = document.getElementById("header-controls");
        if (!controls) return false;
        const button = document.createElement("button");
        button.id = "admin-control-btn";
        button.type = "button";
        button.className = "icon-btn admin-control-btn";
        button.setAttribute("aria-label", "Open Admin Control Center");
        button.setAttribute("title", "Admin Control Center");
        button.innerHTML = `${svg.shield}<span class="admin-control-btn-pulse" aria-hidden="true"></span>`;
        button.addEventListener("click", open);
        const themeButton = document.getElementById("theme-btn");
        controls.insertBefore(button, themeButton || null);
        return true;
    };

    const ensureModal = () => {
        if (modal && document.body.contains(modal)) return modal;
        modal = document.createElement("div");
        modal.id = "admin-control-center";
        modal.className = "admin-modal-overlay";
        modal.setAttribute("role", "presentation");
        modal.innerHTML = `
            <section class="admin-modal-content" role="dialog" aria-modal="true" aria-labelledby="admin-center-title" tabindex="-1">
                <header class="admin-modal-header">
                    <div class="admin-modal-title-group">
                        <div class="admin-modal-emblem">${svg.shield}</div>
                        <div>
                            <div class="admin-kicker">Restricted operational workspace</div>
                            <h2 id="admin-center-title">Admin <span>Control Center</span></h2>
                            <p id="admin-center-subtitle">Preparing an on-demand operational snapshot…</p>
                        </div>
                    </div>
                    <div class="admin-modal-actions">
                        <button type="button" class="admin-icon-action" data-admin-action="refresh" title="Refresh dashboard data" aria-label="Refresh dashboard data">${svg.refresh}</button>
                        <button type="button" class="modal-close-btn" data-admin-action="close" aria-label="Close Admin Control Center">${svg.close}</button>
                    </div>
                </header>

                <div class="admin-session-bar">
                    <div class="admin-session-identity"><span class="admin-live-dot"></span><span id="admin-session-name">Authorized session</span></div>
                    <div class="admin-session-meta"><span>${svg.clock} <span id="admin-last-refresh">Not loaded</span></span><span class="admin-session-scope">ON-DEMAND DATA</span></div>
                </div>

                <nav class="admin-tabs" aria-label="Admin dashboard sections">
                    <button class="admin-tab is-active" type="button" data-admin-tab="overview">${svg.pulse}<span>Overview</span></button>
                    <button class="admin-tab" type="button" data-admin-tab="users">${svg.users}<span>Users</span><b id="admin-user-count-tab">0</b></button>
                    <button class="admin-tab" type="button" data-admin-tab="puzzles">${svg.database}<span>Puzzles</span></button>
                    <button class="admin-tab" type="button" data-admin-tab="themes">${svg.layers}<span>Themes</span></button>
                    <button class="admin-tab" type="button" data-admin-tab="health">${svg.shield}<span>System</span></button>
                </nav>

                <div class="admin-modal-scroll" id="admin-center-body" aria-live="polite">
                    ${renderLoadingState("Loading the control center")}
                </div>
            </section>`;

        modal.addEventListener("click", event => {
            if (event.target === modal) close();
        });
        modal.addEventListener("click", handleModalClick);
        modal.addEventListener("input", handleModalInput);
        document.body.appendChild(modal);
        return modal;
    };

    const open = async () => {
        const session = getAuthorizedSession();
        if (!session.isAuthorized) {
            removeControlCenter();
            return;
        }
        ensureTrigger();
        const dialog = ensureModal();
        dialog.classList.add("is-open");
        document.body.classList.add("admin-modal-open");
        dialog.querySelector(".admin-modal-content")?.focus();
        const sessionName = dialog.querySelector("#admin-session-name");
        if (sessionName) sessionName.textContent = `${session.account.username || session.username} · Admin session`;
        if (!cache) await loadDashboard(false);
        else renderActiveTab();
    };

    const close = () => {
        if (!modal) return;
        modal.classList.remove("is-open");
        document.body.classList.remove("admin-modal-open");
        // Cache is intentionally scoped to one open modal session. Reopening is
        // an explicit operator decision to read a fresh operational snapshot.
        cache = null;
        document.getElementById("admin-control-btn")?.focus();
    };

    const handleEscape = event => {
        if (event.key === "Escape" && modal?.classList.contains("is-open")) close();
    };
    document.addEventListener("keydown", handleEscape);

    const getPositionData = async force => {
        const loadedPositions = Array.isArray(getPositions?.()) ? getPositions() : [];
        if (!force && loadedPositions.length) return loadedPositions;
        const positionsSnapshot = await get(ref(db, "positions"));
        return positionsSnapshot.exists()
            ? Object.entries(positionsSnapshot.val()).map(([key, value]) => ({ ...value, _key: key }))
            : [];
    };

    const loadDashboard = async force => {
        const session = getAuthorizedSession();
        if (!session.isAuthorized || pendingAction) return;
        pendingAction = true;
        const body = modal?.querySelector("#admin-center-body");
        if (body) body.innerHTML = renderLoadingState(force ? "Refreshing operational data" : "Loading operational data");
        modal?.querySelector(".admin-icon-action[data-admin-action='refresh']")?.classList.add("is-loading");

        try {
            const [usersSnapshot, puzzleStatsSnapshot, positions] = await Promise.all([
                get(ref(db, "users")),
                get(ref(db, "puzzleStats")),
                getPositionData(force),
            ]);
            cache = buildDashboardSnapshot({
                users: usersSnapshot.exists() ? usersSnapshot.val() : {},
                puzzleStats: puzzleStatsSnapshot.exists() ? puzzleStatsSnapshot.val() : {},
                positions,
            });
            cache.loadedAt = Date.now();
            const refreshLabel = modal?.querySelector("#admin-last-refresh");
            if (refreshLabel) refreshLabel.textContent = `Refreshed ${new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(cache.loadedAt))}`;
            const subtitle = modal?.querySelector("#admin-center-subtitle");
            if (subtitle) subtitle.textContent = "Operational snapshot ready. Data is cached for this modal session until you refresh or reopen it.";
            const tabCount = modal?.querySelector("#admin-user-count-tab");
            if (tabCount) tabCount.textContent = formatNumber(cache.system.totalUsers, "0");
            renderActiveTab();
        } catch (error) {
            console.error("Admin dashboard could not load:", error);
            if (body) body.innerHTML = renderErrorState();
        } finally {
            pendingAction = false;
            modal?.querySelector(".admin-icon-action[data-admin-action='refresh']")?.classList.remove("is-loading");
        }
    };

    const buildDashboardSnapshot = ({ users, puzzleStats, positions }) => {
        const userRows = Object.entries(users || {}).map(([uid, raw]) => {
            const user = raw && typeof raw === "object" ? raw : {};
            const answered = asNumber(user.correctCount) + asNumber(user.wrongCount);
            return {
                uid,
                username: String(user.username || "Unnamed player"),
                email: String(user.email || ""),
                createdAt: asNumber(user.createdAt, 0),
                pr: asNumber(user.pr, 500),
                totalPuzzles: asNumber(user.totalPuzzles, 0),
                correctCount: asNumber(user.correctCount, 0),
                wrongCount: asNumber(user.wrongCount, 0),
                answered,
                accuracy: answered ? (asNumber(user.correctCount) / answered) * 100 : null,
                streak: asNumber(user.streak, 0),
                peakPR: asNumber(user.peakPR, asNumber(user.pr, 500)),
                lastActiveDate: user.lastActiveDate || "",
                playSeconds: asNumber(user?.achievements?.activity?.totalPlaySeconds, 0),
                achievementCount: Object.values(user?.achievements?.unlocked || {}).filter(Boolean).length,
                dailyEntries: Object.keys(user?.potd || {}).length,
                roles: effectiveRoles(user),
                roleState: user.roles && typeof user.roles === "object" ? user.roles : {},
            };
        }).sort((a, b) => b.pr - a.pr || b.totalPuzzles - a.totalPuzzles || a.username.localeCompare(b.username));
        userRows.forEach((user, index) => { user.rank = index + 1; });

        const system = {
            totalUsers: userRows.length,
            totalPuzzlesAttempted: userRows.reduce((sum, user) => sum + user.totalPuzzles, 0),
            totalCorrect: userRows.reduce((sum, user) => sum + user.correctCount, 0),
            totalAnswered: userRows.reduce((sum, user) => sum + user.answered, 0),
            totalPlaySeconds: userRows.reduce((sum, user) => sum + user.playSeconds, 0),
            totalAchievementUnlocks: userRows.reduce((sum, user) => sum + user.achievementCount, 0),
            totalDailyEntries: userRows.reduce((sum, user) => sum + user.dailyEntries, 0),
            activeLastSevenDays: userRows.filter(user => {
                if (!user.lastActiveDate) return false;
                const difference = Date.now() - new Date(`${user.lastActiveDate}T00:00:00Z`).getTime();
                return difference >= 0 && difference <= 7 * 86400000;
            }).length,
        };

        const positionRows = Array.isArray(positions) ? positions : [];
        const staticTiers = Object.fromEntries(DIFFICULTY_ORDER.map(tier => [tier, 0]));
        const themeCounts = new Map();
        let missingDifficulty = 0;
        let missingExplanation = 0;
        let missingThemes = 0;

        positionRows.forEach(position => {
            const difficulty = position?.Difficulty;
            if (Object.prototype.hasOwnProperty.call(staticTiers, difficulty)) staticTiers[difficulty]++;
            else missingDifficulty++;

            const explanation = position?.AIExplanation;
            if (!explanation || typeof explanation !== "object") {
                missingExplanation++;
                return;
            }
            const sourceThemes = Array.isArray(explanation.themes) ? explanation.themes : [];
            if (!sourceThemes.length) {
                missingThemes++;
                return;
            }
            const perPositionThemes = new Set();
            sourceThemes.forEach(rawTheme => {
                const canonical = canonicalizeThemeLabel(rawTheme);
                if (canonical?.key) perPositionThemes.add(`${canonical.key}|||${canonical.label}`);
            });
            if (!perPositionThemes.size) missingThemes++;
            perPositionThemes.forEach(entry => {
                const [key, label] = entry.split("|||");
                const record = themeCounts.get(key) || { key, label, count: 0 };
                record.count++;
                themeCounts.set(key, record);
            });
        });

        const allThemeRows = Array.from(themeCounts.values()).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
        const statRows = Object.entries(puzzleStats || {}).map(([key, raw]) => ({ key, ...(raw || {}) }));
        const usableRatings = statRows.filter(stat => Number.isFinite(Number(stat.rating)) && Number(stat.rating) >= 1 && Number(stat.rating) <= 10);
        const ratingBuckets = { "1–3": 0, "3–5": 0, "5–7": 0, "7–10": 0 };
        let highSample = 0;
        let lowSample = 0;
        let substantialShifts = 0;
        usableRatings.forEach(stat => {
            const rating = asNumber(stat.rating);
            const attempts = asNumber(stat.attempts);
            if (rating < 3) ratingBuckets["1–3"]++;
            else if (rating < 5) ratingBuckets["3–5"]++;
            else if (rating < 7) ratingBuckets["5–7"]++;
            else ratingBuckets["7–10"]++;
            if (attempts >= 20) highSample++;
            if (attempts > 0 && attempts < 3) lowSample++;
            const baseline = Number.isFinite(Number(stat.baselineUsed))
                ? Number(stat.baselineUsed)
                : BASELINE_BY_TIER[stat.baseDifficulty] ?? null;
            if (baseline !== null && Math.abs(rating - baseline) >= 0.75) substantialShifts++;
        });

        const positionSnapshot = {
            total: positionRows.length,
            staticTiers,
            missingDifficulty,
            missingExplanation,
            missingThemes,
            liveRatingRecords: usableRatings.length,
            averageLiveRating: usableRatings.length
                ? usableRatings.reduce((sum, stat) => sum + asNumber(stat.rating), 0) / usableRatings.length
                : null,
            lowestLiveRating: usableRatings.length ? Math.min(...usableRatings.map(stat => asNumber(stat.rating))) : null,
            highestLiveRating: usableRatings.length ? Math.max(...usableRatings.map(stat => asNumber(stat.rating))) : null,
            ratingBuckets,
            highSample,
            lowSample,
            substantialShifts,
            themeRows: allThemeRows,
            distinctThemes: allThemeRows.length,
            expectedBaselineAverage: positionRows.length
                ? positionRows.reduce((sum, position) => sum + initialRatingForPosition(position), 0) / positionRows.length
                : null,
        };

        const warnings = [];
        if (!positionRows.length) warnings.push({ type: "warning", title: "Position inventory unavailable", detail: "The positions branch could not be read for this session." });
        if (missingDifficulty) warnings.push({ type: "warning", title: `${missingDifficulty} position${missingDifficulty === 1 ? "" : "s"} missing a valid difficulty tier`, detail: "These records are excluded from Easy / Medium / Hard distribution totals." });
        if (missingExplanation) warnings.push({ type: "warning", title: `${missingExplanation} position${missingExplanation === 1 ? "" : "s"} missing AI explanation data`, detail: "Review this before depending on the learning-reflection flow for those records." });
        if (missingThemes) warnings.push({ type: "warning", title: `${missingThemes} position${missingThemes === 1 ? "" : "s"} without usable themes`, detail: "These puzzles are not represented in thematic training or theme analytics." });
        if (positionRows.length && positionSnapshot.distinctThemes !== 73) warnings.push({ type: "notice", title: `${positionSnapshot.distinctThemes} represented canonical themes in the current inventory`, detail: "ChessIQ’s target taxonomy has 73 canonical themes; this count reflects the currently loaded positions only." });
        if (!warnings.length) warnings.push({ type: "good", title: "No immediate schema gaps detected", detail: "All loaded positions expose a difficulty tier, AI explanation, and at least one canonical theme." });

        return { users: userRows, system, positions: positionSnapshot, warnings };
    };

    const renderActiveTab = () => {
        if (!modal || !cache) return;
        modal.querySelectorAll(".admin-tab").forEach(tab => tab.classList.toggle("is-active", tab.dataset.adminTab === activeTab));
        const body = modal.querySelector("#admin-center-body");
        if (!body) return;
        const renderers = {
            overview: renderOverview,
            users: renderUsers,
            puzzles: renderPuzzles,
            themes: renderThemes,
            health: renderHealth,
        };
        body.innerHTML = (renderers[activeTab] || renderOverview)(cache);
    };

    const renderOverview = data => {
        const { system, positions, warnings } = data;
        return `
            <div class="admin-section-heading">
                <div><span>Operational overview</span><h3>ChessIQ at a glance</h3></div>
                <p>Snapshot is loaded only while this workspace is open. Use refresh when you need a fresh read.</p>
            </div>
            <div class="admin-kpi-grid">
                ${renderKpi("Registered accounts", formatNumber(system.totalUsers), svg.users, "Live user records")}
                ${renderKpi("Puzzle inventory", formatNumber(positions.total), svg.database, "Available positions")}
                ${renderKpi("All-time attempts", formatNumber(system.totalPuzzlesAttempted), svg.chart, "Stored player totals")}
                ${renderKpi("Overall accuracy", formatPercent(system.totalCorrect, system.totalAnswered), svg.pulse, `${formatNumber(system.totalAnswered)} scored answers`)}
                ${renderKpi("7-day active", formatNumber(system.activeLastSevenDays), svg.clock, "Based on last activity date")}
                ${renderKpi("Themes represented", formatNumber(positions.distinctThemes), svg.layers, "Canonical taxonomy coverage")}
            </div>
            <div class="admin-dashboard-grid">
                <section class="admin-panel admin-panel--wide">
                    <div class="admin-panel-head"><div><span>Training inventory</span><h4>Difficulty balance</h4></div><b>${formatNumber(positions.total)} total</b></div>
                    <div class="admin-tier-layout">
                        <div class="admin-tier-bars">${DIFFICULTY_ORDER.map(tier => renderTierBar(tier, positions.staticTiers[tier], positions.total)).join("")}</div>
                        <div class="admin-rating-summary">
                            <div><span>Live rating average</span><strong>${formatOneDecimal(positions.averageLiveRating)}<small>/10</small></strong></div>
                            <div><span>Live record coverage</span><strong>${formatNumber(positions.liveRatingRecords)}<small> rated</small></strong></div>
                            <div><span>Baseline average</span><strong>${formatOneDecimal(positions.expectedBaselineAverage)}<small>/10</small></strong></div>
                        </div>
                    </div>
                </section>
                <section class="admin-panel">
                    <div class="admin-panel-head"><div><span>Data health</span><h4>Attention queue</h4></div><button type="button" class="admin-text-button" data-admin-tab="health">View system</button></div>
                    <div class="admin-health-mini-list">${warnings.slice(0, 3).map(renderWarning).join("")}</div>
                </section>
            </div>
            <div class="admin-dashboard-grid admin-dashboard-grid--lower">
                <section class="admin-panel">
                    <div class="admin-panel-head"><div><span>People</span><h4>Engagement summary</h4></div><button type="button" class="admin-text-button" data-admin-tab="users">Manage users</button></div>
                    <dl class="admin-stat-list">
                        ${renderStatLine("Leaderboard population", formatNumber(system.totalUsers))}
                        ${renderStatLine("Achievement unlocks", formatNumber(system.totalAchievementUnlocks))}
                        ${renderStatLine("Daily puzzle entries", formatNumber(system.totalDailyEntries))}
                        ${renderStatLine("Tracked training time", formatDuration(system.totalPlaySeconds))}
                    </dl>
                </section>
                <section class="admin-panel">
                    <div class="admin-panel-head"><div><span>Curriculum</span><h4>Theme concentration</h4></div><button type="button" class="admin-text-button" data-admin-tab="themes">View themes</button></div>
                    <div class="admin-theme-mini-list">${positions.themeRows.slice(0, 4).map((theme, index) => renderThemeLine(theme, positions.total, index + 1)).join("") || renderEmpty("No themed positions loaded.")}</div>
                </section>
            </div>`;
    };

    const renderUsers = data => {
        const query = usersQuery.trim().toLowerCase();
        const users = query
            ? data.users.filter(user => `${user.username} ${user.email} ${user.uid}`.toLowerCase().includes(query))
            : data.users;
        return `
            <div class="admin-section-heading admin-section-heading--users">
                <div><span>Accounts</span><h3>User management</h3></div>
                <p>Recognition badges are explicit role overrides when set; legacy OG and Chess Coach recognition remains intact until changed here.</p>
            </div>
            <section class="admin-panel admin-users-panel">
                <div class="admin-users-toolbar">
                    <label class="admin-search"><span>${svg.search}</span><input id="admin-user-search" type="search" placeholder="Search username, email, or ID" value="${escapeHTML(usersQuery)}" autocomplete="off"></label>
                    <div class="admin-toolbar-summary"><strong>${formatNumber(users.length)}</strong> of ${formatNumber(data.users.length)} accounts</div>
                </div>
                <div class="admin-role-key">
                    <span>Assignable recognition</span>
                    ${Object.entries(ROLE_META).map(([key, role]) => `<i class="admin-role-chip admin-role-chip--${role.tone}">${role.label}</i>`).join("")}
                </div>
                <div class="admin-users-table-wrap">
                    <table class="admin-users-table">
                        <thead><tr><th>Player</th><th>PR</th><th>Training</th><th>Activity</th><th>Rank</th><th>Recognition &amp; access</th></tr></thead>
                        <tbody>${users.length ? users.map(renderUserRow).join("") : `<tr><td colspan="6">${renderEmpty("No accounts match this search.")}</td></tr>`}</tbody>
                    </table>
                </div>
                <div class="admin-destruction-note">${svg.info}<span><strong>Account deletion is intentionally unavailable from this client dashboard.</strong> Removing another person’s Firebase Authentication account requires a trusted server-side Admin SDK workflow; a browser-only control would not be a safe implementation.</span></div>
            </section>`;
    };

    const renderPuzzles = data => {
        const { positions } = data;
        const bucketTotal = Object.values(positions.ratingBuckets).reduce((sum, value) => sum + value, 0);
        return `
            <div class="admin-section-heading"><div><span>Position database</span><h3>Puzzle intelligence</h3></div><p>Dynamic ratings are read from existing <code>puzzleStats/</code> records only; no stats are initialized or written by this view.</p></div>
            <div class="admin-kpi-grid admin-kpi-grid--four">
                ${renderKpi("Total positions", formatNumber(positions.total), svg.database, "Firebase positions branch")}
                ${renderKpi("Average live rating", `${formatOneDecimal(positions.averageLiveRating)} / 10`, svg.chart, `${formatNumber(positions.liveRatingRecords)} active records`) }
                ${renderKpi("Lowest → highest", positions.liveRatingRecords ? `${formatOneDecimal(positions.lowestLiveRating)} → ${formatOneDecimal(positions.highestLiveRating)}` : "—", svg.pulse, "Dynamic rating span")}
                ${renderKpi("Material shifts", formatNumber(positions.substantialShifts), svg.warning, "≥ 0.75 from baseline")}
            </div>
            <div class="admin-dashboard-grid">
                <section class="admin-panel admin-panel--wide">
                    <div class="admin-panel-head"><div><span>Static classification</span><h4>Difficulty distribution</h4></div><b>${formatNumber(positions.total)} positions</b></div>
                    <div class="admin-tier-bars admin-tier-bars--large">${DIFFICULTY_ORDER.map(tier => renderTierBar(tier, positions.staticTiers[tier], positions.total)).join("")}</div>
                    <div class="admin-panel-foot">Static tiers describe the source dataset. Live ratings evolve separately through community performance and player-PR context.</div>
                </section>
                <section class="admin-panel">
                    <div class="admin-panel-head"><div><span>Adaptive records</span><h4>Rating distribution</h4></div><b>${formatNumber(bucketTotal)} rated</b></div>
                    <div class="admin-rating-buckets">${Object.entries(positions.ratingBuckets).map(([label, count]) => renderBucket(label, count, bucketTotal)).join("")}</div>
                </section>
            </div>
            <div class="admin-dashboard-grid admin-dashboard-grid--lower">
                <section class="admin-panel">
                    <div class="admin-panel-head"><div><span>Confidence</span><h4>Sample quality</h4></div></div>
                    <dl class="admin-stat-list">
                        ${renderStatLine("High-sample puzzles", `${formatNumber(positions.highSample)} · 20+ attempts`)}
                        ${renderStatLine("Early-sample puzzles", `${formatNumber(positions.lowSample)} · 1–2 attempts`)}
                        ${renderStatLine("Unrated inventory", `${formatNumber(Math.max(0, positions.total - positions.liveRatingRecords))} records`)}
                    </dl>
                </section>
                <section class="admin-panel">
                    <div class="admin-panel-head"><div><span>Coverage</span><h4>AI data checks</h4></div></div>
                    <dl class="admin-stat-list">
                        ${renderStatLine("Missing explanations", formatNumber(positions.missingExplanation))}
                        ${renderStatLine("Missing usable themes", formatNumber(positions.missingThemes))}
                        ${renderStatLine("Missing difficulty tier", formatNumber(positions.missingDifficulty))}
                    </dl>
                </section>
            </div>`;
    };

    const renderThemes = data => {
        const { positions } = data;
        const topThemes = positions.themeRows.slice(0, 12);
        const leastThemes = positions.themeRows.slice(-5).reverse();
        return `
            <div class="admin-section-heading"><div><span>AI taxonomy</span><h3>Thematic coverage</h3></div><p>Counts reflect how many positions contain each canonical theme, with each theme counted once per position.</p></div>
            <div class="admin-kpi-grid admin-kpi-grid--four">
                ${renderKpi("Canonical themes", formatNumber(positions.distinctThemes), svg.layers, "Represented in current inventory")}
                ${renderKpi("Most common", escapeHTML(topThemes[0]?.label || "—"), svg.chart, topThemes[0] ? `${formatNumber(topThemes[0].count)} positions` : "No data")}
                ${renderKpi("Least represented", escapeHTML(leastThemes[0]?.label || "—"), svg.pulse, leastThemes[0] ? `${formatNumber(leastThemes[0].count)} positions` : "No data")}
                ${renderKpi("Theme coverage", positions.total ? `${Math.round((positions.themeRows.reduce((sum, theme) => sum + theme.count, 0) / positions.total) * 10) / 10}×` : "—", svg.database, "Average tags per position")}
            </div>
            <div class="admin-dashboard-grid">
                <section class="admin-panel admin-panel--wide">
                    <div class="admin-panel-head"><div><span>Distribution</span><h4>Most represented themes</h4></div><b>Top ${Math.min(12, topThemes.length)}</b></div>
                    <div class="admin-theme-chart">${topThemes.length ? topThemes.map((theme, index) => renderThemeLine(theme, positions.total, index + 1, true)).join("") : renderEmpty("No canonical theme information is available.")}</div>
                </section>
                <section class="admin-panel">
                    <div class="admin-panel-head"><div><span>Long tail</span><h4>Least represented</h4></div></div>
                    <div class="admin-theme-mini-list">${leastThemes.length ? leastThemes.map((theme, index) => renderThemeLine(theme, positions.total, positions.themeRows.length - index)).join("") : renderEmpty("No canonical theme information is available.")}</div>
                    <div class="admin-panel-foot">Use low-frequency themes to identify opportunities for future position sourcing, not as a measure of learning quality on their own.</div>
                </section>
            </div>`;
    };

    const renderHealth = data => `
        <div class="admin-section-heading"><div><span>Operational safeguards</span><h3>System &amp; data health</h3></div><p>Only reliable metrics are surfaced. Unavailable records are called out instead of estimated.</p></div>
        <div class="admin-health-layout">
            <section class="admin-panel admin-panel--wide">
                <div class="admin-panel-head"><div><span>Data checks</span><h4>Current attention queue</h4></div><b>${data.warnings.filter(warning => warning.type === "warning").length} action item${data.warnings.filter(warning => warning.type === "warning").length === 1 ? "" : "s"}</b></div>
                <div class="admin-health-list">${data.warnings.map(renderWarning).join("")}</div>
            </section>
            <section class="admin-panel admin-security-panel">
                <div class="admin-panel-head"><div><span>Authorization</span><h4>Control-center safeguards</h4></div>${svg.shield}</div>
                <ul class="admin-security-list">
                    <li><span>01</span><div><strong>Conditional rendering</strong><p>The trigger and modal are created only after an authenticated Admin session is verified.</p></div></li>
                    <li><span>02</span><div><strong>Action re-check</strong><p>Every refresh and role mutation validates the active Admin session again before touching Firebase.</p></div></li>
                    <li><span>03</span><div><strong>On-demand loading</strong><p>No dashboard data is read or polled during ordinary puzzle play or for non-admin accounts.</p></div></li>
                    <li><span>04</span><div><strong>Server-side rule required</strong><p>Deploy matching Firebase Rules or a trusted Admin SDK endpoint before relying on browser authorization for production-sensitive writes.</p></div></li>
                </ul>
            </section>
        </div>`;

    const renderKpi = (label, value, icon, note) => `
        <article class="admin-kpi-card"><div class="admin-kpi-icon">${icon}</div><div><span>${label}</span><strong>${value}</strong><small>${note}</small></div></article>`;

    const renderTierBar = (tier, count, total) => {
        const percentage = total ? Math.round((count / total) * 100) : 0;
        return `<div class="admin-tier-row"><div class="admin-tier-label"><span class="admin-tier-dot admin-tier-dot--${tier.toLowerCase()}"></span><strong>${tier}</strong><b>${formatNumber(count)}</b></div><div class="admin-progress-track"><span class="admin-progress-fill admin-progress-fill--${tier.toLowerCase()}" style="width:${percentage}%"></span></div><em>${percentage}%</em></div>`;
    };

    const renderBucket = (label, count, total) => {
        const percentage = total ? Math.round((count / total) * 100) : 0;
        return `<div class="admin-bucket"><div><strong>${label}</strong><span>${formatNumber(count)} puzzles</span></div><div class="admin-progress-track"><span class="admin-progress-fill" style="width:${percentage}%"></span></div><b>${percentage}%</b></div>`;
    };

    const renderThemeLine = (theme, total, rank, large = false) => {
        const percentage = total ? Math.max(3, (theme.count / total) * 100) : 0;
        return `<div class="admin-theme-line ${large ? "admin-theme-line--large" : ""}"><span class="admin-theme-rank">${rank}</span><div class="admin-theme-name"><strong>${escapeHTML(theme.label)}</strong><div class="admin-progress-track"><span class="admin-progress-fill" style="width:${percentage}%"></span></div></div><b>${formatNumber(theme.count)}</b><em>${total ? Math.round((theme.count / total) * 100) : 0}%</em></div>`;
    };

    const renderStatLine = (label, value) => `<div><span>${label}</span><strong>${value}</strong></div>`;

    const renderWarning = warning => `<div class="admin-health-item admin-health-item--${warning.type}"><i>${warning.type === "good" ? svg.shield : warning.type === "notice" ? svg.info : svg.warning}</i><div><strong>${escapeHTML(warning.title)}</strong><p>${escapeHTML(warning.detail)}</p></div></div>`;

    const renderUserRow = user => {
        const roleButtons = Object.entries(ROLE_META).map(([roleKey, role]) => {
            const isActive = user.roles[roleKey];
            const explicit = hasExplicitRole({ roles: user.roleState }, roleKey);
            const title = `${isActive ? "Remove" : "Assign"} ${role.label}${explicit ? " override" : ""}`;
            return `<button type="button" class="admin-role-toggle admin-role-toggle--${role.tone} ${isActive ? "is-active" : ""}" data-admin-action="toggle-role" data-user-id="${escapeHTML(user.uid)}" data-role="${roleKey}" data-enabled="${isActive ? "true" : "false"}" title="${escapeHTML(title)}" aria-pressed="${isActive ? "true" : "false"}">${escapeHTML(role.label)}</button>`;
        }).join("");
        const accuracy = user.accuracy === null ? "—" : `${Math.round(user.accuracy)}%`;
        return `<tr>
            <td><div class="admin-user-cell"><div class="admin-user-initial">${escapeHTML(user.username.slice(0, 1).toUpperCase() || "?")}</div><div><strong>${escapeHTML(user.username)}</strong><span>${escapeHTML(user.email || "No email stored")}</span><small>Joined ${formatDate(user.createdAt)}</small></div></div></td>
            <td><strong class="admin-pr">${formatNumber(user.pr)}</strong><span class="admin-submetric">Peak ${formatNumber(user.peakPR)}</span></td>
            <td><strong>${formatNumber(user.totalPuzzles)}</strong><span class="admin-submetric">${accuracy} accuracy</span></td>
            <td><strong>${formatRelativeTime(user.lastActiveDate ? Date.parse(`${user.lastActiveDate}T00:00:00Z`) : 0)}</strong><span class="admin-submetric">${formatDuration(user.playSeconds)} tracked</span></td>
            <td><span class="admin-rank">#${user.rank}</span><span class="admin-submetric">${formatNumber(user.achievementCount)} unlocks</span></td>
            <td><div class="admin-role-controls">${roleButtons}</div></td>
        </tr>`;
    };

    const renderEmpty = message => `<div class="admin-empty-state">${svg.info}<span>${escapeHTML(message)}</span></div>`;
    const renderLoadingState = message => `<div class="admin-loading-state"><span class="admin-loader"></span><div><strong>${escapeHTML(message)}</strong><p>Fetching the smallest set of operational records needed for this view.</p></div></div>`;
    const renderErrorState = () => `<div class="admin-error-state">${svg.warning}<div><h3>Unable to load the control center</h3><p>Check Firebase connectivity and your database permissions, then try a manual refresh.</p><button type="button" class="got-it-btn" data-admin-action="refresh">Try again</button></div></div>`;

    const handleModalInput = event => {
        if (event.target?.id !== "admin-user-search") return;
        usersQuery = event.target.value || "";
        if (!cache) return;
        const selectionStart = event.target.selectionStart;
        renderActiveTab();
        const refreshedInput = modal?.querySelector("#admin-user-search");
        if (refreshedInput) {
            refreshedInput.focus();
            refreshedInput.setSelectionRange(selectionStart, selectionStart);
        }
    };

    const toggleRole = async button => {
        const session = getAuthorizedSession();
        if (!session.isAuthorized || pendingAction || !cache) return;
        const uid = button.dataset.userId;
        const role = button.dataset.role;
        const currentlyEnabled = button.dataset.enabled === "true";
        if (!uid || !ROLE_META[role]) return;

        const target = cache.users.find(user => user.uid === uid);
        const nextEnabled = !currentlyEnabled;
        if (role === "admin" && nextEnabled) {
            const targetName = target?.username || "this account";
            if (!window.confirm(`Grant Admin access to ${targetName}? This enables the Control Center for that account once Firebase Rules also permit it.`)) return;
        }
        if (role === "admin" && !nextEnabled && uid === session.uid) {
            if (!window.confirm("Remove the stored Admin role from your own account? The bootstrap administrator remains available for this release, but production access should be managed through secured roles.")) return;
        }

        pendingAction = true;
        button.disabled = true;
        button.classList.add("is-pending");
        try {
            // One last authorization check immediately before this privileged write.
            if (!getAuthorizedSession().isAuthorized) throw new Error("Admin authorization is no longer valid.");
            await update(ref(db, `users/${uid}/roles`), { [role]: nextEnabled });
            const current = target?.roleState || {};
            target.roleState = { ...current, [role]: nextEnabled };
            target.roles = effectiveRoles({ username: target?.username, createdAt: target?.createdAt, roles: target.roleState });
            renderActiveTab();
        } catch (error) {
            console.error("Admin role update failed:", error);
            window.alert("The role change could not be saved. Confirm that Firebase Rules allow this protected operation.");
            button.disabled = false;
            button.classList.remove("is-pending");
        } finally {
            pendingAction = false;
        }
    };

    const handleModalClick = async event => {
        const button = event.target.closest("[data-admin-action], [data-admin-tab]");
        if (!button) return;
        if (button.dataset.adminTab) {
            activeTab = button.dataset.adminTab;
            renderActiveTab();
            return;
        }
        switch (button.dataset.adminAction) {
            case "close": close(); break;
            case "refresh": await loadDashboard(true); break;
            case "toggle-role": await toggleRole(button); break;
            default: break;
        }
    };

    return {
        syncAuthorization(account) {
            const session = getSession?.() || {};
            if (!session.user || !session.uid || session.isGuest) {
                removeControlCenter();
                return;
            }
            // The canonical user data from the auth read is held by main.js.
            // It is passed through the session getter, so this argument is only
            // retained for a future explicit role-cache refresh.
            void account;
            ensureTrigger();
        },
        open,
        close,
        refresh: () => loadDashboard(true),
    };
}
