/**
 * client/src/components/songs/SongListSkeleton.jsx
 *
 * Skeleton that exactly mirrors SongList + SongCard layout:
 *  - Same grid columns as .song-row
 *  - Same header as ListHeader in SongList.jsx
 *  - Same responsive breakpoints as SongCard ROW_STYLES
 *
 * Usage:
 *   import SongListSkeleton from '../components/songs/SongListSkeleton';
 *   <SongListSkeleton count={8} />
 *
 * Props:
 *   count  {number}  Number of skeleton rows to render. Default: 8.
 */

// ─── Single skeleton row — mirrors .song-row grid exactly ─────────────────────
const SkeletonRow = ({ index }) => (
  <div
    className="skrow"
    aria-hidden="true"
    style={{ animationDelay: `${index * 40}ms` }}
  >
    {/* Col 1: index number placeholder */}
    <div className="skrow__index">
      <div className="sk skrow__num-rect" />
    </div>

    {/* Col 2: cover art */}
    <div className="sk skrow__cover" />

    {/* Col 3: title + artist stacked */}
    <div className="skrow__meta">
      <div className="sk skrow__title" style={{ width: `${55 + (index % 5) * 8}%` }} />
      <div className="sk skrow__artist" style={{ width: `${30 + (index % 4) * 7}%` }} />
    </div>

    {/* Col 4: album — hidden on mobile/tablet (mirrors .song-row__album--responsive) */}
    <div className="skrow__album skrow__album--responsive">
      <div className="sk skrow__album-text" style={{ width: `${40 + (index % 3) * 12}%` }} />
    </div>

    {/* Col 5: genre badge */}
    <div className="skrow__genre-col skrow__genre--responsive">
      <div className="sk skrow__genre" />
    </div>

    {/* Col 6: duration */}
    <div className="skrow__dur-col">
      <div className="sk skrow__dur" />
    </div>

    {/* Col 7: action buttons */}
    <div className="skrow__actions">
      <div className="sk skrow__btn" />
      <div className="sk skrow__btn" />
    </div>
  </div>
);

// ─── Column header — mirrors ListHeader in SongList.jsx exactly ───────────────
const SkeletonHeader = () => (
  <div className="skrow-header" aria-hidden="true">
    <span className="skrow-hcol skrow-hcol--index">#</span>
    <span className="skrow-hcol skrow-hcol--cover" />
    <span className="skrow-hcol">Title</span>
    <span className="skrow-hcol skrow-hcol--album">Album</span>
    <span className="skrow-hcol skrow-hcol--genre">Genre</span>
    <span className="skrow-hcol skrow-hcol--dur">Time</span>
    <span className="skrow-hcol skrow-hcol--actions" />
  </div>
);

