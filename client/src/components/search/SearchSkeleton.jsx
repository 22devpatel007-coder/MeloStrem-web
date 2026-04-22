/**
 * client/src/components/search/SearchSkeleton.jsx
 *
 * Skeleton for the Search page browse state (no active query).
 * Mirrors the exact layout: hero bar → recent searches pills → artist tile grid.
 *
 * Uses the global `.skeleton` class from index.css — no local shimmer defined.
 * Stagger delay on tiles via inline animation-delay.
 */

const TILE_COUNT  = 12; // matches extractUniqueArtists limit in Search.jsx
const PILL_COUNT  = 4;  // typical recent-searches count

// ─── Sub-pieces ───────────────────────────────────────────────────────────────

/** Mirrors sp-hero — search bar placeholder */
const HeroSkeleton = () => (
  <div className="ssk-hero" aria-hidden="true">
    <div className="ssk-hero__inner">
      <div className="skeleton ssk-eyebrow" />
      <div className="skeleton ssk-bar" />
      <div className="skeleton ssk-hint" />
    </div>
  </div>
);

/** Recent searches pill row */
const HistoryPillsSkeleton = () => (
  <div className="ssk-history" aria-hidden="true">
    <div className="ssk-history__header">
      <div className="skeleton ssk-history__label" />
      <div className="skeleton ssk-history__clear" />
    </div>
    <div className="ssk-history__pills">
      {Array.from({ length: PILL_COUNT }).map((_, i) => (
        <div
          key={i}
          className="skeleton ssk-history__pill"
          style={{ width: `${52 + (i % 3) * 20}px` }}
        />
      ))}
    </div>
  </div>
);

/** One artist tile placeholder */
const TileSkeleton = ({ index }) => (
  <div
    className="ssk-tile"
    aria-hidden="true"
    style={{ animationDelay: `${index * 35}ms` }}
  >
    <div className="skeleton ssk-tile__avatar" />
    <div className="skeleton ssk-tile__label" />
  </div>
);

// ─── Main export ──────────────────────────────────────────────────────────────
const SearchSkeleton = () => (
  <>
    <style>{SKELETON_STYLES}</style>

    <div aria-busy="true" aria-label="Loading search">

      <HeroSkeleton />

      <div className="ssk-body">
        <HistoryPillsSkeleton />

        {/* Browse Artists section */}
        <div className="ssk-browse">
          <div className="skeleton ssk-browse__title" />
          <div className="ssk-browse__grid">
            {Array.from({ length: TILE_COUNT }).map((_, i) => (
              <TileSkeleton key={i} index={i} />
            ))}
          </div>
        </div>
      </div>

    </div>
  </>
);

// ─── Styles ───────────────────────────────────────────────────────────────────
const SKELETON_STYLES = `
  @keyframes ssk-tile-in {
    from { opacity: 0; transform: translateY(6px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  /* ── Hero ────────────────────────────────────────────────────────────────── */
  .ssk-hero {
    padding: 36px 20px 24px;
    background: var(--color-bg);
  }

  .ssk-hero__inner {
    max-width: 480px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .ssk-eyebrow { width: 210px; height: 13px; border-radius: 4px; }
  .ssk-bar     { width: 100%;  height: 38px; border-radius: 10px; }
  .ssk-hint    { width: 160px; height: 12px; border-radius: 4px; margin: 0 auto; }

  /* ── Body ────────────────────────────────────────────────────────────────── */
  .ssk-body {
    padding: 0 20px 80px;
    max-width: 680px;
    margin: 0 auto;
  }

  /* ── History pills ───────────────────────────────────────────────────────── */
  .ssk-history { margin-bottom: 24px; }

  .ssk-history__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 10px;
  }
  .ssk-history__label { width: 120px; height: 11px; border-radius: 3px; }
  .ssk-history__clear { width: 52px;  height: 11px; border-radius: 3px; }

  .ssk-history__pills { display: flex; flex-wrap: wrap; gap: 8px; }
  .ssk-history__pill  { height: 32px; border-radius: 20px; }

  /* ── Browse section ──────────────────────────────────────────────────────── */
  .ssk-browse { }

  .ssk-browse__title {
    width: 140px;
    height: 20px;
    border-radius: 5px;
    margin-bottom: 14px;
  }

  .ssk-browse__grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
  }

  /* ── Tile ────────────────────────────────────────────────────────────────── */
  .ssk-tile {
    height: 104px;
    border-radius: 12px;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    padding: 14px;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    gap: 8px;
    /* Staggered entrance — delay set via inline style */
    animation: ssk-tile-in 0.3s ease both;
  }

  .ssk-tile__avatar { width: 36px; height: 36px; border-radius: 50%; }
  .ssk-tile__label  { width: 65%;  height: 12px; border-radius: 4px; }

  /* ── Responsive — mirrors Search.jsx breakpoints exactly ─────────────────── */
  @media (max-width: 479px) {
    .ssk-hero  { padding: 28px 16px 20px; }
    .ssk-body  { padding: 0 16px 40px; }
    .ssk-browse__grid { grid-template-columns: repeat(2, 1fr); gap: 8px; }
    .ssk-tile  { height: 88px; padding: 10px; }
  }

  @media (min-width: 480px)  { .ssk-browse__grid { grid-template-columns: repeat(3, 1fr); } }
  @media (min-width: 768px)  { .ssk-browse__grid { grid-template-columns: repeat(4, 1fr); gap: 12px; } .ssk-tile { height: 104px; } }
  @media (min-width: 1024px) { .ssk-browse__grid { grid-template-columns: repeat(6, 1fr); } }
`;

export default SearchSkeleton;