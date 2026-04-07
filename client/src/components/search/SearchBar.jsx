// PERMANENT FIX: SearchBar is fully rewritten to fix the mobile keyboard dismissal bug.
//
// Root cause: navigate() was called inside onChange on every keystroke,
// triggering a history state change that causes Android/iOS virtual keyboards to close.
//
// Fix: input value is purely local React state. URL update happens via a 300ms debounced
// useEffect only. Suggestion dropdown reads from SongsContext (zero network calls).
// The keyboard never closes because nothing navigates while the user is typing.
//
// PERMANENT FIX 2: The empty-query useEffect was calling navigate('/search') unconditionally,
// which caused ANY page that renders <SearchBar /> (e.g. Home) to immediately redirect
// to /search on mount. Fixed by only navigating to /search when already on /search.
//
// PERMANENT FIX 3: Search history stored in localStorage (key: 'melo_search_history').
// History is shown in the dropdown when the input is focused AND empty.
// Queries are saved only on deliberate actions: Enter submit or clicking a suggestion.
// Max 8 entries, most-recent-first, duplicates bumped to top.
// Each entry can be individually deleted. "Clear all" wipes the list.

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { useSongs } from "../../hooks/useSongs";
import { usePlayerStore } from "../../store/playerStore";

const DEBOUNCE_MS = 300;
const MAX_RESULTS = 6;
const MAX_HISTORY = 8;
const BLUR_DELAY_MS = 150;
const HISTORY_KEY = "melo_search_history";

// ── localStorage helpers ──────────────────────────────────────────────────────
function readHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeHistory(entries) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(entries));
  } catch {
    // localStorage quota exceeded or unavailable — fail silently
  }
}

// Adds a query to history: deduplicates, bumps to top, caps at MAX_HISTORY.
function pushHistory(query) {
  const trimmed = query.trim();
  if (!trimmed || trimmed.length < 2) return;
  const prev = readHistory().filter(
    (q) => q.toLowerCase() !== trimmed.toLowerCase(),
  );
  const next = [trimmed, ...prev].slice(0, MAX_HISTORY);
  writeHistory(next);
}

function removeHistoryEntry(query) {
  const next = readHistory().filter((q) => q !== query);
  writeHistory(next);
}

function clearHistory() {
  writeHistory([]);
}

// ── Score a song against a query ──────────────────────────────────────────────
function scoreSong(song, q) {
  const query = q.toLowerCase();
  const title = (song.title || "").toLowerCase();
  const artist = (song.artist || "").toLowerCase();
  let score = 0;

  if (title === query) score += 5;
  else if (title.startsWith(query)) score += 4;
  else if (title.includes(query)) score += 3;

  if (artist === query) score += 3;
  else if (artist.startsWith(query)) score += 2;
  else if (artist.includes(query)) score += 1;

  return score;
}

// ── Highlight matching text ───────────────────────────────────────────────────
function HighlightedText({ text, query, style }) {
  if (!query || !text) return <span style={style}>{text}</span>;

  const lower = text.toLowerCase();
  const idx = lower.indexOf(query.toLowerCase());
  if (idx === -1) return <span style={style}>{text}</span>;

  const before = text.slice(0, idx);
  const match = text.slice(idx, idx + query.length);
  const after = text.slice(idx + query.length);

  return (
    <span style={style}>
      {before}
      <span style={{ color: "#22c55e", fontWeight: 700 }}>{match}</span>
      {after}
    </span>
  );
}

