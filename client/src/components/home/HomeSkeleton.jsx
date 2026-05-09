/**
 * client/src/components/home/HomeSkeleton.jsx
 *
 * Skeleton shell for the Home page.
 *
 * Design decisions:
 * - Mirrors the exact layout of Home.jsx: topbar → artists grid → albums grid
 *   → genre pills → song list rows.
 * - Uses the global `.skeleton` class (defined in index.css) for the shimmer.
 *   No local keyframe definitions — one source of truth.
 * - Section counts match the default visible counts in Home (8 artists, 8 albums,
 *   8 song rows) so there is zero layout shift on content load.
 * - Stagger fade-in on song rows via CSS animation-delay so rows cascade in
 *   rather than pop all at once.
 * - All skeleton blocks use CSS variables from colors.css — theme-safe.
 */

/* ── How many placeholders to render ──────────────────────────────────────── */
const RECENT_COUNT = 8;
const SONG_COUNT = 8;
const GENRE_COUNT = 5;

// ─── Sub-pieces ───────────────────────────────────────────────────────────────

/** Mimics the sticky top bar: title + search box + avatar */
const TopbarSkeleton = () => (
  <div className="hsk-topbar" aria-hidden="true">
    <div className="hsk-topbar__left">
      <div className="skeleton hsk-title-bar" />
      <div className="skeleton hsk-count-bar" />
    </div>
    <div className="hsk-topbar__right">
      <div className="skeleton hsk-search-bar" />
      <div className="skeleton hsk-avatar" />
    </div>
  </div>
);

const RecentCardSkeleton = () => (
  <div className="hsk-recent-card" aria-hidden="true">
    <div className="skeleton hsk-recent-cover" />
    <div className="hsk-recent-meta">
      <div className="skeleton hsk-recent-title" />
      <div className="skeleton hsk-recent-artist" />
    </div>
  </div>
);

/** One song row placeholder — index controls stagger delay */
const SongRowSkeleton = ({ index = 0 }) => (
  <div
    className="hsk-song-row"
    aria-hidden="true"
    style={{ animationDelay: `${index * 40}ms` }}
  >
    <div className="skeleton hsk-row-num" />
    <div className="skeleton hsk-row-cover" />
    <div className="hsk-row-meta">
      <div className="skeleton hsk-row-title" />
      <div className="skeleton hsk-row-artist" />
    </div>
    <div className="skeleton hsk-row-album" />
    <div className="skeleton hsk-row-genre" />
    <div className="skeleton hsk-row-dur" />
    <div className="hsk-row-actions">
      <div className="skeleton hsk-row-btn" />
      <div className="skeleton hsk-row-btn" />
    </div>
  </div>
);

/** Section header placeholder: title + "See all" ghost */
const SectionHeaderSkeleton = ({ wide = false }) => (
  <div className="hsk-section-header" aria-hidden="true">
    <div
      className={`skeleton ${wide ? "hsk-sec-title--wide" : "hsk-sec-title"}`}
    />
    <div className="skeleton hsk-sec-see-all" />
  </div>
);

// ─── Main export ──────────────────────────────────────────────────────────────
const HomeSkeleton = () => (
  <>
    <style>{SKELETON_STYLES}</style>

    {/* Topbar */}
    <TopbarSkeleton />

    <div
      className="hsk-body"
      aria-busy="true"
      aria-label="Loading your library"
    >
      {/* Recently Played section */}
      <section className="hsk-section">
        <SectionHeaderSkeleton />
        <div className="hsk-recent-grid">
          {Array.from({ length: RECENT_COUNT }).map((_, i) => (
            <RecentCardSkeleton key={i} />
          ))}
        </div>
      </section>

      {/* Genre pills */}
      <div className="hsk-genres" aria-hidden="true">
        {Array.from({ length: GENRE_COUNT }).map((_, i) => (
          <div
            key={i}
            className="skeleton hsk-genre-pill"
            style={{ width: `${52 + (i % 3) * 18}px` }}
          />
        ))}
      </div>

      {/* Song list */}
      <section className="hsk-section">
        <SectionHeaderSkeleton wide />
        {/* Column header ghost */}
        <div className="hsk-list-header" aria-hidden="true">
          <div className="skeleton hsk-lh-col hsk-lh-col--sm" />
          <div className="hsk-lh-col" /> {/* cover spacer */}
          <div className="skeleton hsk-lh-col hsk-lh-col--title" />
          <div className="skeleton hsk-lh-col hsk-lh-col--album" />
          <div className="skeleton hsk-lh-col hsk-lh-col--genre" />
          <div className="skeleton hsk-lh-col hsk-lh-col--sm" />
          <div className="skeleton hsk-lh-col hsk-lh-col--sm" />
        </div>
        <div className="hsk-divider" />
        <div className="hsk-song-rows">
          {Array.from({ length: SONG_COUNT }).map((_, i) => (
            <SongRowSkeleton key={i} index={i} />
          ))}
        </div>
      </section>
    </div>
  </>
);

