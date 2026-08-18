// ════════════════════════════════════════════════════════════════════════════
//  ChessIQ — Experience layer
//  • three.js ambient scene: matte 3D chess pieces with yellow rim lighting
//  • page-to-page transition wipe
//  • on-load entrance reveals
//  • shared Daily Puzzle access for non-home pages (kept separate from main.js)
// ════════════════════════════════════════════════════════════════════════════

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { initializeApp, getApp, getApps } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js';
import { getDatabase, ref, get, set, onValue } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-database.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js';

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ────────────────────────────────────────────────────────────────────────────
   1. ENTRANCE REVEALS
   ──────────────────────────────────────────────────────────────────────────── */
(function reveals() {
    const els = document.querySelectorAll('.reveal');
    if (!els.length) return;
    if (reduceMotion) { els.forEach(e => e.classList.add('in')); return; }

    const io = new IntersectionObserver((entries, obs) => {
        let i = 0;
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const el = entry.target;
                el.classList.add('d' + Math.min(i, 2), 'in');
                i++;
                obs.unobserve(el);
            }
        });
    }, { threshold: 0.12 });

    els.forEach(el => io.observe(el));
})();

/* ────────────────────────────────────────────────────────────────────────────
   2. PAGE TRANSITIONS
   On load: content fades in via the existing .reveal observer below.
   Links navigate natively — no full-screen cover, no artificial delay.
   ──────────────────────────────────────────────────────────────────────────── */
(function pageTransitions() {
    const pt = document.getElementById('page-transition');

    // The full-screen cover/wipe was producing a visible black flash on every
    // navigation (its color matches the page's own near-black background, so
    // any gap before the new page paints reads as a "blank black page").
    // Disable it completely — never shown, never intercepts clicks.
    if (pt) {
        pt.classList.remove('cover', 'reveal');
        pt.style.display = 'none';
    }

    // Internal links are left to navigate the normal, native browser way —
    // no preventDefault, no setTimeout delay. This is what makes navigation
    // feel instant and "tab-like" rather than gated behind an animation.
    // Content fade-in is already handled by the .reveal IntersectionObserver
    // above, which is unaffected by this change.
})();

/* ────────────────────────────────────────────────────────────────────────────
   3. THREE.JS AMBIENT SCENE
   Lathe-built chess pieces (rotationally symmetric) drifting in dark space,
   lit by warm yellow key + rim lights for that matte, premium finish.
   ──────────────────────────────────────────────────────────────────────────── */
