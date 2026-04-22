/**
 * client/src/components/songs/ArtistCard.jsx
 *
 * Responsive improvements over previous version:
 *  ✅ Full artist name shown (line-clamp-2 stays — graceful wrapping on 2 lines)
 *  ✅ Card min-width removed — grows/shrinks naturally inside any grid
 *  ✅ Hover: scale(1.03) + elevated shadow — visible on desktop, disabled on touch
 *  ✅ Touch: :active state gives haptic-like scale feedback instead
 *  ✅ Avatar size adapts: 56px default → 64px on md+ screens via CSS
 *  ✅ Null-safety unchanged — id missing renders non-clickable div
 *
 * Props: unchanged.
 *   artist.id         {string}           — Firestore artist doc ID
 *   artist.name       {string}           — Display name
 *   artist.songCount  {number|undefined} — Song count
 *   artist.imageUrl   {string|undefined} — Optional cover image
 */

import { Link } from 'react-router-dom';
import { useMemo } from 'react';

// ─── Avatar colour palette ────────────────────────────────────────────────────
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

const getAvatarColour = (name = '') => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLOURS[Math.abs(hash) % AVATAR_COLOURS.length];
};

const getInitials = (name = '') => {
  const parts = name.trim().split(/[\s\-]+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
};

// ─── Component ────────────────────────────────────────────────────────────────
const ArtistCard = ({ artist }) => {
  if (!artist) return null;

  const { id, name = 'Unknown Artist', songCount = 0, imageUrl } = artist;

  const initials     = useMemo(() => getInitials(name), [name]);
  const avatarColour = useMemo(() => getAvatarColour(name), [name]);
  const songLabel    = `${songCount} ${songCount === 1 ? 'song' : 'songs'}`;

  const cardContent = (
    <>
      <style>{CARD_STYLES}</style>

      {/* ── Avatar ── */}
      <div className="ac-avatar-wrap">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={name}
            className="ac-avatar-img"
            loading="lazy"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
              e.currentTarget.nextSibling.style.display = 'flex';
            }}
          />
        ) : null}
        <div
          className="ac-avatar-initials"
          style={{
            display: imageUrl ? 'none' : 'flex',
            backgroundColor: `${avatarColour}22`,
            border: `1.5px solid ${avatarColour}55`,
          }}
          aria-hidden="true"
        >
          <span style={{ color: avatarColour }} className="ac-initials-text">
            {initials}
          </span>
        </div>
      </div>

      {/* ── Text ── */}
      <p className="ac-name">{name}</p>
      <p className="ac-count">{songLabel}</p>
    </>
  );

  const wrapperClass = 'ac-card';

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

// ─── Scoped styles ────────────────────────────────────────────────────────────
const CARD_STYLES = `
  .ac-card {
    display:         flex;
    flex-direction:  column;
    align-items:     center;
    justify-content: center;
    padding:         16px 12px;
    border-radius:   14px;
    background:      #1e1e1e;
    border:          1px solid #2a2a2a;
    cursor:          pointer;
    text-decoration: none;
    /* Smooth hover — desktop only */
    transition:      background 0.2s, border-color 0.2s, transform 0.2s, box-shadow 0.2s;
    -webkit-tap-highlight-color: transparent;
    width: 100%;
    box-sizing: border-box;
    outline: none;
  }

  /* Desktop hover — lift effect */
  @media (hover: hover) {
    .ac-card:hover {
      background:    #252525;
      border-color:  #363636;
      transform:     scale(1.03);
      box-shadow:    0 8px 24px rgba(0,0,0,0.35);
    }
  }

  /* Touch active — quick press feedback */
  .ac-card:active {
    transform:  scale(0.97);
    box-shadow: none;
  }

  /* Focus ring for keyboard nav */
  .ac-card:focus-visible {
    outline:        2px solid #22c55e;
    outline-offset: 3px;
  }

  /* ── Avatar wrapper — responsive sizing ── */
  .ac-avatar-wrap {
    width:         56px;
    height:        56px;
    border-radius: 50%;
    overflow:      hidden;
    margin-bottom: 10px;
    flex-shrink:   0;
    position:      relative;
  }

  .ac-avatar-img {
    width:      100%;
    height:     100%;
    object-fit: cover;
    display:    block;
  }

  .ac-avatar-initials {
    width:           100%;
    height:          100%;
    border-radius:   50%;
    display:         flex;
    align-items:     center;
    justify-content: center;
  }

  .ac-initials-text {
    font-size:   18px;
    font-weight: 700;
    line-height: 1;
    user-select: none;
  }

  /* ── Text ── */
  .ac-name {
    font-size:    13px;
    font-weight:  600;
    color:        #fff;
    text-align:   center;
    line-height:  1.35;
    margin:       0 0 4px;
    /* Allow up to 2 lines before truncating */
    display:             -webkit-box;
    -webkit-line-clamp:  2;
    -webkit-box-orient:  vertical;
    overflow:            hidden;
    word-break:          break-word;
    max-width:           100%;
  }

  .ac-count {
    font-size:  12px;
    color:      #6b7280;
    text-align: center;
    margin:     0;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  /* Larger avatar on md+ screens */
  @media (min-width: 768px) {
    .ac-avatar-wrap { width: 64px; height: 64px; }
    .ac-initials-text { font-size: 20px; }
    .ac-name  { font-size: 14px; }
    .ac-count { font-size: 12px; }
  }
`;

export default ArtistCard;