// ─── Styles ───────────────────────────────────────────────────────────────────
const SKELETON_STYLES = `
    /* ── Fade-in for the whole skeleton shell ────────────────────────────────── */
    @keyframes hsk-fade-in {
      from { opacity: 0; }
      to   { opacity: 1; }
    }

    /* Staggered row entrance */
    @keyframes hsk-row-in {
      from { opacity: 0; transform: translateY(6px); }
      to   { opacity: 1; transform: translateY(0); }
    }

    /* ── Topbar ──────────────────────────────────────────────────────────────── */
    .hsk-topbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 20px 24px 16px;
      background: var(--color-bg);
      border-bottom: 1px solid var(--color-border-muted);
      animation: hsk-fade-in 0.25s ease;
    }
    .hsk-topbar__left  { display: flex; align-items: center; gap: 10px; }
    .hsk-topbar__right { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }

    .hsk-title-bar  { width: 120px; height: 22px; border-radius: 6px; }
    .hsk-count-bar  { width: 60px;  height: 14px; border-radius: 4px; }
    .hsk-search-bar { width: 260px; height: 38px; border-radius: 10px; }
    .hsk-avatar     { width: 34px;  height: 34px; border-radius: 50%; flex-shrink: 0; }

    /* ── Body ────────────────────────────────────────────────────────────────── */
    .hsk-body {
      padding: 20px 24px 0;
      animation: hsk-fade-in 0.3s ease 0.05s both;
    }

    /* ── Section ─────────────────────────────────────────────────────────────── */
    .hsk-section { margin-bottom: 32px; }

    .hsk-section-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 14px;
    }
    .hsk-sec-title       { width: 80px;  height: 18px; border-radius: 5px; }
    .hsk-sec-title--wide { width: 110px; height: 18px; border-radius: 5px; }
    .hsk-sec-see-all     { width: 44px;  height: 13px; border-radius: 4px; }

   /* ── Recently Played grid ────────────────────────────────────────────────── */
.hsk-recent-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}
.hsk-recent-card {
  display: flex; align-items: center; gap: 10px;
  background: var(--color-surface); border: 1px solid var(--color-border);
  border-radius: 10px; padding: 8px 10px;
}
.hsk-recent-cover  { width: 42px; height: 42px; border-radius: 6px; flex-shrink: 0; }
.hsk-recent-meta   { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
.hsk-recent-title  { width: 75%; height: 13px; border-radius: 4px; }
.hsk-recent-artist { width: 50%; height: 11px; border-radius: 4px; }

    /* ── Genre pills ─────────────────────────────────────────────────────────── */
    .hsk-genres {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 20px;
    }
    .hsk-genre-pill { height: 32px; border-radius: 999px; }

    /* ── List column header ghost ────────────────────────────────────────────── */
    .hsk-list-header {
      display: grid;
      grid-template-columns: 32px 48px 1fr 1fr 100px 52px 80px;
      align-items: center;
      gap: 12px;
      padding: 0 12px 8px;
    }
    .hsk-lh-col        { height: 11px; border-radius: 3px; }
    .hsk-lh-col--sm    { width: 28px; }
    .hsk-lh-col--title { width: 50%; }
    .hsk-lh-col--album { width: 60%; }
    .hsk-lh-col--genre { width: 70%; }

    .hsk-divider {
      height: 1px;
      background: rgba(255, 255, 255, 0.06);
      margin: 0 12px 4px;
    }

    /* ── Song rows ───────────────────────────────────────────────────────────── */
    .hsk-song-rows { display: flex; flex-direction: column; }

    .hsk-song-row {
      display: grid;
      grid-template-columns: 32px 48px 1fr 1fr 100px 52px 80px;
      align-items: center;
      gap: 12px;
      padding: 6px 12px;
      min-height: 60px;
      border-left: 3px solid transparent;
      /* Staggered entrance — delay comes from inline style */
      animation: hsk-row-in 0.3s ease both;
    }
    .hsk-song-row + .hsk-song-row {
      border-top: 1px solid rgba(255, 255, 255, 0.04);
    }

    .hsk-row-num    { width: 20px;  height: 13px; border-radius: 3px; margin: 0 auto; }
    .hsk-row-cover  { width: 48px;  height: 48px; border-radius: 6px; flex-shrink: 0; }
    .hsk-row-meta   { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
    .hsk-row-title  { width: 70%;  height: 14px; border-radius: 4px; }
    .hsk-row-artist { width: 45%;  height: 12px; border-radius: 4px; }
    .hsk-row-album  { width: 60%;  height: 13px; border-radius: 4px; }
    .hsk-row-genre  { width: 80%;  height: 22px; border-radius: 4px; }
    .hsk-row-dur    { width: 36px; height: 13px; border-radius: 3px; margin-left: auto; }
    .hsk-row-actions { display: flex; align-items: center; justify-content: flex-end; gap: 6px; }
    .hsk-row-btn    { width: 28px; height: 28px; border-radius: 50%; }

    /* ── Responsive ──────────────────────────────────────────────────────────── */
  @media (min-width: 480px) {
    .hsk-topbar { padding: 20px 28px 16px; }
    .hsk-body   { padding: 20px 28px 0; }
    .hsk-recent-grid { grid-template-columns: repeat(2, 1fr); }
  }

  @media (min-width: 768px) {
    .hsk-recent-grid { grid-template-columns: repeat(3, 1fr); }
    .hsk-search-bar  { width: 300px; }
  }

  @media (min-width: 1024px) {
    .hsk-recent-grid { grid-template-columns: repeat(4, 1fr); }
    .hsk-search-bar  { width: 340px; }
  }

  @media (max-width: 1023px) {
    .hsk-song-row       { grid-template-columns: 32px 48px 1fr 100px 52px 72px; }
    .hsk-list-header    { grid-template-columns: 32px 48px 1fr 100px 52px 72px; }
    .hsk-row-album,
    .hsk-lh-col--album  { display: none; }
  }

  @media (max-width: 639px) {
    .hsk-topbar         { padding: 14px 16px 12px; flex-wrap: wrap; gap: 10px; }
    .hsk-topbar__left   { width: 100%; }
    .hsk-topbar__right  { width: 100%; }
    .hsk-search-bar     { flex: 1; width: auto; }
    .hsk-body           { padding: 14px 16px 0; }
    .hsk-recent-grid    { grid-template-columns: repeat(2, 1fr); }
    .hsk-song-row       { grid-template-columns: 32px 44px 1fr 48px 64px; gap: 8px; padding: 5px 8px; }
    .hsk-list-header    { grid-template-columns: 32px 44px 1fr 48px 64px; gap: 8px; padding: 0 8px 6px; }
    .hsk-row-album,
    .hsk-row-genre,
    .hsk-lh-col--album,
    .hsk-lh-col--genre  { display: none; }
    .hsk-row-cover      { width: 44px; height: 44px; }
  }

  @media (max-width: 479px) {
    .hsk-recent-grid { grid-template-columns: repeat(1, 1fr); }
  }
  `;

export default HomeSkeleton;
