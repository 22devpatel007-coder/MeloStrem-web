/**
 * client/src/components/search/SearchBar.jsx  — PRODUCTION READY
 *
 * WHAT THIS FILE DOES:
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure search-input component. Owns the input box, debounced URL update,
 * and the "recent searches" dropdown (shows only when focused + query empty).
 *
 * Playback is intentionally NOT done here — Search.jsx handles playback
 * via SongCard which always has fully populated song objects from the API.
 *
 * FEATURES:
 *  ✅ Debounced URL update (300ms) — keyboard never closes on Android/iOS
 *  ✅ Only navigates to /search when already on /search (no redirect bug)
 *  ✅ Recent searches dropdown — shown when focused and input is empty
 *  ✅ Per-entry history delete + clear all
 *  ✅ Keyboard navigation (ArrowUp/ArrowDown through history, Escape to close)
 *  ✅ Click outside to close
 *  ✅ Clear (×) button
 *  ✅ Controlled input — decoupled from URL
 *  ✅ Focus/blur handling with blur delay to allow clicks inside dropdown
 *  ✅ History shared via searchHistory util — stays in sync with Search.jsx page
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import {
  readHistory,
  pushHistory,
  removeHistoryEntry,
  clearHistory,
} from '../../utils/searchHistory';

const DEBOUNCE_MS   = 300;
const BLUR_DELAY_MS = 150;

// ─── Component ────────────────────────────────────────────────────────────────
const SearchBar = () => {
  const navigate        = useNavigate();
  const location        = useLocation();
  const [searchParams]  = useSearchParams();

  const isOnSearchPage = location.pathname === '/search';

  // Local input state — decoupled from URL
  const [query,        setQuery]        = useState(searchParams.get('q') || '');
  const [focused,      setFocused]      = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  // History state — sourced from shared util (same localStorage key as Search.jsx)
  const [history,   setHistory]   = useState(() => readHistory());
  const [activeIdx, setActiveIdx] = useState(-1);

  const inputRef     = useRef(null);
  const debounceRef  = useRef(null);
  const blurTimerRef = useRef(null);
  const containerRef = useRef(null);

  // ── Refresh history from localStorage whenever input is focused ────────────
  useEffect(() => {
    if (focused) setHistory(readHistory());
  }, [focused]);

  // ── Show/hide dropdown — only when focused, empty query, and has history ──
  useEffect(() => {
    setShowDropdown(focused && query.trim().length === 0 && history.length > 0);
  }, [focused, query, history.length]);

  // ── Debounced URL update ───────────────────────────────────────────────────
  useEffect(() => {
    clearTimeout(debounceRef.current);

    if (!query.trim()) {
      // Only clear the URL if already on the search page — prevents redirect bug
      if (isOnSearchPage) {
        navigate('/search', { replace: true });
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

  // ── Click outside to close dropdown ──────────────────────────────────────
  useEffect(() => {
    const handleOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setShowDropdown(false);
        setFocused(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleChange = (e) => {
    setQuery(e.target.value);
    setActiveIdx(-1);
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
    setQuery('');
    setActiveIdx(-1);
    if (isOnSearchPage) {
      navigate('/search', { replace: true });
    }
    inputRef.current?.focus();
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    // Keyboard-navigated history item
    if (activeIdx >= 0 && history[activeIdx]) {
      handleHistoryClick(history[activeIdx]);
      return;
    }
    if (query.trim().length >= 2) {
      pushHistory(query.trim());
      setHistory(readHistory());
      navigate(`/search?q=${encodeURIComponent(query.trim())}`);
      setShowDropdown(false);
    }
  };

  const handleHistoryClick = useCallback(
    (entry) => {
      setQuery(entry);
      pushHistory(entry);
      setHistory(readHistory());
      navigate(`/search?q=${encodeURIComponent(entry)}`);
      setShowDropdown(false);
      setActiveIdx(-1);
      inputRef.current?.blur();
    },
    [navigate]
  );

  const handleHistoryDelete = useCallback((e, entry) => {
    e.stopPropagation();
    removeHistoryEntry(entry);
    setHistory(readHistory());
  }, []);

  const handleClearAll = useCallback((e) => {
    e.stopPropagation();
    clearHistory();
    setHistory([]);
    setShowDropdown(false);
  }, []);

  const handleKeyDown = (e) => {
    if (!showDropdown || !history.length) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((prev) => (prev + 1) % history.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((prev) => (prev - 1 + history.length) % history.length);
    } else if (e.key === 'Escape') {
      setShowDropdown(false);
      setActiveIdx(-1);
      inputRef.current?.focus();
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div ref={containerRef} style={styles.container}>
      <form onSubmit={handleSubmit} style={styles.form} role="search">
        <div
          role="combobox"
          aria-expanded={showDropdown}
          aria-haspopup="listbox"
          aria-controls="search-history-dropdown"
          style={{
            ...styles.wrap,
            borderColor:             focused ? '#22c55e' : '#2d2d2d',
            boxShadow:               focused ? '0 0 0 3px rgba(34,197,94,0.1)' : 'none',
            borderBottomLeftRadius:  showDropdown ? 0 : 10,
            borderBottomRightRadius: showDropdown ? 0 : 10,
          }}
        >
          {/* Search icon */}
          <svg
            width="16"
            height="16"
            viewBox="0 0 20 20"
            fill="none"
            style={{
              flexShrink: 0,
              color:      focused ? '#22c55e' : '#6b7280',
              transition: 'color 0.2s',
            }}
          >
            <circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M14 14l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>

          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={handleChange}
            onFocus={handleFocus}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            placeholder="Search songs, artists…"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            aria-label="Search"
            aria-autocomplete="list"
            aria-controls="search-history-dropdown"
            style={styles.input}
          />

          {/* Clear button — only when there's input */}
          {query.length > 0 && (
            <button
              type="button"
              onClick={handleClear}
              style={styles.clearBtn}
              aria-label="Clear search"
              tabIndex={-1}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6"  x2="6"  y2="18" />
                <line x1="6"  y1="6"  x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>

        {/* ── Recent searches dropdown — focused + empty query only ── */}
        {showDropdown && (
          <div id="search-history-dropdown" role="listbox" style={styles.dropdown}>
            {/* Header */}
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
                style={{
                  ...styles.historyRow,
                  background: i === activeIdx ? 'rgba(34,197,94,0.06)' : 'transparent',
                  borderLeft: i === activeIdx ? '2px solid #22c55e' : '2px solid transparent',
                }}
              >
                {/* Clock icon */}
                <span style={styles.historyIcon}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 7v5l3 3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>

                <span style={styles.historyText}>{entry}</span>

                {/* Per-entry delete */}
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    handleHistoryDelete(e, entry);
                  }}
                  style={styles.historyDeleteBtn}
                  aria-label={`Remove "${entry}" from history`}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="18" y1="6"  x2="6"  y2="18" />
                    <line x1="6"  y1="6"  x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </form>
    </div>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = {
  container: {
    width:    '100%',
    maxWidth: '340px',
    position: 'relative',
    zIndex:   100,
  },
  form: {
    width: '100%',
  },
  wrap: {
    display:      'flex',
    alignItems:   'center',
    gap:          '10px',
    background:   '#1a1a1a',
    border:       '1px solid #2d2d2d',
    borderRadius: '10px',
    padding:      '0 12px',
    height:       '42px',
    transition:   'border-color 0.2s, box-shadow 0.2s, border-radius 0.1s',
  },
  input: {
    flex:             1,
    background:       'transparent',
    border:           'none',
    outline:          'none',
    color:            '#fff',
    fontSize:         '14px',
    fontFamily:       "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    WebkitAppearance: 'none',
  },
  clearBtn: {
    background:     'none',
    border:         'none',
    color:          '#6b7280',
    cursor:         'pointer',
    padding:        '2px',
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'center',
    flexShrink:     0,
    transition:     'color 0.15s',
  },
  dropdown: {
    position:     'absolute',
    top:          '100%',
    left:         0,
    right:        0,
    background:   '#1a1a1a',
    border:       '1px solid #22c55e',
    borderTop:    '1px solid #2d2d2d',
    borderRadius: '0 0 10px 10px',
    overflow:     'hidden',
    boxShadow:    '0 8px 32px rgba(0,0,0,0.5)',
  },
  dropdownHeader: {
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'space-between',
    padding:        '8px 12px 4px',
  },
  dropdownLabel: {
    color:         '#4b5563',
    fontSize:      '11px',
    fontWeight:    '600',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  clearAllBtn: {
    background: 'none',
    border:     'none',
    color:      '#6b7280',
    fontSize:   '11px',
    cursor:     'pointer',
    padding:    '2px 0',
    fontFamily: "'Inter', sans-serif",
    transition: 'color 0.15s',
  },
  historyRow: {
    display:      'flex',
    alignItems:   'center',
    gap:          '10px',
    padding:      '8px 12px',
    cursor:       'pointer',
    transition:   'background 0.1s',
    borderBottom: '1px solid #1e1e1e',
  },
  historyIcon: {
    color:      '#4b5563',
    display:    'flex',
    alignItems: 'center',
    flexShrink: 0,
  },
  historyText: {
    flex:         1,
    color:        '#d1d5db',
    fontSize:     '13px',
    whiteSpace:   'nowrap',
    overflow:     'hidden',
    textOverflow: 'ellipsis',
  },
  historyDeleteBtn: {
    background:     'none',
    border:         'none',
    color:          '#4b5563',
    cursor:         'pointer',
    padding:        '3px',
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'center',
    flexShrink:     0,
    borderRadius:   '4px',
    transition:     'color 0.15s, background 0.15s',
  },
};

export default SearchBar;