/**
 * LikedSongsSkeleton — Stage-1 instant shell
 * Renders immediately while useLikedSongs fetches.
 * Uses existing .skeleton CSS class from index.css.
 */
const LikedSongsSkeleton = () => (
  <div className="ls-page">
    {/* Hero skeleton */}
    <div className="ls-hero ls-hero--skeleton">
      <div className="ls-hero__bg">
        <div className="skeleton" style={{ position: "absolute", inset: 0, borderRadius: 0 }} />
      </div>
      <div className="ls-hero__ov ls-hero__ov--tint" />
      <div className="ls-hero__ov ls-hero__ov--bottom" />
      <div className="ls-hero__content">
        <div className="skeleton" style={{ width: 56, height: 56, borderRadius: 16, flexShrink: 0 }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="skeleton" style={{ width: 60, height: 12, borderRadius: 4 }} />
          <div className="skeleton" style={{ width: 200, height: 38, borderRadius: 8 }} />
          <div className="skeleton" style={{ width: 180, height: 14, borderRadius: 6 }} />
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
          <div className="skeleton" style={{ width: 120, height: 40, borderRadius: 999 }} />
          <div className="skeleton" style={{ width: 120, height: 40, borderRadius: 999 }} />
        </div>
      </div>
    </div>

    {/* Filters skeleton */}
    <div className="ls-filters" style={{ borderBottom: "1px solid var(--color-border)" }}>
      <div style={{ display: "flex", gap: 8 }}>
        {[50, 70, 65, 60].map((w, i) => (
          <div key={i} className="skeleton" style={{ width: w, height: 30, borderRadius: 999 }} />
        ))}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <div className="skeleton" style={{ width: 120, height: 30, borderRadius: 6 }} />
        <div className="skeleton" style={{ width: 80, height: 30, borderRadius: 6 }} />
      </div>
    </div>

    {/* Table skeleton */}
    <div className="ls-table-wrap">
      <table className="ls-table">
        <thead>
          <tr className="ls-thead-row">
            <th className="ls-th ls-th--num">#</th>
            <th className="ls-th">TITLE</th>
            <th className="ls-th ls-th--hide-sm">ALBUM</th>
            <th className="ls-th ls-th--hide-md">GENRE</th>
            <th className="ls-th ls-th--right">TIME</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 6 }).map((_, i) => (
            <tr key={i} className="ls-row" style={{ animation: "none", opacity: 1 - i * 0.12 }}>
              <td className="ls-td ls-td--num">
                <div className="skeleton" style={{ width: 14, height: 14, borderRadius: 3, margin: "0 auto" }} />
              </td>
              <td className="ls-td">
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div className="skeleton ls-cover" style={{ flexShrink: 0 }} />
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <div className="skeleton" style={{ width: 100 + i * 18, height: 13, borderRadius: 4 }} />
                    <div className="skeleton" style={{ width: 60, height: 10, borderRadius: 4 }} />
                  </div>
                </div>
              </td>
              <td className="ls-td ls-td--hide-sm">
                <div className="skeleton" style={{ width: 80, height: 13, borderRadius: 4 }} />
              </td>
              <td className="ls-td ls-td--hide-md">
                <div className="skeleton" style={{ width: 52, height: 22, borderRadius: 999 }} />
              </td>
              <td className="ls-td ls-td--right">
                <div className="skeleton" style={{ width: 30, height: 12, borderRadius: 4, marginLeft: "auto" }} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

export default LikedSongsSkeleton;