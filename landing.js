// ════════════════════════════════════════════════════════════════════════════
//  ChessIQ — landing page
//
//  The landing page is static by design: the hero board is a build-time SVG
//  and every section is plain markup, so nothing here renders content. This
//  file owns the one piece of behaviour the page does have, which is telling
//  the app that the visitor has now seen the pitch.
//
//  Note on where the first-visit redirect lives: it is NOT here. That check
//  sits inline and blocking at the top of index.html's <head>, because it has
//  to run before the app paints. Loading it as an external file would add a
//  round trip and let the board flash up before the redirect fired.
// ════════════════════════════════════════════════════════════════════════════

const SEEN_KEY = 'chessiq-seen';

// Arriving here at all counts as having seen the pitch, so a returning visitor
// goes straight to the app however they leave this page: a CTA, the nav, the
// back button, or closing the tab and coming back tomorrow.
function markLandingSeen() {
    try {
        localStorage.setItem(SEEN_KEY, '1');
        return true;
    } catch (_) {
        // Private browsing or blocked storage. The visitor will see this page
        // again next time, which is the harmless failure of the two: the
        // alternative is index.html trapping them here on every load.
        return false;
    }
}

markLandingSeen();
