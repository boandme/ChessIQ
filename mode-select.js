// ════════════════════════════════════════════════════════════════════════════
//  ChessIQ — Casual / Ranked mode picker
//
//  Shown once per session when a player arrives at the training page, so the
//  choice between training and competing is a deliberate one rather than an
//  accident of which link they happened to click. Eventually this is what the
//  landing page hands off to; until landing.html exists, index.html opens it.
//
//  Self-contained: injects its own markup and styles, no dependency on main.js.
// ════════════════════════════════════════════════════════════════════════════

const SESSION_KEY  = 'chessiq-mode-prompted';   // once per tab session
const LAST_MODE_KEY = 'chessiq-last-mode';      // remembered for the shortcut

function readLastMode() {
    try { return localStorage.getItem(LAST_MODE_KEY); } catch (_) { return null; }
}

function rememberMode(mode) {
    try { localStorage.setItem(LAST_MODE_KEY, mode); } catch (_) {}
}

function alreadyPrompted() {
    try { return sessionStorage.getItem(SESSION_KEY) === '1'; } catch (_) { return true; }
}

function markPrompted() {
    try { sessionStorage.setItem(SESSION_KEY, '1'); } catch (_) {}
}

const STYLES = `
#mode-select-modal {
    position: fixed; inset: 0; z-index: 9000;
    display: none; align-items: center; justify-content: center;
    padding: 24px;
    background: rgba(6, 6, 8, 0.78);
    backdrop-filter: blur(6px);
    animation: ms-fade 0.26s var(--ease-out, ease) both;
}
#mode-select-modal.open { display: flex; }
@keyframes ms-fade { from { opacity: 0; } to { opacity: 1; } }

.ms-shell {
    width: 100%; max-width: 860px;
    background: var(--surface, #121216);
    border: 1px solid var(--line, #26262e);
    border-top: 3px solid var(--yellow, #ffd400);
    border-radius: 12px;
    padding: 34px 30px 26px;
    animation: ms-rise 0.32s var(--ease-out, ease) both;
}
@keyframes ms-rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }

.ms-head { text-align: center; margin-bottom: 26px; }
.ms-eyebrow {
    font-family: var(--font-mono, monospace); font-size: 0.64rem; font-weight: 700;
    letter-spacing: 0.22em; text-transform: uppercase; color: var(--yellow, #ffd400);
}
.ms-head h2 {
    font-family: var(--font-display, sans-serif); font-size: 1.9rem;
    margin: 8px 0 6px; color: var(--text, #f3f3f5);
}
.ms-head p { margin: 0; color: var(--text-dim, #a5a5b2); font-size: 0.92rem; }

.ms-cards { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }

.ms-card {
    display: flex; flex-direction: column; gap: 12px;
    padding: 22px 20px;
    background: var(--surface-2, #17171c);
    border: 1px solid var(--line, #26262e);
    border-radius: 10px;
    cursor: pointer; text-align: left;
    text-decoration: none;
    transition: transform 0.2s var(--ease-snap, ease), border-color 0.2s ease, box-shadow 0.2s ease;
}
.ms-card:hover { transform: translateY(-3px); border-color: var(--yellow-line, rgba(255,212,0,0.3)); }
.ms-card-ranked:hover { box-shadow: 0 0 26px rgba(255, 212, 0, 0.22); border-color: var(--yellow, #ffd400); }

.ms-card-top { display: flex; align-items: center; gap: 10px; }
.ms-card-icon {
    display: inline-flex; align-items: center; justify-content: center;
    width: 36px; height: 36px; border-radius: 8px;
    background: var(--surface-3, #1d1d23); color: var(--text-dim, #a5a5b2);
}
.ms-card-ranked .ms-card-icon { background: var(--yellow-soft, rgba(255,212,0,0.14)); color: var(--yellow, #ffd400); }
.ms-card-icon svg { width: 19px; height: 19px; }
.ms-card h3 {
    margin: 0; font-family: var(--font-display, sans-serif);
    font-size: 1.25rem; color: var(--text, #f3f3f5);
}
.ms-badge {
    margin-left: auto; padding: 2px 9px; border-radius: 100px;
    font-family: var(--font-mono, monospace); font-size: 0.58rem; font-weight: 700;
    letter-spacing: 0.12em; text-transform: uppercase;
    background: var(--yellow-soft, rgba(255,212,0,0.14));
    border: 1px solid var(--yellow-line, rgba(255,212,0,0.3));
    color: var(--yellow, #ffd400);
}
.ms-badge-last { background: var(--surface-3, #1d1d23); border-color: var(--line-bright, #34343f); color: var(--text-faint, #6e6e7c); }

.ms-card p { margin: 0; font-size: 0.89rem; line-height: 1.55; color: var(--text-dim, #a5a5b2); }
.ms-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 5px; }
.ms-list li {
    display: flex; align-items: center; gap: 7px;
    font-size: 0.8rem; color: var(--text-faint, #6e6e7c);
    font-family: var(--font-mono, monospace);
}
.ms-list li::before { content: '\\2022'; color: var(--yellow, #ffd400); }

.ms-go {
    margin-top: auto; padding-top: 10px;
    font-family: var(--font-display, sans-serif); font-weight: 700;
    font-size: 0.82rem; letter-spacing: 0.08em; text-transform: uppercase;
    color: var(--text-dim, #a5a5b2);
    display: flex; align-items: center; gap: 7px;
}
.ms-card-ranked .ms-go { color: var(--yellow, #ffd400); }
.ms-card:hover .ms-go { gap: 11px; }

.ms-foot { margin-top: 20px; text-align: center; }
.ms-dismiss {
    background: none; border: 0; cursor: pointer;
    font-size: 0.78rem; color: var(--text-faint, #6e6e7c);
    text-decoration: underline; text-underline-offset: 3px;
}
.ms-dismiss:hover { color: var(--text, #f3f3f5); }

@media (max-width: 680px) {
    .ms-cards { grid-template-columns: 1fr; }
    .ms-shell { padding: 26px 20px 20px; }
}
`;

