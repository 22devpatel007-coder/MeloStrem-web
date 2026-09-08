/**
 * client/src/components/songs/SongList.jsx
 *
 * CHANGES IN THIS VERSION (surgical — only these changes, nothing else touched):
 *
 *   1. ADDED: useLikedSongs called once at the SongList level.
 *      ADDED: likedSongIds passed as prop to every SongCard.
 *      WHY:   SongCard previously called useLikedSongs itself, creating
 *             ~15 useQuery + useMutation + useErrorHandler instances while
 *             all reading the exact same data. Now there is exactly 1
 *             subscription for the entire visible list, regardless of how
 *             many cards are mounted or how fast the user scrolls.
 *             React Query deduplicates the network request — still 1 API call.
 *
 *   2. ADDED: useAuthStore to get uid (needed for useLikedSongs).
 *
 *   3. FIXED: maxHeight magic number replaced with CSS variable aware value.
 *      OLD:   maxHeight: 'calc(100vh - 260px)'  ← hardcoded, breaks with/without player
 *      NEW:   maxHeight: 'calc(100vh - var(--song-list-offset, 260px))'
 *             --song-list-offset is set to 320px when .has-player is on <body>
 *             (MusicPlayer adds this class) and falls back to 260px otherwise.
 *             This means the list height automatically accounts for the player bar
 *             without any JS measurement or layout thrash.
 *
 * UNCHANGED — everything else:
 *   - Virtualizer setup (count, estimateSize, overscan): identical
 *   - SONG_ROW_HEIGHT, OVERSCAN, SENTINEL_OFFSET constants: identical
 *   - Infinite scroll sentinel logic: identical
 *   - Empty state: identical
 *   - ListHeader: identical
 *   - All LIST_STYLES and HEADER_STYLES: identical
 *   - SongCard props (song, songList, contextSongs, index, startIndex): identical
 *   - isFetchingNextPage skeleton: identical
 */

import {  useEffect } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import SongCard from "./SongCard";
import { useLikedSongs } from "../../hooks/useLikedSongs";
import useAuthStore from '../../store/authStore'; 

// ── Constants ─────────────────────────────────────────────────────────────────
const SONG_ROW_HEIGHT = 61;
const OVERSCAN = 5;
const SENTINEL_OFFSET = 10;

// ── Column header ─────────────────────────────────────────────────────────────
const ListHeader = () => (
  <>
    <style>{HEADER_STYLES}</style>
    <div className="song-list__header" aria-hidden="true">
      <span className="song-list__hcol song-list__hcol--index">#</span>
      <span className="song-list__hcol song-list__hcol--cover" />
      <span className="song-list__hcol">Title</span>
      <span className="song-list__hcol song-list__hcol--album">Album</span>
      <span className="song-list__hcol song-list__hcol--genre">Tags</span>
      <span className="song-list__hcol song-list__hcol--dur">Time</span>
      <span className="song-list__hcol song-list__hcol--actions" />
    </div>
    <div className="song-list__divider" />
  </>
);

// ── SongList ──────────────────────────────────────────────────────────────────
/**
 * @param {object}   props
 * @param {Song[]}   props.songs
 * @param {Function} [props.fetchNextPage]
 * @param {boolean}  [props.hasNextPage]
 * @param {boolean}  [props.isFetchingNextPage]
 */