const SearchBar = () => {
  const { data: songsData } = useSongs();
  // Flatten pages if using infinite query
  const songs = useMemo(() => songsData?.pages?.flatMap((p) => p.songs) || [], [songsData]);
  
  const { playSong } = usePlayerStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const isOnSearchPage = location.pathname === "/search";

  // Local input state — decoupled from URL
  const [query, setQuery] = useState(searchParams.get("q") || "");
  const [focused, setFocused] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [showDropdown, setShowDropdown] = useState(false);

  // History state — read from localStorage on mount
  const [history, setHistory] = useState(() => readHistory());

  const inputRef = useRef(null);
  const debounceRef = useRef(null);
  const blurTimerRef = useRef(null);
  const containerRef = useRef(null);

  // ── Refresh history from localStorage whenever dropdown opens ─────────────
  // Handles the case where another tab modifies history.
  useEffect(() => {
    if (focused) setHistory(readHistory());
  }, [focused]);

  // ── Compute suggestions whenever query or songs changes ───────────────────
  useEffect(() => {
    const q = query.trim();
    if (!q || !songs.length) {
      setSuggestions([]);
      return;
    }

    const scored = songs
      .map((s) => ({ song: s, score: scoreSong(s, q) }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_RESULTS)
      .map(({ song }) => song);

    setSuggestions(scored);
    setActiveIdx(-1);
  }, [query, songs]);

  // ── Show/hide dropdown ────────────────────────────────────────────────────
  // Show when focused AND (has query for suggestions OR empty for history).
  useEffect(() => {
    const q = query.trim();
    if (!focused) {
      setShowDropdown(false);
      return;
    }
    // Show if: there are suggestions to display, OR input is empty with history
    const hasSuggestions = q.length >= 1 && suggestions.length > 0;
    const hasNoResults = q.length >= 2 && suggestions.length === 0;
    const hasHistory = q.length === 0 && history.length > 0;
    setShowDropdown(hasSuggestions || hasNoResults || hasHistory);
  }, [focused, query, suggestions, history]);

  // ── Debounced URL update — never fires inside onChange ────────────────────
  useEffect(() => {
    clearTimeout(debounceRef.current);

    if (!query.trim()) {
      if (isOnSearchPage) {
        navigate("/search", { replace: true });
      }
      return;
    }

    debounceRef.current = setTimeout(() => {
      if (query.trim().length >= 2) {
        navigate(`/search?q=${encodeURIComponent(query.trim())}`, {
          replace: true,
        });
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(debounceRef.current);
  }, [query, isOnSearchPage, navigate]);

  // ── Click outside to close ────────────────────────────────────────────────
  useEffect(() => {
    const handleOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setShowDropdown(false);
        setFocused(false);
      }
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleChange = (e) => {
    setQuery(e.target.value);
    // No navigate() here — that's the entire fix
  };

  const handleFocus = () => {
    clearTimeout(blurTimerRef.current);
    setFocused(true);
  };

  const handleBlur = () => {
    blurTimerRef.current = setTimeout(() => {
      setFocused(false);
    }, BLUR_DELAY_MS);
  };

  const handleClear = () => {
    setQuery("");
    setSuggestions([]);
    if (isOnSearchPage) {
      navigate("/search", { replace: true });
    }
    inputRef.current?.focus();
  };

  // Saves query to history and navigates — called on Enter submit.
  const handleSubmit = (e) => {
    e.preventDefault();
    if (activeIdx >= 0 && suggestions[activeIdx]) {
      playSuggestion(suggestions[activeIdx]);
    } else if (query.trim().length >= 2) {
      pushHistory(query.trim());
      setHistory(readHistory());
      navigate(`/search?q=${encodeURIComponent(query.trim())}`);
      setShowDropdown(false);
    }
  };

  // Saves query to history and navigates — called when a history chip is clicked.
  const handleHistoryClick = useCallback(
    (entry) => {
      setQuery(entry);
      pushHistory(entry);
      setHistory(readHistory());
      navigate(`/search?q=${encodeURIComponent(entry)}`);
      setShowDropdown(false);
      inputRef.current?.blur();
    },
    [navigate],
  );

  // Removes a single history entry without closing the dropdown.
  const handleHistoryDelete = useCallback((e, entry) => {
    e.stopPropagation(); // prevent handleHistoryClick from firing
    removeHistoryEntry(entry);
    setHistory(readHistory());
  }, []);

  // Clears all history and closes the dropdown.
  const handleClearAll = useCallback((e) => {
    e.stopPropagation();
    clearHistory();
    setHistory([]);
    setShowDropdown(false);
  }, []);

  // Plays a suggestion and saves the current query to history.
  const playSuggestion = useCallback(
    (song) => {
      if (query.trim().length >= 2) {
        pushHistory(query.trim());
        setHistory(readHistory());
      }
      playSong(song, suggestions);
      setShowDropdown(false);
      inputRef.current?.blur();
    },
    [playSong, suggestions, query],
  );

  const handleKeyDown = (e) => {
    // When history is showing (empty input), arrow keys navigate history rows.
    const activeList = query.trim().length === 0 ? history : suggestions;
    if (!showDropdown || !activeList.length) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((prev) => (prev + 1) % activeList.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx(
        (prev) => (prev - 1 + activeList.length) % activeList.length,
      );
    } else if (
      e.key === "Enter" &&
      query.trim().length === 0 &&
      activeIdx >= 0
    ) {
      // Enter on a history row — navigate to that query
      e.preventDefault();
      handleHistoryClick(history[activeIdx]);
    } else if (e.key === "Escape") {
      setShowDropdown(false);
      setActiveIdx(-1);
      inputRef.current?.focus();
    }
  };

  const q = query.trim();
  const showHistory = focused && q.length === 0 && history.length > 0;
  const showSuggs = focused && q.length >= 1;

  return (
    <div ref={containerRef} style={styles.container}>
      <form onSubmit={handleSubmit} style={styles.form} role="search">
        <div
          role="combobox"
          aria-expanded={showDropdown}
          aria-haspopup="listbox"
          aria-controls="search-dropdown"
          aria-owns="search-dropdown"
          style={{
            ...styles.wrap,
            borderColor: focused ? "#22c55e" : "#2d2d2d",
            boxShadow: focused ? "0 0 0 3px rgba(34,197,94,0.1)" : "none",
            borderBottomLeftRadius: showDropdown ? 0 : 10,
            borderBottomRightRadius: showDropdown ? 0 : 10,
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 20 20"
            fill="none"
            style={{
              flexShrink: 0,
              color: focused ? "#22c55e" : "#6b7280",
              transition: "color 0.2s",
            }}
          >
            <circle
              cx="8.5"
              cy="8.5"
              r="5.5"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            <path
              d="M14 14l3 3"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>

          <input
            ref={inputRef}
            type="search"
            placeholder="Search songs or artists…"
            value={query}
            onChange={handleChange}
            onFocus={handleFocus}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            style={styles.input}
            aria-label="Search songs or artists"
            aria-autocomplete="list"
            aria-controls="search-dropdown"
            autoComplete="off"
            spellCheck={false}
          />

          {query.length > 0 && (
            <button
              type="button"
              onClick={handleClear}
              style={styles.clearBtn}
              aria-label="Clear search"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>

        {/* ── Dropdown ───────────────────────────────────────────────────── */}
        {showDropdown && (
          <div id="search-dropdown" style={styles.dropdown} role="listbox">
            {/* History panel — shown only when input is empty */}
            {showHistory && (
              <>
                <div style={styles.dropdownHeader}>
                  <span style={styles.dropdownLabel}>Recent searches</span>
                  <button
                    type="button"
                    onMouseDown={handleClearAll}
                    style={styles.clearAllBtn}
                  >
                    Clear all
                  </button>
                </div>

                {history.map((entry, i) => (
                  <div
                    key={entry}
                    role="option"
                    aria-selected={i === activeIdx}
                    onMouseDown={() => handleHistoryClick(entry)}
                    onMouseEnter={() => setActiveIdx(i)}
                    style={{
                      ...styles.historyRow,
                      background:
                        i === activeIdx
                          ? "rgba(34,197,94,0.06)"
                          : "transparent",
                      borderLeft:
                        i === activeIdx
                          ? "2px solid #22c55e"
                          : "2px solid transparent",
                    }}
                  >
                    {/* Clock icon */}
                    <span style={styles.historyIcon}>
                      <svg
                        width="13"
                        height="13"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                      </svg>
                    </span>

                    <span style={styles.historyText}>{entry}</span>

                    {/* Per-entry delete button */}
                    <button
                      type="button"
                      onMouseDown={(e) => handleHistoryDelete(e, entry)}
                      style={styles.historyDeleteBtn}
                      aria-label={`Remove ${entry} from history`}
                    >
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                      >
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                ))}
              </>
            )}

            {/* Song suggestions — shown when query has text */}
            {showSuggs &&
              (suggestions.length > 0 ? (
                suggestions.map((song, i) => (
                  <div
                    key={song.id}
                    role="option"
                    aria-selected={i === activeIdx}
                    onMouseDown={() => playSuggestion(song)}
                    onMouseEnter={() => setActiveIdx(i)}
                    style={{
                      ...styles.suggestionRow,
                      background:
                        i === activeIdx
                          ? "rgba(34,197,94,0.08)"
                          : "transparent",
                      borderLeft:
                        i === activeIdx
                          ? "2px solid #22c55e"
                          : "2px solid transparent",
                    }}
                  >
                    <img
                      src={
                        song.coverUrl ||
                        "https://placehold.co/36x36/111/555?text=♪"
                      }
                      alt=""
                      style={styles.suggestionCover}
                      onError={(e) => {
                        e.target.src =
                          "https://placehold.co/36x36/111/555?text=♪";
                      }}
                    />
                    <div style={styles.suggestionText}>
                      <HighlightedText
                        text={song.title}
                        query={q}
                        style={styles.suggestionTitle}
                      />
                      <HighlightedText
                        text={song.artist}
                        query={q}
                        style={styles.suggestionArtist}
                      />
                    </div>
                    <span style={styles.suggestionPlay}>▶</span>
                  </div>
                ))
              ) : q.length >= 2 ? (
                <div style={styles.noResults}>
                  No results for <span style={{ color: "#fff" }}>"{q}"</span>
                </div>
              ) : null)}
          </div>
        )}
      </form>
    </div>
  );
};

const styles = {
  container: {
    width: "100%",
    maxWidth: "340px",
    position: "relative",
    zIndex: 100,
  },
  form: {
    width: "100%",
  },
  wrap: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    background: "#1a1a1a",
    border: "1px solid #2d2d2d",
    borderRadius: "10px",
    padding: "0 12px",
    height: "42px",
    transition: "border-color 0.2s, box-shadow 0.2s, border-radius 0.1s",
  },
  input: {
    flex: 1,
    background: "transparent",
    border: "none",
    outline: "none",
    color: "#fff",
    fontSize: "14px",
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    WebkitAppearance: "none",
  },
  clearBtn: {
    background: "none",
    border: "none",
    color: "#6b7280",
    cursor: "pointer",
    padding: "2px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    transition: "color 0.15s",
  },
  dropdown: {
    position: "absolute",
    top: "100%",
    left: 0,
    right: 0,
    background: "#1a1a1a",
    border: "1px solid #22c55e",
    borderTop: "1px solid #2d2d2d",
    borderRadius: "0 0 10px 10px",
    overflow: "hidden",
    boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
  },

  // ── History styles ──────────────────────────────────────────────────────
  dropdownHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "8px 12px 4px",
  },
  dropdownLabel: {
    color: "#4b5563",
    fontSize: "11px",
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  clearAllBtn: {
    background: "none",
    border: "none",
    color: "#6b7280",
    fontSize: "11px",
    cursor: "pointer",
    padding: "2px 0",
    fontFamily: "'Inter', sans-serif",
    transition: "color 0.15s",
  },
  historyRow: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "8px 12px",
    cursor: "pointer",
    transition: "background 0.1s",
    borderBottom: "1px solid #1e1e1e",
  },
  historyIcon: {
    color: "#4b5563",
    display: "flex",
    alignItems: "center",
    flexShrink: 0,
  },
  historyText: {
    flex: 1,
    color: "#d1d5db",
    fontSize: "13px",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  historyDeleteBtn: {
    background: "none",
    border: "none",
    color: "#4b5563",
    cursor: "pointer",
    padding: "3px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    borderRadius: "4px",
    transition: "color 0.15s, background 0.15s",
  },

  // ── Suggestion styles (unchanged) ───────────────────────────────────────
  suggestionRow: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "8px 12px",
    cursor: "pointer",
    transition: "background 0.1s",
    borderBottom: "1px solid #222",
  },
  suggestionCover: {
    width: "36px",
    height: "36px",
    borderRadius: "6px",
    objectFit: "cover",
    flexShrink: 0,
  },
  suggestionText: {
    flex: 1,
    minWidth: 0,
  },
  suggestionTitle: {
    display: "block",
    color: "#fff",
    fontSize: "13px",
    fontWeight: 600,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    marginBottom: "2px",
  },
  suggestionArtist: {
    display: "block",
    color: "#6b7280",
    fontSize: "11px",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  suggestionPlay: {
    color: "#4b5563",
    fontSize: "10px",
    flexShrink: 0,
  },
  noResults: {
    padding: "14px 16px",
    color: "#6b7280",
    fontSize: "13px",
  },
};

export default SearchBar;