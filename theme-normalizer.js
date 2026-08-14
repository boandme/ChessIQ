/*
 * ChessIQ Analytics — Theme normalization and canonicalization
 *
 * Gemini-generated theme labels can differ by formatting or vocabulary detail.
 * The layered, explicit aliases below implement the approved Tier 1 through
 * Tier 4 taxonomy. No fuzzy, substring, or model-based matching is used.
 */

import { TIER_3_ALIASES, TIER_4_ALIASES } from './theme-taxonomy.js';

export const THEME_MIGRATION_VERSION = 'tier1-tier2-tier3-tier4-v1';

/**
 * Returns a stable key and display label for a Gemini theme string.
 * Returns null for empty or non-string values.
 *
 * This generic function deliberately handles only Unicode form, whitespace,
 * and casing. It does not make semantic merges by itself.
 */
export function normalizeThemeLabel(rawTheme) {
    if (typeof rawTheme !== 'string') return null;

    const key = rawTheme
        .normalize('NFKC')
        .trim()
        .replace(/\s+/g, ' ')
        .toLocaleLowerCase();

    if (!key) return null;

    return {
        key,
        label: key.replace(/\b\w/g, character => character.toUpperCase()),
    };
}

/*
 * Approved Tier 1 + Tier 2 aliases.
 *
 * Tier 1 covers singular/plural, rank notation, and hyphenation variants.
 * Tier 2 supplies five broad radar-training dimensions. Tier 3 and Tier 4
 * aliases are imported from the separately maintained taxonomy module.
 */
export const THEME_ALIASES = Object.freeze({
    // Tier 1 — safe automatic aliases
    'passed pawn': 'Passed Pawns',
    'passed pawns': 'Passed Pawns',
    'backward pawn': 'Backward Pawns',
    'backward pawns': 'Backward Pawns',
    'pawn majority': 'Pawn Majorities',
    'pawn majorities': 'Pawn Majorities',
    'pawn weakness': 'Pawn Weaknesses',
    'pawn weaknesses': 'Pawn Weaknesses',
    'pin': 'Pins',
    'pins': 'Pins',
    'pawn endgame': 'Pawn Endgames',
    'pawn endgames': 'Pawn Endgames',
    'queen endgame': 'Queen Endgames',
    'queen endgames': 'Queen Endgames',
    'theoretical draw': 'Theoretical Draws',
    'theoretical draws': 'Theoretical Draws',
    'misplaced piece': 'Misplaced Pieces',
    'misplaced pieces': 'Misplaced Pieces',
    'out of play piece': 'Out-of-Play Pieces',
    'out of play pieces': 'Out-of-Play Pieces',
    'out-of-play piece': 'Out-of-Play Pieces',
    'out-of-play pieces': 'Out-of-Play Pieces',
    'rook on the seventh': 'Rook on the Seventh Rank',
    'rook on the seventh rank': 'Rook on the Seventh Rank',
    'rook on the 7th': 'Rook on the Seventh Rank',
    'rook on the 7th rank': 'Rook on the Seventh Rank',

    // Tier 2 — explicit broad training dimensions
    'open file': 'Open-File Control',
    'open files': 'Open-File Control',
    'control of open file': 'Open-File Control',
    'control of open files': 'Open-File Control',
    'control of the open file': 'Open-File Control',
    'control of the open files': 'Open-File Control',
    'open file control': 'Open-File Control',
    'file control': 'Open-File Control',

    'center control': 'Central Control',
    'central control': 'Central Control',
    'control of the center': 'Central Control',
    'central pawn control': 'Central Control',

    'piece coordination': 'Piece Coordination',
    'coordination': 'Piece Coordination',
    'coordinated pieces': 'Piece Coordination',
    'piece harmony': 'Piece Coordination',
    'piece cooperation': 'Piece Coordination',

    'restriction': 'Piece Restriction',
    'piece restriction': 'Piece Restriction',
    'restricted pieces': 'Piece Restriction',
    'restricting opponent pieces': 'Piece Restriction',

    'outpost': 'Outposts',
    'outposts': 'Outposts',
    'knight outpost': 'Outposts',
    'outpost exploitation': 'Outposts',
    'outpost creation': 'Outposts',
    'outpost neutralization': 'Outposts',
    'outpost control': 'Outposts',
});

/**
 * Returns the approved database/radar label for a raw Gemini theme. It is
 * deterministic and applies only labels that appear in the explicit Tier 1–4
 * alias maps. The original detailed label is intentionally replaced with the
 * broad Tier 4 curriculum category when a mapping exists.
 */
export function canonicalizeThemeLabel(rawTheme) {
    const normalized = normalizeThemeLabel(rawTheme);
    if (!normalized) return null;

    const tier1Tier2Label = THEME_ALIASES[normalized.key] || normalized.label;
    const tier1Tier2 = normalizeThemeLabel(tier1Tier2Label);

    const tier3Label = TIER_3_ALIASES[tier1Tier2.key] || tier1Tier2Label;
    const tier3 = normalizeThemeLabel(tier3Label);

    const canonicalLabel = TIER_4_ALIASES[tier3.key] || tier3Label;
    const canonical = normalizeThemeLabel(canonicalLabel);

    return {
        key: canonical.key,
        label: canonicalLabel,
    };
}

/**
 * Canonicalizes a stored themes array for the one-time database migration.
 * Duplicate labels introduced by a merge are removed while retaining the
 * original theme order. Invalid entries are ignored.
 */
export function canonicalizeThemeArray(rawThemes) {
    if (!Array.isArray(rawThemes)) return null;

    const seen = new Set();
    const canonicalThemes = [];
    rawThemes.forEach(rawTheme => {
        const canonical = canonicalizeThemeLabel(rawTheme);
        if (!canonical || seen.has(canonical.key)) return;
        seen.add(canonical.key);
        canonicalThemes.push(canonical.label);
    });

    return canonicalThemes;
}

/**
 * Adds one theme observation to a Map keyed by its approved canonical label.
 * `correctWeight` can be fractional because Analytics estimates theme-level
 * correctness from the player's performance at each puzzle difficulty.
 */
export function addNormalizedThemeObservation(themeTotals, rawTheme, correctWeight) {
    const canonical = canonicalizeThemeLabel(rawTheme);
    if (!canonical) return false;

    const entry = themeTotals.get(canonical.key) || {
        name: canonical.label,
        total: 0,
        correct: 0,
    };

    entry.total += 1;
    entry.correct += Number.isFinite(correctWeight) ? correctWeight : 0;
    themeTotals.set(canonical.key, entry);
    return true;
}