(function ambientScene() {
    const canvas = document.getElementById('bg-canvas');
    if (!canvas || reduceMotion) return;

    let renderer;
    try {
        renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    } catch (err) { return; }   // no WebGL — silently skip, CSS background still looks good

    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));

    const scene  = new THREE.Scene();
    scene.fog    = new THREE.FogExp2(0x08080a, 0.045);

    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.set(0, 0, 17);

    // ── Lighting: dark room, warm yellow key + cool fill + rim ────────────────
    scene.add(new THREE.AmbientLight(0x202024, 0.7));

    const key = new THREE.PointLight(0xffd400, 90, 60, 2);
    key.position.set(-9, 8, 10);
    scene.add(key);

    const rim = new THREE.PointLight(0xffe24d, 55, 60, 2);
    rim.position.set(11, -6, 6);
    scene.add(rim);

    const fill = new THREE.DirectionalLight(0x3a3a48, 1.1);
    fill.position.set(4, 6, -8);
    scene.add(fill);

    // subtle moving "spotlight" that grazes the pieces
    const spark = new THREE.PointLight(0xfff2a0, 40, 40, 2);
    scene.add(spark);

    // ── Materials: matte dark with a touch of sheen ───────────────────────────
    const matBody = new THREE.MeshStandardMaterial({ color: 0x16161b, roughness: 0.52, metalness: 0.35 });
    const matGold = new THREE.MeshStandardMaterial({ color: 0x1c1c14, roughness: 0.32, metalness: 0.7,
                                                     emissive: 0x2a2200, emissiveIntensity: 0.4 });

    // ── Lathe profiles (x = radius, y = height), centred on origin ────────────
    function lathe(profile, segments = 48) {
        const pts = profile.map(([x, y]) => new THREE.Vector2(x, y));
        return new THREE.LatheGeometry(pts, segments);
    }

    function pawnGeo() {
        return lathe([
            [0.00, -1.4],[0.95, -1.4],[0.95, -1.2],[0.55, -1.05],[0.5, -0.5],
            [0.62, -0.35],[0.42, 0.0],[0.3, 0.35],[0.55, 0.55],[0.55, 0.75],
            [0.0, 1.15]
        ]);
    }
    function rookGeo() {
        return lathe([
            [0.0, -1.5],[1.0, -1.5],[1.0, -1.25],[0.6, -1.1],[0.5, 0.4],
            [0.62, 0.7],[0.85, 0.85],[0.85, 1.25],[0.62, 1.25],[0.62, 1.05],
            [0.0, 1.05]
        ]);
    }
    function bishopGeo() {
        return lathe([
            [0.0, -1.55],[1.0, -1.55],[1.0, -1.3],[0.6, -1.15],[0.5, 0.1],
            [0.78, 0.45],[0.4, 0.85],[0.5, 1.15],[0.28, 1.5],[0.0, 1.78]
        ]);
    }
    function kingGeo() {
        return lathe([
            [0.0, -1.7],[1.1, -1.7],[1.1, -1.42],[0.65, -1.25],[0.52, 0.4],
            [0.82, 0.7],[0.95, 1.0],[0.55, 1.25],[0.55, 1.55],[0.0, 1.7]
        ]);
    }
    function queenGeo() {
        return lathe([
            [0.0, -1.65],[1.05, -1.65],[1.05, -1.4],[0.62, -1.25],[0.5, 0.45],
            [0.85, 0.8],[0.5, 1.15],[0.62, 1.45],[0.3, 1.7],[0.0, 1.85]
        ]);
    }

    const geos = [pawnGeo(), rookGeo(), bishopGeo(), kingGeo(), queenGeo()];

    // ── Build a constellation of floating pieces ──────────────────────────────
    const pieces = [];
    const COUNT = window.innerWidth < 760 ? 5 : 8;

    for (let i = 0; i < COUNT; i++) {
        const geo = geos[i % geos.length];
        const useGold = i % 4 === 0;
        const mesh = new THREE.Mesh(geo, useGold ? matGold : matBody);

        const spread = 11;
        mesh.position.set(
            (Math.random() - 0.5) * spread * 1.9,
            (Math.random() - 0.5) * spread * 1.2,
            (Math.random() - 0.5) * 9 - 3
        );
        const s = 0.7 + Math.random() * 0.9;
        mesh.scale.setScalar(s);
        mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, (Math.random() - 0.5) * 0.5);

        mesh.userData = {
            spin: (Math.random() - 0.5) * 0.22,
            bobAmp: 0.4 + Math.random() * 0.6,
            bobSpeed: 0.4 + Math.random() * 0.6,
            phase: Math.random() * Math.PI * 2,
            baseY: mesh.position.y,
            depth: (mesh.position.z + 8) / 16     // for parallax weighting
        };
        scene.add(mesh);
        pieces.push(mesh);
    }

    // ── Pointer parallax ──────────────────────────────────────────────────────
    const target = { x: 0, y: 0 };
    const cur    = { x: 0, y: 0 };
    window.addEventListener('pointermove', (e) => {
        target.x = (e.clientX / window.innerWidth  - 0.5);
        target.y = (e.clientY / window.innerHeight - 0.5);
    }, { passive: true });

    // ── Resize ────────────────────────────────────────────────────────────────
    function resize() {
        const w = window.innerWidth, h = window.innerHeight;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
    }
    window.addEventListener('resize', resize);
    resize();

    // ── Render loop (pauses when tab hidden) ──────────────────────────────────
    const clock = new THREE.Clock();
    let running = true;
    document.addEventListener('visibilitychange', () => {
        running = !document.hidden;
        if (running) { clock.start(); animate(); }
    });

    function animate() {
        if (!running) return;
        requestAnimationFrame(animate);
        const t  = clock.getElapsedTime();
        const dt = Math.min(clock.getDelta(), 0.05);

        cur.x += (target.x - cur.x) * 0.05;
        cur.y += (target.y - cur.y) * 0.05;

        for (const m of pieces) {
            const u = m.userData;
            m.rotation.y += u.spin * dt;
            m.rotation.x += u.spin * 0.4 * dt;
            m.position.y = u.baseY + Math.sin(t * u.bobSpeed + u.phase) * u.bobAmp * 0.4;
        }

        // parallax: shift camera opposite to pointer
        camera.position.x += (cur.x * 3 - camera.position.x) * 0.06;
        camera.position.y += (-cur.y * 2 - camera.position.y) * 0.06;
        camera.lookAt(0, 0, 0);

        // travelling spotlight
        spark.position.set(Math.sin(t * 0.4) * 9, Math.cos(t * 0.3) * 6, 8);

        renderer.render(scene, camera);
    }
    animate();
})();


