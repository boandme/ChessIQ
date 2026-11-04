// ════════════════════════════════════════════════════════════════════════════
//  ChessIQ — landing page
//
//  The landing page is static by design: the hero board is a build-time SVG
//  and every section is plain markup, so nothing here renders content. This
//  file owns the one piece of behaviour the page has, which is recording the
//  handover when a visitor leaves for the app.
//
//  The redirect that sends people here is NOT in this file. It sits inline and
//  blocking at the top of index.html's <head>, because it has to run before
//  the app paints; an external file would add a round trip and let the board
//  flash up first. index.html decides, landing.js only leaves the marker.
// ════════════════════════════════════════════════════════════════════════════

// index.html sends signed-out visitors here on a fresh load or a reload. It
// decides that from the referrer, which some privacy settings strip, so every
// link out of this page also leaves an explicit marker. Without it a visitor
// who clicked "Start training" could be bounced straight back here.
const ENTERED_KEY = 'chessiq-entered';

function markHandover() {
    try {
        sessionStorage.setItem(ENTERED_KEY, '1');
    } catch (_) {
        // Private browsing. The referrer check still covers the normal case.
    }
}

// Any link that leaves for the app counts as the handover, including the ones
// in the footer, not just the two calls to action.
document.addEventListener('click', event => {
    const link = event.target.closest('a[href]');
    if (!link) return;
    const href = link.getAttribute('href') || '';
    if (/^(https?:|mailto:|#)/.test(href)) return;
    if (/landing\.html$/.test(href)) return;
    markHandover();
});
