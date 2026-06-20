// ════════════════════════════════════════════════════════════════════════════
//  ChessIQ — Experience layer
//  • three.js ambient scene: matte 3D chess pieces with yellow rim lighting
//  • page-to-page transition wipe
//  • on-load entrance reveals
//  This file is purely presentational and never touches game logic in main.js.
// ════════════════════════════════════════════════════════════════════════════
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

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
   On load: reveal-wipe out. On internal link click: cover-wipe in, then navigate.
   ──────────────────────────────────────────────────────────────────────────── */
(function pageTransitions() {
    const pt = document.getElementById('page-transition');
    if (!pt) return;

    // Reveal on initial paint
    requestAnimationFrame(() => {
        pt.classList.add('cover');               // start covered (instant)
        requestAnimationFrame(() => {
            pt.classList.remove('cover');
            pt.classList.add('reveal');
        });
    });

    const isInternal = (a) => {
        if (!a) return false;
        const href = a.getAttribute('href') || '';
        if (!href || href.startsWith('#') || a.target === '_blank') return false;
        if (/^(https?:|mailto:|tel:)/i.test(href)) return false;
        if (a.hasAttribute('onclick') && /sendAnswer|Sidebar|Modal|Settings|Stats/.test(a.getAttribute('onclick'))) {
            // still allow nav for sidebar links that also navigate (index.html etc.)
        }
        return /\.html($|\?|#)/.test(href) || href === '/' ;
    };

    document.addEventListener('click', (e) => {
        const a = e.target.closest('a');
        if (!isInternal(a)) return;
        const href = a.getAttribute('href');
        // same page? let it scroll/no-op
        if (href === window.location.pathname.split('/').pop()) return;
        if (reduceMotion) return;             // native nav

        e.preventDefault();
        pt.classList.remove('reveal');
        pt.classList.add('cover');
        setTimeout(() => { window.location.href = href; }, 420);
    });

    window.addEventListener('pageshow', (e) => {
        if (e.persisted) { pt.classList.remove('cover'); pt.classList.add('reveal'); }
    });
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
