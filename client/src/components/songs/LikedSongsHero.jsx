import { useMemo } from "react";

/**
 * LikedSongsHero — FIXED
 *
 * ✅ Root cause fix: This component is now pure-presentational.
 *    It receives `onPlayAll` and `onSmartPlay` as props from LikedSongs.jsx
 *    which owns the playerStore calls. This avoids any store API mismatch.
 *
 * ✅ Hero background fix:
 *    - Primary image always fills 100% via absolute + object-cover (no gaps).
 *    - Blurred mosaic overlay tiles add depth when 2+ covers exist.
 *    - Rich multi-layer gradient ensures text is always legible.
 */
const LikedSongsHero = ({ songs, onPlayAll, onSmartPlay }) => {
  const stats = useMemo(() => {
    if (!songs.length) return null;
    const totalSecs = songs.reduce((acc, s) => acc + (s.duration || 0), 0);
    const mins = Math.floor(totalSecs / 60);
    const hrs = Math.floor(mins / 60);
    const remMins = mins % 60;
    const durationLabel = hrs > 0 ? `${hrs}h ${remMins}m` : `${mins} min`;
    const genres = new Set(songs.map((s) => s.genre).filter(Boolean));
    return { count: songs.length, duration: durationLabel, genres: genres.size };
  }, [songs]);

  const covers = useMemo(() => {
    const unique = [];
    const seen = new Set();
    for (const s of songs) {
      if (s.coverUrl && !seen.has(s.coverUrl)) {
        seen.add(s.coverUrl);
        unique.push(s.coverUrl);
      }
      if (unique.length >= 4) break;
    }
    return unique;
  }, [songs]);

  return (
    <div className="ls-hero">
      {/* Background */}
      <div className="ls-hero__bg" aria-hidden="true">
        {covers[0] ? (
          <img src={covers[0]} alt="" className="ls-hero__bg-base" draggable={false} />
        ) : (
          <div className="ls-hero__bg-fallback" />
        )}
        {/* Mosaic accent tiles — only when 2+ covers */}
        {covers.length >= 2 && (
          <div className="ls-hero__bg-tiles">
            {covers.map((url, i) => (
              <img key={i} src={url} alt="" className="ls-hero__bg-tile" draggable={false} />
            ))}
          </div>
        )}
        {/* Overlays */}
        <div className="ls-hero__ov ls-hero__ov--tint" />
        <div className="ls-hero__ov ls-hero__ov--bottom" />
        <div className="ls-hero__ov ls-hero__ov--left" />
      </div>

      {/* Content */}
      <div className="ls-hero__content">
        <div className="ls-hero__icon" aria-hidden="true">
          <HeartFilledIcon />
        </div>
        <div className="ls-hero__text">
          <p className="ls-hero__label">Playlist</p>
          <h1 className="ls-hero__title">Liked Songs</h1>
          {stats && (
            <div className="ls-stats-bar">
              <span className="ls-stat__value">{stats.count}</span>
              <span className="ls-stat__unit">{stats.count === 1 ? "song" : "songs"}</span>
              <span className="ls-stat__sep">·</span>
              <span className="ls-stat__value">{stats.duration}</span>
              {stats.genres > 0 && (
                <>
                  <span className="ls-stat__sep">·</span>
                  <span className="ls-stat__value">{stats.genres}</span>
                  <span className="ls-stat__unit">{stats.genres === 1 ? "genre" : "genres"}</span>
                </>
              )}
            </div>
          )}
        </div>
        <div className="ls-hero__actions">
          <button className="ls-btn-play" onClick={onPlayAll} disabled={!songs.length} aria-label="Play all">
            <PlayIcon /> Play All
          </button>
          <button className="ls-btn-smart" onClick={onSmartPlay} disabled={!songs.length} aria-label="Smart play">
            <SparkleIcon /> Smart Play
          </button>
        </div>
      </div>
    </div>
  );
};

const HeartFilledIcon = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="#fff" aria-hidden="true">
    <path d="M12 21C12 21 3 14.5 3 8.5C3 5.42 5.42 3 8.5 3C10.24 3 11.91 3.81 13 5.09C14.09 3.81 15.76 3 17.5 3C20.58 3 23 5.42 23 8.5C23 14.5 14 21 12 21Z" />
  </svg>
);
const PlayIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M8 5.14v14l11-7-11-7z" />
  </svg>
);
const SparkleIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6L12 2z" />
  </svg>
);

export default LikedSongsHero;