const MARKUP = lastMode => `
<div class="ms-shell" role="dialog" aria-modal="true" aria-labelledby="ms-title">
    <div class="ms-head">
        <div class="ms-eyebrow">Choose your session</div>
        <h2 id="ms-title">How do you want to train today?</h2>
        <p>Both modes use the same positions. Only one of them is holding a stopwatch.</p>
    </div>

    <div class="ms-cards">
        <a class="ms-card ms-card-casual" href="index.html" data-mode="casual">
            <div class="ms-card-top">
                <span class="ms-card-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20V10M18 20V4M6 20v-4"/></svg>
                </span>
                <h3>Casual</h3>
                ${lastMode === 'casual' ? '<span class="ms-badge ms-badge-last">Last played</span>' : ''}
            </div>
            <p>Take as long as you need. Every position comes with its full AI breakdown the moment you answer.</p>
            <ul class="ms-list">
                <li>No clock</li>
                <li>AI explanation after every position</li>
                <li>Builds your PR</li>
            </ul>
            <span class="ms-go">Train
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
            </span>
        </a>

        <a class="ms-card ms-card-ranked" href="ranked.html" data-mode="ranked">
            <div class="ms-card-top">
                <span class="ms-card-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L3 14h7l-1 8 11-13h-8l1-7z"/></svg>
                </span>
                <h3>Ranked</h3>
                ${lastMode === 'ranked'
                    ? '<span class="ms-badge ms-badge-last">Last played</span>'
                    : '<span class="ms-badge">New</span>'}
            </div>
            <p>Ten positions against the clock, solo or head-to-head. Explanations are locked until the review.</p>
            <ul class="ms-list">
                <li>15-30s per position</li>
                <li>Solo blitz or live duels</li>
                <li>Seasonal ladder, Pawn to Grandmaster</li>
            </ul>
            <span class="ms-go">Compete
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
            </span>
        </a>
    </div>

    <div class="ms-foot">
        <button type="button" class="ms-dismiss" data-dismiss>Keep me on Casual</button>
    </div>
</div>`;

function build() {
    if (document.getElementById('mode-select-modal')) return document.getElementById('mode-select-modal');

    const style = document.createElement('style');
    style.textContent = STYLES;
    document.head.appendChild(style);

    const modal = document.createElement('div');
    modal.id = 'mode-select-modal';
    modal.setAttribute('role', 'presentation');
    modal.innerHTML = MARKUP(readLastMode());
    document.body.appendChild(modal);

    modal.addEventListener('click', event => {
        if (event.target === modal) close();
        const dismiss = event.target.closest('[data-dismiss]');
        if (dismiss) { rememberMode('casual'); close(); }
        const card = event.target.closest('.ms-card');
        if (card) rememberMode(card.dataset.mode);
    });

    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && modal.classList.contains('open')) close();
    });

    return modal;
}

export function openModeSelect() {
    const modal = build();
    modal.classList.add('open');
    markPrompted();
}

export function close() {
    const modal = document.getElementById('mode-select-modal');
    if (modal) modal.classList.remove('open');
}

// Opens automatically on the first training-page view of a tab session. A
// player who has already made a choice this session is not asked twice.
export function maybeAutoOpen({ delayMs = 400 } = {}) {
    if (alreadyPrompted()) return;
    // A challenge link or a deep link means the player already decided.
    if (new URLSearchParams(location.search).has('duel')) { markPrompted(); return; }
    setTimeout(openModeSelect, delayMs);
}

window.openModeSelect  = openModeSelect;
window.closeModeSelect = close;
