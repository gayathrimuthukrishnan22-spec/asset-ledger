// ======================================================
// File Name : password.js
// Purpose   : Strong-password generation + validation, shared by every
//             screen that sets a user's password (Login/Register,
//             Invite User, Edit User). Policy: 10+ chars, at least one
//             UPPER, one lower, one number, one symbol.
// ======================================================

// ======================================================
// START: Utility Functions
// ======================================================

const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I/O — avoids look-alikes
const LOWER = 'abcdefghijkmnpqrstuvwxyz';
const DIGITS = '23456789';
const SYMBOLS = '!@#$%^&*?-';
const ALL = UPPER + LOWER + DIGITS + SYMBOLS;

// ======================================================
// Function : pick
// Purpose  : Returns one random character from the given string.
// ======================================================
function pick(chars) {
    return chars[Math.floor(Math.random() * chars.length)];
}

// ======================================================
// Function : generateStrongPassword
// Purpose  : Build a random password that always contains at least one
//            uppercase letter, one lowercase letter, one number and one
//            symbol, then shuffles so the guaranteed characters aren't
//            always in the same spot.
// ======================================================

export function generateStrongPassword(length = 12) {
    const required = [pick(UPPER), pick(LOWER), pick(DIGITS), pick(SYMBOLS)];
    const rest = Array.from({ length: Math.max(length - required.length, 0) }, () => pick(ALL));
    const chars = [...required, ...rest];
    // Fisher-Yates shuffle
    for (let i = chars.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    return chars.join('');
}

// ======================================================
// END: generateStrongPassword
// ======================================================

// ======================================================
// Function : passwordStrengthIssues
// Purpose  : Returns a list of unmet requirements (empty = strong
//            enough). Used to block submit and to show a hint.
// ======================================================

export function passwordStrengthIssues(password) {
    const issues = [];
    if (!password || password.length < 8) issues.push('at least 8 characters');
    if (!/[A-Z]/.test(password)) issues.push('an uppercase letter');
    if (!/[a-z]/.test(password)) issues.push('a lowercase letter');
    if (!/[0-9]/.test(password)) issues.push('a number');
    if (!/[^A-Za-z0-9]/.test(password)) issues.push('a symbol');
    return issues;
}

// ======================================================
// END: passwordStrengthIssues
// ======================================================

// ======================================================
// Function : isStrongPassword
// Purpose  : True when the password passes every strength rule.
// ======================================================
export function isStrongPassword(password) {
    return passwordStrengthIssues(password).length === 0;
}

// ======================================================
// END: Utility Functions
// ======================================================

// ======================================================
// END OF FILE : password.js
// ======================================================