/* ────────────────────────────────────────────────────────────────────────────
   4. SHARED DAILY PUZZLE
   Loaded on Information, Credits, and Leaderboard. The home page keeps its
   dedicated implementation in main.js, so this never runs where #main-game is
   present. Keeping this here removes a fragile dependency on an extra script
   file when deploying the existing page set.
   ──────────────────────────────────────────────────────────────────────────── */
(function sharedDailyPuzzle() {
    if (document.getElementById('main-game') || !document.getElementById('potd-nav-btn')) return;

    const firebaseConfig = {
        apiKey:            'AIzaSyDtGbU8BN06Y_GNDmhV1FJFRhTvD603DN0',
        authDomain:        'positionguessr.firebaseapp.com',
        databaseURL:       'https://positionguessr-default-rtdb.firebaseio.com',
        projectId:         'positionguessr',
        storageBucket:     'positionguessr.firebasestorage.app',
        messagingSenderId: '954415790631',
        appId:             '1:954415790631:web:0a5381589df51fc3abec02',
        measurementId:     'G-M63L8MVR6Z'
    };

    const dailyApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
    const dailyDb = getDatabase(dailyApp);
    const dailyAuth = getAuth(dailyApp);
    let dailyUID = null;
    let dailyData = null;
    let dailyAnswered = false;
    let dailyUserAnswer = null;
    let unsubscribeVotes = null;

    const todayUTC = () => new Date().toISOString().slice(0, 10);
    const answerForEvaluation = value => {
        const centipawns = parseFloat(value);
        if (!Number.isFinite(centipawns) || Math.abs(centipawns) <= 100) return 'Equal';
        return centipawns > 0 ? 'White Winning' : 'Black Winning';
    };

    function ensureDailyModal() {
        if (document.getElementById('potd-modal')) return;
        document.body.insertAdjacentHTML('beforeend', `
            <div id="potd-modal" onclick="if(event.target===this)closePOTD()" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:1010;justify-content:center;align-items:flex-start;padding-top:60px;overflow-y:auto;">
                <div class="modal-content" style="max-width:520px;">
                    <button class="modal-close-btn" onclick="closePOTD()" aria-label="Close Daily Puzzle">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>
                    </button>
                    <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
                        <div class="potd-icon" style="width:36px;height:36px;">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                        </div>
                        <div><div class="potd-label">Daily Challenge</div><h2 style="margin:0;font-size:1.3rem;" id="potd-modal-date">Puzzle of the Day</h2></div>
                    </div>
                    <div class="potd-modal-board" id="potd-modal-board"><p style="color:var(--text-faint);font-family:var(--font-mono);font-size:0.8rem;letter-spacing:0.06em;">LOADING...</p></div>
                    <div class="potd-turn-badge" id="potd-modal-turn"></div>
                    <div class="potd-choices" id="potd-choices">
                        <button class="potd-choice-btn" onclick="submitPOTD('White Winning')" id="potd-btn-white">♔ White</button>
                        <button class="potd-choice-btn" onclick="submitPOTD('Equal')" id="potd-btn-equal">⚖ Equal</button>
                        <button class="potd-choice-btn" onclick="submitPOTD('Black Winning')" id="potd-btn-black">♚ Black</button>
                    </div>
                    <div class="potd-not-answered" id="potd-signin-notice" style="display:none;"><a href="login.html" style="color:var(--yellow);font-weight:700;">Sign in</a> to submit your answer and see community results.</div>
                    <div class="potd-result-box" id="potd-result-box">
                        <div class="potd-result-title" id="potd-result-title"></div>
                        <div class="potd-eval-line" id="potd-eval-line"></div>
                        <div class="potd-community" id="potd-community">
                            <div class="potd-community-label">Community Answers</div>
                            <div class="potd-bar-row"><span class="potd-bar-row-label">♔ White</span><div class="potd-bar-track"><div class="potd-bar-fill white" id="bar-white" style="width:0%"></div></div><span class="potd-bar-pct" id="pct-white">0%</span></div>
                            <div class="potd-bar-row"><span class="potd-bar-row-label">⚖ Equal</span><div class="potd-bar-track"><div class="potd-bar-fill equal" id="bar-equal" style="width:0%"></div></div><span class="potd-bar-pct" id="pct-equal">0%</span></div>
                            <div class="potd-bar-row"><span class="potd-bar-row-label">♚ Black</span><div class="potd-bar-track"><div class="potd-bar-fill black" id="bar-black" style="width:0%"></div></div><span class="potd-bar-pct" id="pct-black">0%</span></div>
                        </div>
                    </div>
                    <div class="potd-countdown" id="potd-countdown"></div>
                    <button class="got-it-btn" onclick="closePOTD()" style="margin-top:16px;">Close</button>
                </div>
            </div>`);
    }

    function updateDailyNav() {
        const button = document.getElementById('potd-nav-btn');
        if (!button) return;
        button.classList.toggle('pending', Boolean(dailyData) && !dailyAnswered);
        button.classList.toggle('done', dailyAnswered);
        button.setAttribute('aria-label', dailyAnswered ? 'Puzzle of the Day — answered' : 'Puzzle of the Day');
    }

    function updateVoteBars(votes = {}) {
        const total = (votes.White || 0) + (votes.Equal || 0) + (votes.Black || 0);
        const values = { white: votes.White || 0, equal: votes.Equal || 0, black: votes.Black || 0 };
        Object.entries(values).forEach(([name, value]) => {
            const percent = total ? Math.round((value / total) * 100) : 0;
            const bar = document.getElementById(`bar-${name}`);
            const label = document.getElementById(`pct-${name}`);
            if (bar) bar.style.width = `${percent}%`;
            if (label) label.textContent = `${percent}%`;
        });
    }

    function disableChoices(userAnswer, correctAnswer) {
        const ids = { 'White Winning': 'potd-btn-white', Equal: 'potd-btn-equal', 'Black Winning': 'potd-btn-black' };
        Object.entries(ids).forEach(([answer, id]) => {
            const button = document.getElementById(id);
            if (!button) return;
            button.disabled = true;
            if (answer === userAnswer) button.className = `potd-choice-btn ${answer === correctAnswer ? 'selected-correct' : 'selected-wrong'}`;
            else if (answer === correctAnswer) button.className = 'potd-choice-btn reveal-correct';
            else button.className = 'potd-choice-btn';
        });
    }

    function showDailyResult(userAnswer, correctAnswer, evaluation, votes) {
        const result = document.getElementById('potd-result-box');
        const title = document.getElementById('potd-result-title');
        const evalLine = document.getElementById('potd-eval-line');
        if (!result || !title || !evalLine) return;
        const correct = userAnswer === correctAnswer;
        title.textContent = correct ? '✓ Correct!' : `✗ Incorrect — the answer was ${correctAnswer}`;
        title.className = `potd-result-title ${correct ? 'correct' : 'wrong'}`;
        const centipawns = parseFloat(evaluation);
        evalLine.innerHTML = Number.isFinite(centipawns)
            ? `Engine eval: <span>${centipawns > 0 ? '+' : ''}${(centipawns / 100).toFixed(2)}</span>`
            : 'Engine evaluation unavailable.';
        updateVoteBars(votes);
        result.classList.add('visible');
    }

    function renderCountdown() {
        const element = document.getElementById('potd-countdown');
        if (!element) return;
        const now = new Date();
        const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
        const remaining = next - now;
        const hours = Math.floor(remaining / 3600000);
        const minutes = Math.floor((remaining % 3600000) / 60000);
        const seconds = Math.floor((remaining % 60000) / 1000);
        element.innerHTML = `Next puzzle in <span>${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}</span>`;
    }

    function listenForVotes() {
        if (unsubscribeVotes || !dailyData) return;
        unsubscribeVotes = onValue(ref(dailyDb, `potd/${dailyData.date}/votes`), snapshot => {
            if (!snapshot.exists()) return;
            dailyData.votes = snapshot.val();
            updateVoteBars(dailyData.votes);
        });
    }

    function renderDailyModal() {
        if (!dailyData) return;
        const board = document.getElementById('potd-modal-board');
        const turn = document.getElementById('potd-modal-turn');
        const date = document.getElementById('potd-modal-date');
        const choices = document.getElementById('potd-choices');
        const signIn = document.getElementById('potd-signin-notice');
        const result = document.getElementById('potd-result-box');
        if (board) board.innerHTML = dailyData.svg || '<p>Position unavailable.</p>';
        if (turn) turn.textContent = dailyData.turn || '';
        if (date) date.textContent = `Puzzle of the Day — ${dailyData.date}`;
        renderCountdown();

        if (!dailyUID) {
            if (signIn) signIn.style.display = 'block';
            if (choices) choices.style.display = 'none';
            if (result) result.classList.remove('visible');
            return;
        }
        if (signIn) signIn.style.display = 'none';
        if (choices) choices.style.display = 'grid';
        if (dailyAnswered) {
            disableChoices(dailyUserAnswer, dailyData.correctAnswer);
            showDailyResult(dailyUserAnswer, dailyData.correctAnswer, dailyData.eval, dailyData.votes || {});
            listenForVotes();
        } else {
            ['potd-btn-white', 'potd-btn-equal', 'potd-btn-black'].forEach(id => {
                const button = document.getElementById(id);
                if (button) { button.disabled = false; button.className = 'potd-choice-btn'; }
            });
            if (result) result.classList.remove('visible');
        }
    }

    async function loadDailyPuzzle() {
        const today = todayUTC();
        try {
            const dailyRef = ref(dailyDb, `potd/${today}`);
            const existing = await get(dailyRef);
            if (existing.exists()) {
                dailyData = existing.val();
            } else {
                const positionsSnapshot = await get(ref(dailyDb, 'positions'));
                if (!positionsSnapshot.exists()) throw new Error('No positions available.');
                const positions = Object.entries(positionsSnapshot.val()).map(([key, value]) => ({ ...value, _key: key }));
                const pick = positions[Math.floor(Math.random() * positions.length)];
                dailyData = {
                    date: today,
                    positionKey: pick.id || pick.key || pick._key,
                    svg: pick.SVG,
                    turn: pick.Turn,
                    eval: pick.Eval,
                    correctAnswer: answerForEvaluation(pick.Eval),
                    votes: { White: 0, Equal: 0, Black: 0 },
                };
                if (dailyUID) await set(dailyRef, dailyData);
            }

            dailyAnswered = false;
            dailyUserAnswer = null;
            if (dailyUID) {
                const response = await get(ref(dailyDb, `users/${dailyUID}/potd/${today}`));
                if (response.exists()) {
                    dailyAnswered = true;
                    dailyUserAnswer = response.val().answer;
                }
            }
            updateDailyNav();
            if (document.getElementById('potd-modal')?.style.display === 'flex') renderDailyModal();
        } catch (error) {
            console.error('Daily Puzzle could not be loaded:', error);
            const board = document.getElementById('potd-modal-board');
            if (board) board.innerHTML = '<p style="color:var(--bad);">Unable to load today\'s puzzle. Please try again.</p>';
        }
    }

    window.openPOTD = function() {
        ensureDailyModal();
        const modal = document.getElementById('potd-modal');
        if (!modal) return;
        modal.style.display = 'flex';
        if (dailyData) renderDailyModal();
        else loadDailyPuzzle();
    };

    window.closePOTD = function() {
        const modal = document.getElementById('potd-modal');
        if (modal) modal.style.display = 'none';
    };

    window.submitPOTD = async function(answer) {
        if (!dailyUID || dailyAnswered || !dailyData) return;
        const voteKey = answer === 'White Winning' ? 'White' : answer === 'Black Winning' ? 'Black' : 'Equal';
        try {
            disableChoices(answer, dailyData.correctAnswer);
            const votesRef = ref(dailyDb, `potd/${todayUTC()}/votes`);
            const existingVotes = await get(votesRef);
            const votes = existingVotes.exists() ? existingVotes.val() : { White: 0, Equal: 0, Black: 0 };
            votes[voteKey] = (votes[voteKey] || 0) + 1;
            await set(votesRef, votes);
            dailyData.votes = votes;
            await set(ref(dailyDb, `users/${dailyUID}/potd/${todayUTC()}`), {
                answer,
                correct: answer === dailyData.correctAnswer,
                ts: Date.now(),
            });
            dailyAnswered = true;
            dailyUserAnswer = answer;
            showDailyResult(answer, dailyData.correctAnswer, dailyData.eval, votes);
            updateDailyNav();
            listenForVotes();
        } catch (error) {
            console.error('Daily Puzzle answer could not be saved:', error);
            const title = document.getElementById('potd-result-title');
            const result = document.getElementById('potd-result-box');
            if (title && result) {
                title.textContent = 'Your answer could not be saved. Please try again.';
                title.className = 'potd-result-title wrong';
                result.classList.add('visible');
            }
        }
    };

    document.addEventListener('keydown', event => {
        if (event.key === 'Escape') window.closePOTD();
    });

    ensureDailyModal();
    // Load immediately for guests as well. Auth resolution can be deferred on
    // some pages, and should never leave the Daily modal waiting indefinitely.
    loadDailyPuzzle();
    onAuthStateChanged(dailyAuth, user => {
        dailyUID = user?.uid || null;
        loadDailyPuzzle();
    });
    setInterval(renderCountdown, 1000);
})();
