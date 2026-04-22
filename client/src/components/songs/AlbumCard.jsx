/**
 * client/src/components/songs/AlbumCard.jsx
 *
 * Card component for an album shown in the horizontal Albums row on Home.
 *
 * Visual anatomy (matches screenshot target):
 *   ┌──────────────────────────┐
 *   │  ┌────────────────────┐  │
 *   │  │  cover image  OR   │  │
 *   │  │  coloured tile     │  │
 *   │  │  with music emoji  │  │
 *   │  └────────────────────┘  │
 *   │  Album Title             │
 *   │  Artist Name             │
 *   └──────────────────────────┘
 *
 * Props:
 *   album  {object}  — Album object from API / useAlbum hook.
 *     album.id          {string}           — Firestore album doc ID.
 *     album.title       {string}           — Album display title.
 *     album.artistName  {string|undefined} — Artist display name.
 *     album.artistId    {string|undefined} — Artist ID (for link). Optional.
 *     album.coverUrl    {string|undefined} — Cover image URL from Cloudinary.
 *     album.songCount   {number|undefined} — Optional song count.
 *
 * Null-safety:
 *   - Renders null when `album` is falsy.
 *   - album.id missing → non-clickable div instead of Link.
 *   - album.coverUrl missing → coloured tile with music note icon (deterministic colour).
 *   - artist name missing → hidden (no broken text).
 *
 * Cover colour:
 *   Same deterministic hash as ArtistCard but uses a different palette
 *   so album tiles look distinct from artist avatars.
 */

import { Link } from 'react-router-dom';
import { useMemo } from 'react';
import { MusicalNoteIcon } from '@heroicons/react/24/outline';

// ─── Cover colour palette ─────────────────────────────────────────────────────
// Pastel-ish tones that match the screenshot's album tile colours.
const COVER_COLOURS = [
  { bg: '#a8edbe', icon: '#2d7a50' }, // mint green
  { bg: '#c4b5f5', icon: '#5b3fb5' }, // lavender
  { bg: '#f9c5a3', icon: '#b54a1b' }, // peach
  { bg: '#a3d4f9', icon: '#1b5fb5' }, // sky blue
  { bg: '#f9e2a3', icon: '#b58c1b' }, // warm yellow
  { bg: '#f9a3c5', icon: '#b51b50' }, // rose
  { bg: '#a3f9e2', icon: '#1b7a5f' }, // teal
  { bg: '#d4f9a3', icon: '#4a7a1b' }, // lime
];

const getCoverColour = (seed = '') => {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  return COVER_COLOURS[Math.abs(hash) % COVER_COLOURS.length];
};

// ─── Component ────────────────────────────────────────────────────────────────

const AlbumCard = ({ album }) => {
  if (!album) return null;

  const {
    id,
    title       = 'Unknown Album',
    artistName,
    artistId,
    coverUrl,
  } = album;

  const colour = useMemo(() => getCoverColour(title + (artistName ?? '')), [title, artistName]);

  // ── Cover image or coloured placeholder ──
  const cover = (
    <div className="relative w-full aspect-square rounded-lg overflow-hidden mb-3 shrink-0">
      {coverUrl ? (
        <img
          src={coverUrl}
          alt={title}
          className="w-full h-full object-cover"
          loading="lazy"
          onError={(e) => { e.currentTarget.style.display = 'none'; }}
        />
      ) : (
        <div
          className="w-full h-full flex items-center justify-center"
          style={{ backgroundColor: colour.bg }}
          aria-hidden="true"
        >
          <MusicalNoteIcon
            className="w-8 h-8 opacity-80"
            style={{ color: colour.icon }}
          />
        </div>
      )}
    </div>
  );

  // ── Artist name — either a Link to artist page or plain text ──
  const artistElement = artistName ? (
    artistId ? (
      <Link
        to={`/artist/${artistId}`}
        className="text-xs text-gray-500 hover:text-gray-300 transition-colors truncate block"
        onClick={(e) => e.stopPropagation()} // don't trigger album nav
        tabIndex={-1}
      >
        {artistName}
      </Link>
    ) : (
      <p className="text-xs text-gray-500 truncate">{artistName}</p>
    )
  ) : null;

  // ── Card wrapper classes ──
  const wrapperClass = [
    'flex flex-col',
    'p-3 rounded-xl bg-[#1e1e1e] border border-[#2a2a2a]',
    'transition-all duration-200',
    'hover:bg-[#252525] hover:border-[#333333]',
    'cursor-pointer select-none',
    'min-w-[140px] w-full',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500',
  ].join(' ');

  const textBlock = (
    <>
      <p className="text-sm font-semibold text-white leading-tight truncate mb-0.5">
        {title}
      </p>
      {artistElement}
    </>
  );

  if (!id) {
    return (
      <div className={wrapperClass} title={title}>
        {cover}
        {textBlock}
      </div>
    );
  }

  return (
    <Link to={`/album/${id}`} className={wrapperClass} title={title}>
      {cover}
      {textBlock}
    </Link>
  );
};

export default AlbumCard;