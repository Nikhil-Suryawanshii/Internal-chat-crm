// ─────────────────────────────────────────────────────────────
//  urls.js  –  Single source of truth for backend URLs
//
//  Priority:
//    1. window.MokapenPublicUrl  → set by Laravel blade (production)
//    2. REACT_APP_PUBLIC_URL     → set in .env (local dev)
//    3. Fallback empty string    → relative URLs (same origin)
// ─────────────────────────────────────────────────────────────

export const PUBLIC_URL =
    (typeof window !== "undefined" && window.MokapenPublicUrl)
        ? window.MokapenPublicUrl
        : (process.env.REACT_APP_PUBLIC_URL || "");

/**
 * Build the full URL for a user avatar.
 *
 * @param {string|null} photo     - Raw filename from DB (e.g. "1781850797.jpg")
 * @param {number|string} userId  - User's numeric ID
 * @returns {string|null}         - Full URL or null when no photo exists
 *
 * Examples:
 *   getAvatarUrl("1781850797.jpg", 1)
 *   → "http://localhost/mokapen/public/uploads/users/1/images/1781850797.jpg"
 *
 *   getAvatarUrl("https://example.com/photo.jpg", 1)
 *   → "https://example.com/photo.jpg"   (already absolute – returned as-is)
 */
export const getAvatarUrl = (photo, userId) => {
    if (!photo) return null;
    if (photo.startsWith("http")) return photo;
    return `${PUBLIC_URL}/uploads/users/${userId}/images/${photo}`;
};
