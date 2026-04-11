/**
 * client/src/components/playlists/PlaylistFilterBar.jsx
 *
 * Search + Sort + View toggle bar for the Playlists page.
 *
 * Props:
 *   searchTerm      — string
 *   onSearchChange  — (term: string) => void
 *   sortKey         — string  (one of SORT_OPTIONS keys)
 *   onSortChange    — (key: string) => void
 *   viewMode        — 'grid' | 'timeline'
 *   onViewChange    — (mode: string) => void
 *   totalCount      — number (total playlists, for display)
 *   filteredCount   — number (after filter, for display)
 */

import React, { useRef, useCallback, useState } from 'react';

// ── Sort options ───────────────────────────────────────────────────────────────
export const SORT_OPTIONS = [
  { key: 'name_asc',    label: 'Name A→Z' },
  { key: 'name_desc',   label: 'Name Z→A' },
  { key: 'date_desc',   label: 'Newest First' },
  { key: 'date_asc',    label: 'Oldest First' },
  { key: 'songs_desc',  label: 'Most Songs' },
  { key: 'songs_asc',   label: 'Fewest Songs' },
];

// ── Sort comparator factory ────────────────────────────────────────────────────
export const getSortComparator = (sortKey) => {
  switch (sortKey) {
    case 'name_asc':   return (a, b) => (a.name ?? '').localeCompare(b.name ?? '');
    case 'name_desc':  return (a, b) => (b.name ?? '').localeCompare(a.name ?? '');
    case 'date_desc':  return (a, b) => {
      const ta = a.createdAt?.toDate?.()?.getTime() ?? a.createdAt ?? 0;
      const tb = b.createdAt?.toDate?.()?.getTime() ?? b.createdAt ?? 0;
      return tb - ta;
    };
    case 'date_asc':   return (a, b) => {
      const ta = a.createdAt?.toDate?.()?.getTime() ?? a.createdAt ?? 0;
      const tb = b.createdAt?.toDate?.()?.getTime() ?? b.createdAt ?? 0;
      return ta - tb;
    };
    case 'songs_desc': return (a, b) => (b.songIds?.length ?? 0) - (a.songIds?.length ?? 0);
    case 'songs_asc':  return (a, b) => (a.songIds?.length ?? 0) - (b.songIds?.length ?? 0);
    default:           return () => 0;
  }
};

// ── Icon components (inline SVG — no dependency) ──────────────────────────────
const GridIcon = ({ active }) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <rect x="1" y="1" width="6" height="6" rx="1.5" fill={active ? '#22c55e' : '#6b7280'} />
    <rect x="9" y="1" width="6" height="6" rx="1.5" fill={active ? '#22c55e' : '#6b7280'} />
    <rect x="1" y="9" width="6" height="6" rx="1.5" fill={active ? '#22c55e' : '#6b7280'} />
    <rect x="9" y="9" width="6" height="6" rx="1.5" fill={active ? '#22c55e' : '#6b7280'} />
  </svg>
);

const TimelineIcon = ({ active }) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <rect x="1" y="2" width="4" height="4" rx="1" fill={active ? '#22c55e' : '#6b7280'} />
    <rect x="7" y="3.5" width="8" height="1.5" rx="0.75" fill={active ? '#22c55e' : '#6b7280'} />
    <rect x="1" y="9" width="4" height="4" rx="1" fill={active ? '#22c55e' : '#6b7280'} />
    <rect x="7" y="10.5" width="8" height="1.5" rx="0.75" fill={active ? '#22c55e' : '#6b7280'} />
  </svg>
);

const SearchIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
    <circle cx="6" cy="6" r="4.5" stroke="#6b7280" strokeWidth="1.5" />
    <path d="M9.5 9.5L12.5 12.5" stroke="#6b7280" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