// ─── Main export ──────────────────────────────────────────────────────────────
const SongListSkeleton = ({ count = 8 }) => {
  const safeCount = Math.max(1, Math.min(count, 50)); // clamp 1–50
  return (
    <>
      <style>{SKELETON_STYLES}</style>

      <div
        className="song-list-skeleton"
        aria-busy="true"
        aria-label="Loading songs"
        role="status"
      >
        <SkeletonHeader />
        <div className="sk-divider" />
        <div className="skrow-list" role="list">
          {Array.from({ length: safeCount }).map((_, i) => (
            <div key={i} role="listitem">
              <SkeletonRow index={i} />
            </div>
          ))}
        </div>
      </div>
    </>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────
const SKELETON_STYLES = `

  /* ── Shimmer keyframe ──────────────────────────────────────────────────────── */
  @keyframes sk-shimmer {
    0%   { background-position: -600px 0; }
    100% { background-position:  600px 0; }
  }

  /* ── Skeleton row entrance ─────────────────────────────────────────────────── */
  @keyframes skrow-in {
    from { opacity: 0; }
    to   { opacity: 1; }
  }

  /* ── Base shimmer block ────────────────────────────────────────────────────── */
  .sk {
    border-radius: 4px;
    background: linear-gradient(
      90deg,
      rgba(255,255,255,0.04) 0%,
      rgba(255,255,255,0.09) 50%,
      rgba(255,255,255,0.04) 100%
    );
    background-size: 600px 100%;
    animation: sk-shimmer 1.4s ease-in-out infinite;
  }

  /* ── Outer container ───────────────────────────────────────────────────────── */
  .song-list-skeleton {
    width: 100%;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  }

  .sk-divider {
    height: 1px;
    background: rgba(255,255,255,0.06);
    margin: 0 12px 4px;
  }

  .skrow-list {
    display: flex;
    flex-direction: column;
  }

  /* ── Header — mirrors song-list__header ────────────────────────────────────── */
  .skrow-header {
    display: grid;
    grid-template-columns: 32px 48px 1fr 1fr 100px 52px 80px;
    align-items: center;
    gap: 12px;
    padding: 0 12px 8px;
  }

  .skrow-hcol {
    font-size: 11px;
    font-weight: 600;
    color: #4b5563;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .skrow-hcol--index   { text-align: center; }
  .skrow-hcol--dur     { text-align: right; }

  /* ── Row — mirrors .song-row grid exactly ──────────────────────────────────── */
  .skrow {
    display: grid;
    grid-template-columns: 32px 48px 1fr 1fr 100px 52px 80px;
    align-items: center;
    gap: 12px;
    padding: 6px 12px;
    border-radius: 8px;
    min-height: 60px;
    border-left: 3px solid transparent;
    /* Staggered fade-in to feel alive, not static */
    animation: skrow-in 0.3s ease both;
  }

  /* Divider between rows — mirrors .song-row + .song-row */
  .skrow + .skrow {
    border-top: 1px solid rgba(255,255,255,0.04);
  }

  /* ── Col 1: index ──────────────────────────────────────────────────────────── */
  .skrow__index {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 32px;
  }
  .skrow__num-rect {
    width: 14px;
    height: 14px;
    border-radius: 3px;
  }

  /* ── Col 2: cover art — mirrors .song-row__cover-wrap ─────────────────────── */
  .skrow__cover {
    width: 48px;
    height: 48px;
    border-radius: 6px;
    flex-shrink: 0;
  }

  /* ── Col 3: title + artist ─────────────────────────────────────────────────── */
  .skrow__meta {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }
  .skrow__title  { height: 13px; }
  .skrow__artist { height: 11px; }

  /* ── Col 4: album ──────────────────────────────────────────────────────────── */
  .skrow__album  { min-width: 0; }
  .skrow__album-text { height: 12px; }

  /* ── Col 5: genre ──────────────────────────────────────────────────────────── */
  .skrow__genre-col { display: flex; align-items: center; }
  .skrow__genre {
    height: 22px;
    width: 68px;
    border-radius: 4px;
  }

  /* ── Col 6: duration ───────────────────────────────────────────────────────── */
  .skrow__dur-col { display: flex; align-items: center; justify-content: flex-end; }
  .skrow__dur { height: 12px; width: 36px; }

  /* ── Col 7: action buttons ─────────────────────────────────────────────────── */
  .skrow__actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 4px;
  }
  .skrow__btn {
    width: 28px;
    height: 28px;
    border-radius: 50%;
  }

  /* ── Responsive — MUST mirror SongCard ROW_STYLES breakpoints exactly ──────── */

  /* Tablet: hide album col, shrink action col */
  @media (max-width: 1023px) {
    .skrow-header { grid-template-columns: 32px 48px 1fr 100px 52px 72px; }
    .skrow        { grid-template-columns: 32px 48px 1fr 100px 52px 72px; }
    .skrow__album--responsive  { display: none; }
    .skrow-hcol--album         { display: none; }
  }

  /* Mobile: hide album + genre, reduce cover, tighten padding */
  @media (max-width: 639px) {
    .skrow-header { grid-template-columns: 32px 44px 1fr 48px 64px; gap: 8px; padding: 0 8px 6px; }
    .skrow        { grid-template-columns: 32px 44px 1fr 48px 64px; gap: 8px; padding: 5px 8px; }
    .skrow__album--responsive  { display: none; }
    .skrow__genre--responsive  { display: none; }
    .skrow-hcol--album         { display: none; }
    .skrow-hcol--genre         { display: none; }
    .skrow__cover { width: 44px; height: 44px; }
  }
`;

export default SongListSkeleton;