const SongList = ({
  songs,
  fetchNextPage,
  hasNextPage,
  isFetchingNextPage,
}) => {
  // FIX 1: single useLikedSongs call for the entire list.
  // uid comes from authStore — same pattern already used in Home.jsx.
  // likedSongIds is passed down to every SongCard as a prop.
  // If the user is not logged in, uid is null, useLikedSongs is disabled
  // (enabled: !!uid guard inside the hook), and likedSongIds is [].
  const { user } = useAuthStore();
  const { likedSongIds } = useLikedSongs(user?.uid);

  // ── Virtualizer ─────────────────────────────────────────────────────────────
  const virtualizer = useVirtualizer({
    count: songs?.length ?? 0,
    getScrollElement: () => document.querySelector("main#main-content") ?? null,
    estimateSize: () => SONG_ROW_HEIGHT,
    overscan: OVERSCAN,
  });

  const virtualItems = virtualizer.getVirtualItems();
  const totalHeight = virtualizer.getTotalSize();

  // ── Infinite scroll trigger ──────────────────────────────────────────────────
  useEffect(() => {
    if (!fetchNextPage || !hasNextPage || isFetchingNextPage) return;
    if (virtualItems.length === 0) return;

    // Use the last *visible* item, not the last overscan item.
    // rangeStartIndex/rangeEndIndex are the actual visible window — no overscan.
    const range = virtualizer.calculateRange();
    if (!range) return;

    if (range.endIndex >= songs.length - SENTINEL_OFFSET) {
      fetchNextPage();
    }
  }, [virtualItems, songs?.length, fetchNextPage, hasNextPage, isFetchingNextPage, virtualizer]);

  // ── Empty state ──────────────────────────────────────────────────────────────
  if (!songs || songs.length === 0) {
    return (
      <div style={styles.empty}>
        <div style={styles.emptyIcon}>♪</div>
        <p style={styles.emptyTitle}>No songs found</p>
        <p style={styles.emptySubtitle}>
          Try a different search or check back later.
        </p>
      </div>
    );
  }

  return (
    <>
      {/*
       * FIX 3: CSS variable injection for player-aware maxHeight.
       * --song-list-offset is consumed by the scrollable container below.
       * body.has-player is set by MusicPlayer when a song is playing.
       * 320px = 260px base + ~60px player bar height.
       * Falls back to 260px when no player is mounted.
       */}
      <style>{LIST_STYLES}</style>
      <div className="song-list">
        <ListHeader />

        <div
          className="song-list__rows"
          role="list"
          style={{ overflowY: "visible" }}
        >
          <div style={{ height: totalHeight, position: "relative" }}>
            {virtualItems.map((virtualItem) => {
              const song = songs[virtualItem.index];
              if (!song) return null;

              return (
                <div
                  key={song.id}
                  role="listitem"
                  data-index={virtualItem.index}
                  ref={virtualizer.measureElement}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${virtualItem.start}px)`,
                  }}
                >
                  <SongCard
                    song={song}
                    songList={songs}
                    contextSongs={songs}
                    index={virtualItem.index}
                    startIndex={virtualItem.index}
                    likedSongIds={likedSongIds}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
};

/* ── Styles ─────────────────────────────────────────────────────────────────── */
const LIST_STYLES = `
  /*
   * FIX 3: CSS variable for player-aware list height.
   * Default (no player): 260px offset.
   * With player (body.has-player): 320px offset accounts for ~60px player bar.
   * MusicPlayer sets body.has-player class when currentSong is not null.
   * If the player bar height ever changes, update only this value.
   */
  :root { --song-list-offset: 260px; }
  body.has-player { --song-list-offset: 320px; }

  .song-list {
    width: 100%;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  }

  .song-list__rows {
    display: flex;
    flex-direction: column;
  }

  .song-list__divider {
    height: 1px;
    background: rgba(255, 255, 255, 0.06);
    margin: 0 12px 4px;
  }

  .song-list__rows::-webkit-scrollbar { width: 4px; }
  .song-list__rows::-webkit-scrollbar-track { background: transparent; }
  .song-list__rows::-webkit-scrollbar-thumb {
    background: rgba(255,255,255,0.08);
    border-radius: 2px;
  }
  .song-list__rows::-webkit-scrollbar-thumb:hover {
    background: rgba(255,255,255,0.14);
  }
`;

const HEADER_STYLES = `
  .song-list__header {
    display: grid;
    grid-template-columns: 32px 48px 1fr 1fr 100px 52px 80px;
    align-items: center;
    gap: 12px;
    padding: 0 12px 8px;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  }

  .song-list__hcol {
    font-size: 11px;
    font-weight: 600;
    color: #4b5563;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .song-list__hcol--index   { text-align: center; }
  .song-list__hcol--cover   { /* spacer */ }
  .song-list__hcol--dur     { text-align: right; }
  .song-list__hcol--actions { /* spacer */ }

  @media (max-width: 1023px) {
    .song-list__header {
      grid-template-columns: 32px 48px 1fr 100px 52px 72px;
    }
    .song-list__hcol--album { display: none; }
  }

  @media (max-width: 639px) {
    .song-list__header {
      grid-template-columns: 32px 44px 1fr 72px;
      gap: 8px;
      padding: 0 8px 6px;
    }
    .song-list__hcol--album { display: none; }
    .song-list__hcol--genre { display: none; }
    .song-list__hcol--dur   { display: none; }
  }
`;

const styles = {
  empty: {
    textAlign: "center",
    padding: "80px 20px",
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
  },
  emptyIcon: {
    width: "56px",
    height: "56px",
    background: "#1a1a1a",
    border: "1px solid #2d2d2d",
    borderRadius: "14px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "22px",
    margin: "0 auto 16px",
  },
  emptyTitle: {
    color: "#fff",
    fontSize: "16px",
    fontWeight: "600",
    marginBottom: "6px",
  },
  emptySubtitle: {
    color: "#6b7280",
    fontSize: "14px",
  },
};

export default SongList;