// ── Component ──────────────────────────────────────────────────────────────────
const PlaylistFilterBar = ({
  searchTerm,
  onSearchChange,
  sortKey,
  onSortChange,
  viewMode,
  onViewChange,
  totalCount = 0,
  filteredCount = 0,
}) => {
  const inputRef = useRef(null);
  const [sortOpen, setSortOpen] = useState(false);
  const activeSortLabel = SORT_OPTIONS.find((o) => o.key === sortKey)?.label ?? 'Sort';

  const handleClearSearch = useCallback(() => {
    onSearchChange('');
    inputRef.current?.focus();
  }, [onSearchChange]);

  const handleSortSelect = useCallback((key) => {
    onSortChange(key);
    setSortOpen(false);
  }, [onSortChange]);

  const showCount = searchTerm.trim().length > 0;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        marginBottom: 20,
        flexWrap: 'wrap',
      }}
    >
      {/* Search input */}
      <div
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          flex: '1 1 200px',
          minWidth: 0,
          maxWidth: 340,
        }}
      >
        <span
          style={{
            position: 'absolute',
            left: 11,
            display: 'flex',
            alignItems: 'center',
            pointerEvents: 'none',
          }}
        >
          <SearchIcon />
        </span>
        <input
          ref={inputRef}
          type="text"
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Filter playlists…"
          aria-label="Filter playlists"
          style={{
            width: '100%',
            background: '#141414',
            border: '1px solid #2a2a2a',
            borderRadius: 8,
            padding: '8px 34px 8px 32px',
            color: '#fff',
            fontSize: 13,
            outline: 'none',
            transition: 'border-color 0.2s ease',
            fontFamily: 'inherit',
          }}
          onFocus={(e) => (e.target.style.borderColor = '#22c55e50')}
          onBlur={(e) => (e.target.style.borderColor = '#2a2a2a')}
        />
        {searchTerm && (
          <button
            onClick={handleClearSearch}
            aria-label="Clear search"
            style={{
              position: 'absolute',
              right: 9,
              background: 'none',
              border: 'none',
              color: '#6b7280',
              cursor: 'pointer',
              fontSize: 16,
              lineHeight: 1,
              padding: '2px 4px',
              borderRadius: 4,
              display: 'flex',
              alignItems: 'center',
            }}
          >
            ×
          </button>
        )}
      </div>

      {/* Count badge */}
      {showCount && (
        <span
          style={{
            color: '#4b5563',
            fontSize: 12,
            whiteSpace: 'nowrap',
          }}
        >
          {filteredCount} of {totalCount}
        </span>
      )}

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Sort dropdown */}
      <div style={{ position: 'relative' }}>
        <button
          onClick={() => setSortOpen((v) => !v)}
          aria-label="Sort playlists"
          aria-expanded={sortOpen}
          style={{
            background: '#141414',
            border: '1px solid #2a2a2a',
            borderRadius: 8,
            padding: '7px 12px',
            color: '#d1d5db',
            fontSize: 12,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            whiteSpace: 'nowrap',
            transition: 'border-color 0.2s ease',
            fontFamily: 'inherit',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#3a3a3a')}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#2a2a2a')}
        >
          <span style={{ color: '#6b7280', fontSize: 11 }}>↕</span>
          {activeSortLabel}
          <span style={{ color: '#6b7280', fontSize: 10, marginLeft: 2 }}>
            {sortOpen ? '▲' : '▼'}
          </span>
        </button>

        {sortOpen && (
          <>
            {/* Backdrop */}
            <div
              style={{ position: 'fixed', inset: 0, zIndex: 49 }}
              onClick={() => setSortOpen(false)}
            />
            {/* Dropdown */}
            <div
              role="listbox"
              aria-label="Sort options"
              style={{
                position: 'absolute',
                right: 0,
                top: 'calc(100% + 6px)',
                background: '#1a1a1a',
                border: '1px solid #2a2a2a',
                borderRadius: 10,
                overflow: 'hidden',
                zIndex: 50,
                minWidth: 160,
                boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                animation: 'dropIn 0.15s ease',
              }}
            >
              <style>{`
                @keyframes dropIn {
                  from { opacity: 0; transform: translateY(-6px); }
                  to   { opacity: 1; transform: translateY(0); }
                }
              `}</style>
              {SORT_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  role="option"
                  aria-selected={opt.key === sortKey}
                  onClick={() => handleSortSelect(opt.key)}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    background: opt.key === sortKey ? '#1f2f22' : 'none',
                    border: 'none',
                    padding: '9px 14px',
                    color: opt.key === sortKey ? '#22c55e' : '#d1d5db',
                    fontSize: 13,
                    cursor: 'pointer',
                    transition: 'background 0.15s ease',
                    fontFamily: 'inherit',
                  }}
                  onMouseEnter={(e) => {
                    if (opt.key !== sortKey) e.currentTarget.style.background = '#222';
                  }}
                  onMouseLeave={(e) => {
                    if (opt.key !== sortKey) e.currentTarget.style.background = 'none';
                  }}
                >
                  {opt.key === sortKey && (
                    <span style={{ marginRight: 8, fontSize: 10 }}>✓</span>
                  )}
                  {opt.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* View toggle */}
      <div
        style={{
          display: 'flex',
          background: '#141414',
          border: '1px solid #2a2a2a',
          borderRadius: 8,
          overflow: 'hidden',
        }}
        role="group"
        aria-label="View mode"
      >
        {[
          { mode: 'grid',     Icon: GridIcon,     label: 'Grid view' },
          { mode: 'timeline', Icon: TimelineIcon, label: 'Timeline view' },
        ].map(({ mode, Icon, label }) => (
          <button
            key={mode}
            onClick={() => onViewChange(mode)}
            aria-label={label}
            aria-pressed={viewMode === mode}
            style={{
              background: viewMode === mode ? '#1f2f22' : 'none',
              border: 'none',
              padding: '7px 10px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background 0.2s ease',
              borderRight: mode === 'grid' ? '1px solid #2a2a2a' : 'none',
            }}
          >
            <Icon active={viewMode === mode} />
          </button>
        ))}
      </div>
    </div>
  );
};

export default PlaylistFilterBar;