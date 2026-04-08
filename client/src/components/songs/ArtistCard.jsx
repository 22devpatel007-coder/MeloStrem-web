/**
 * client/src/components/songs/ArtistCard.jsx
 *
 * Card component for an artist shown in the horizontal Artists row on Home.
 *
 * Visual anatomy (matches screenshot target):
 *   ┌──────────────────────────┐
 *   │                          │
 *   │      ┌────────┐          │
 *   │      │  initials avatar  │
 *   │      └────────┘          │
 *   │    Artist Name           │
 *   │    N songs               │
 *   │                          │
 *   └──────────────────────────┘
 *
 * Props:
 *   artist  {object}  — Artist object from API / useArtist hook.
 *     artist.id         {string}           — Firestore artist doc ID.
 *     artist.name       {string}           — Display name.
 *     artist.songCount  {number|undefined} — Song count. Falls back to 0.
 *     artist.imageUrl   {string|undefined} — Optional cover image.
 *
 * Null-safety:
 *   - Renders nothing (null) when `artist` is falsy.
 *   - artist.id missing → renders a non-clickable div instead of a Link.
 *   - artist.name missing → shows "Unknown Artist".
 *   - No .map call anywhere in this file.
 *
 * Avatar colour:
 *   Deterministic from the artist name so the same artist always gets the
 *   same colour across renders and devices. Uses a small palette of muted
 *   tones that look good on the dark background.
 */

import { Link } from 'react-router-dom';
import { useMemo } from 'react';

// ─── Avatar colour palette ────────────────────────────────────────────────────
// Muted, dark-friendly tones — same palette used in screenshot.
const AVATAR_COLOURS = [
  '#4ade80', // emerald
  '#60a5fa', // blue
  '#f472b6', // pink
  '#fb923c', // orange
  '#a78bfa', // violet
  '#34d399', // teal
  '#facc15', // yellow
  '#f87171', // red
];

/**
 * Picks a colour deterministically from the artist name.
 * Same name → same colour on every render.
 */
const getAvatarColour = (name = '') => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLOURS[Math.abs(hash) % AVATAR_COLOURS.length];
};

/**
 * Returns up to 2 uppercase initials from the artist name.
 * "T-Series"         → "TS"
 * "Anuv Jain"        → "AJ"
 * "AFUSIC"           → "AF"
 * "dev"              → "D"
 */
const getInitials = (name = '') => {
  const parts = name.trim().split(/[\s\-]+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
};

// ─── Component ────────────────────────────────────────────────────────────────

const ArtistCard = ({ artist }) => {
  // Hard null-safety — never render broken card
  if (!artist) return null;

  const { id, name = 'Unknown Artist', songCount = 0, imageUrl } = artist;

  const initials      = useMemo(() => getInitials(name), [name]);
  const avatarColour  = useMemo(() => getAvatarColour(name), [name]);
  const songLabel     = `${songCount} ${songCount === 1 ? 'song' : 'songs'}`;

  // Card inner content — same markup whether wrapped in Link or div
  const cardContent = (
    <>
      {/* ── Avatar ── */}
      <div className="flex justify-center mb-3">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={name}
            className="w-14 h-14 rounded-full object-cover"
            loading="lazy"
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
        ) : (
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center shrink-0"
            style={{ backgroundColor: `${avatarColour}22`, border: `1.5px solid ${avatarColour}55` }}
            aria-hidden="true"
          >
            <span
              className="text-lg font-bold leading-none select-none"
              style={{ color: avatarColour }}
            >
              {initials}
            </span>
          </div>
        )}
      </div>

      {/* ── Text ── */}
      <p className="text-sm font-semibold text-white text-center leading-tight line-clamp-2 mb-1">
        {name}
      </p>
      <p className="text-xs text-gray-500 text-center tabular-nums">
        {songLabel}
      </p>
    </>
  );

  // ── Wrapper — Link when id exists, plain div when id is missing (null-safe) ──
  const wrapperClass = [
    'flex flex-col items-center justify-center',
    'p-4 rounded-xl bg-[#1e1e1e] border border-[#2a2a2a]',
    'transition-all duration-200',
    'hover:bg-[#252525] hover:border-[#333333]',
    'cursor-pointer select-none',
    'min-w-[120px] w-full',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500',
  ].join(' ');

  if (!id) {
    return (
      <div className={wrapperClass} title={name}>
        {cardContent}
      </div>
    );
  }

  return (
    <Link to={`/artist/${id}`} className={wrapperClass} title={name}>
      {cardContent}
    </Link>
  );
};

export default ArtistCard;