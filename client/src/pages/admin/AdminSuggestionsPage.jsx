/**
 * client/src/pages/admin/AdminSuggestionsPage.jsx
 *
 * Admin view for playlist suggestions.
 * Features:
 *   - Filter tabs: All / Pending / Reviewed / Rejected
 *   - Table layout: email, playlist name, link (copy + open), date, status
 *   - Expandable row: status dropdown + free-text admin message + Save
 *   - Copy link: clipboard icon → "✓" for 2s then resets
 *   - Firestore timestamp handled correctly via toDate()
 *   - useUpdateSuggestion hook for PATCH /api/suggestions/:id
 */

import { useState, useCallback } from 'react';
import {
  LinkIcon,
  ArrowTopRightOnSquareIcon,
  ClipboardDocumentIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from '@heroicons/react/24/outline';
import { useAdminSuggestions, useUpdateSuggestion } from '../../hooks/useSuggestions';

// ── Constants ─────────────────────────────────────────────────────────────────

const FILTERS = ['all', 'pending', 'reviewed', 'rejected'];

const STATUS_STYLES = {
  pending:  { badge: 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20', dot: 'bg-yellow-400' },
  reviewed: { badge: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20', dot: 'bg-emerald-400' },
  rejected: { badge: 'bg-red-500/10 text-red-400 border border-red-500/20', dot: 'bg-red-400' },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const formatDate = (ts) => {
  if (!ts) return '—';
  try {
    const d = ts?.toDate ? ts.toDate() : new Date(ts._seconds ? ts._seconds * 1000 : ts);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return '—';
  }
};

const truncateUrl = (url, max = 40) => {
  if (!url) return '—';
  try {
    const { hostname, pathname } = new URL(url);
    const full = hostname + pathname;
    return full.length > max ? full.slice(0, max) + '…' : full;
  } catch {
    return url.length > max ? url.slice(0, max) + '…' : url;
  }
};

// ── CopyButton ────────────────────────────────────────────────────────────────

const CopyButton = ({ text }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback((e) => {
    e.stopPropagation();
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }).catch(() => {});
    } else {
      try {
        const el = document.createElement('textarea');
        el.value = text;
        el.style.position = 'fixed';
        el.style.opacity = '0';
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {}
    }
  }, [text]);

  return (
    <button
      onClick={handleCopy}
      title="Copy link"
      className="p-1 rounded text-gray-500 hover:text-gray-300 transition-colors shrink-0"
    >
      {copied
        ? <CheckIcon className="w-3.5 h-3.5 text-emerald-400" />
        : <ClipboardDocumentIcon className="w-3.5 h-3.5" />
      }
    </button>
  );
};

// ── ExpandedRow ───────────────────────────────────────────────────────────────

const ExpandedRow = ({ suggestion, onClose, isMobile = false }) => {
  const [status, setStatus]             = useState(suggestion.status ?? 'pending');
  const [adminMessage, setAdminMessage] = useState(suggestion.adminMessage ?? '');
  const { mutate, isPending }           = useUpdateSuggestion();

  const [saveError, setSaveError] = useState(null);

  const handleSave = () => {
    setSaveError(null);
    mutate(
      { id: suggestion.id, status, adminMessage: adminMessage.trim() || null },
      {
        onSuccess: onClose,
        onError: (err) => setSaveError(err?.message || 'Failed to save. Please try again.'),
      }
    );
  };

  const changed =
    status !== suggestion.status ||
    adminMessage.trim() !== (suggestion.adminMessage ?? '').trim();

const inner = (
        <div className="flex flex-col gap-3 max-w-xl px-4 py-4">

          {/* Status dropdown */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-1.5">
              Status
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="bg-[#1a1a1a] border border-[#2a2a2a] text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-500/50 transition-colors"
            >
              <option value="pending">Pending</option>
              <option value="reviewed">Reviewed</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>

          {/* Message textarea */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-1.5">
              Message to user{' '}
              <span className="text-gray-600 normal-case font-normal">(optional · max 300 chars)</span>
            </label>
            <textarea
              value={adminMessage}
              onChange={(e) => {
                if (e.target.value.length <= 300) setAdminMessage(e.target.value);
              }}
              placeholder="e.g. Your playlist is private — please make it public and resubmit."
              rows={3}
              className="w-full bg-[#1a1a1a] border border-[#2a2a2a] text-white text-sm rounded-lg px-3 py-2.5 placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-500/50 transition-colors resize-none"
            />
            <p className="text-right text-[11px] text-gray-600 mt-1">
              {adminMessage.length}/300
            </p>
          </div>

          {/* Save error */}
          {saveError && (
            <p className="text-xs text-red-400" role="alert">{saveError}</p>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={isPending || !changed}
              className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors"
            >
              {isPending ? 'Saving…' : 'Save'}
            </button>
            <button
              onClick={onClose}
              disabled={isPending}
              className="px-4 py-2 rounded-lg bg-[#2a2a2a] hover:bg-[#333] text-gray-300 text-sm font-medium transition-colors disabled:opacity-40"
            >
              Cancel
            </button>
          </div>
        </div>
  );

  if (isMobile) return inner;
  return (
    <tr className="bg-[#111]">
      <td colSpan={6} className="border-b border-[#2a2a2a]">{inner}</td>
    </tr>
  );
};

// ── SuggestionRow ─────────────────────────────────────────────────────────────

const SuggestionRow = ({ s }) => {
  const [expanded, setExpanded] = useState(false);
  const style = STATUS_STYLES[s.status] ?? STATUS_STYLES.pending;

  return (
    <>
      <tr
        className="border-b border-[#1e1e1e] hover:bg-[#1a1a1a] transition-colors cursor-pointer"
        onClick={() => setExpanded((v) => !v)}
      >
        {/* Email */}
        <td className="px-4 py-3 text-sm text-gray-300 max-w-[180px]">
          <span className="block truncate">{s.userEmail || '—'}</span>
        </td>

        {/* Playlist name */}
        <td className="px-4 py-3 text-sm text-white max-w-[160px]">
          {s.playlistName
            ? <span className="block truncate">{s.playlistName}</span>
            : <span className="text-gray-600 italic text-xs">No name</span>
          }
        </td>

        {/* Link */}
        <td className="px-4 py-3">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-500 font-mono truncate max-w-[160px]">
              {truncateUrl(s.link)}
            </span>
            <CopyButton text={s.link} />
            <a
              href={s.link}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="p-1 rounded text-gray-500 hover:text-purple-400 transition-colors shrink-0"
              title="Open link"
            >
              <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5" />
            </a>
          </div>
        </td>

        {/* Date */}
        <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
          {formatDate(s.createdAt)}
        </td>

        {/* Status */}
        <td className="px-4 py-3">
          <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full ${style.badge}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
            {s.status}
          </span>
        </td>

        {/* Expand toggle */}
        <td className="px-4 py-3 text-gray-600">
          {expanded
            ? <ChevronUpIcon className="w-4 h-4" />
            : <ChevronDownIcon className="w-4 h-4" />
          }
        </td>
      </tr>

      {expanded && (
        <ExpandedRow
          suggestion={s}
          onClose={() => setExpanded(false)}
        />
      )}
    </>
  );
};
// ── MobileCard ────────────────────────────────────────────────────────────────

const MobileCard = ({ s }) => {
  const [expanded, setExpanded] = useState(false);
  const style = STATUS_STYLES[s.status] ?? STATUS_STYLES.pending;

  return (
    <div className="rounded-xl border border-[#2a2a2a] bg-[#181818] overflow-hidden">
      <div
        className="px-4 py-3.5 flex flex-col gap-2 cursor-pointer"
        onClick={() => setExpanded((v) => !v)}
      >
        {/* Top row: email + status */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-gray-300 truncate">{s.userEmail || '—'}</span>
          <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${style.badge}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
            {s.status}
          </span>
        </div>

        {/* Playlist name + date */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-white font-medium truncate">
            {s.playlistName || <span className="text-gray-600 italic text-xs font-normal">No name</span>}
          </span>
          <span className="text-xs text-gray-600 shrink-0">{formatDate(s.createdAt)}</span>
        </div>

        {/* Link row */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-500 font-mono truncate">{truncateUrl(s.link, 32)}</span>
          <CopyButton text={s.link} />
          <a
            href={s.link}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="p-1 rounded text-gray-500 hover:text-purple-400 transition-colors shrink-0"
          >
            <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5" />
          </a>
          <span className="ml-auto text-gray-600">
            {expanded ? <ChevronUpIcon className="w-4 h-4" /> : <ChevronDownIcon className="w-4 h-4" />}
          </span>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-[#2a2a2a]">
          <ExpandedRow suggestion={s} onClose={() => setExpanded(false)} isMobile />
        </div>
      )}
    </div>
  );
};
// ── AdminSuggestionsPage ──────────────────────────────────────────────────────

const AdminSuggestionsPage = () => {
  const [filter, setFilter] = useState('all');
  const {
    suggestions,
    loading,
    isError,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useAdminSuggestions();

  const handleRetry = useCallback(() => {
    refetch();
  }, [refetch]);

  const filtered = filter === 'all'
    ? suggestions
    : suggestions.filter((s) => s.status === filter);

  const countFor = (f) =>
    f === 'all'
      ? suggestions.length
      : suggestions.filter((s) => s.status === f).length;

  return (
    <div className="px-4 py-6 md:px-8 md:py-8">

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <span className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center shrink-0">
          <LinkIcon className="w-5 h-5 text-purple-400" />
        </span>
        <div>
          <h1 className="text-white text-lg font-bold leading-tight">
            Playlist Suggestions
            {!loading && (
              <span className="ml-2 text-sm font-normal text-gray-500">
                ({suggestions.length})
              </span>
            )}
          </h1>
          <p className="text-gray-500 text-sm">Click a row to update status and send a message.</p>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 mb-5 flex-wrap">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={[
              'px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors',
              filter === f
                ? 'bg-[#2a2a2a] text-white'
                : 'text-gray-500 hover:text-gray-300 hover:bg-[#1e1e1e]',
            ].join(' ')}
          >
            {f}{!loading && ` (${countFor(f)}${hasNextPage && f !== 'all' ? '+' : ''})`}
          </button>
        ))}
      </div>

      {/* Loading skeletons */}
      {loading && (
        <div className="flex flex-col gap-2">
          {[1, 2, 3].map((n) => (
            <div key={n} className="h-12 rounded-lg bg-[#1a1a1a] animate-pulse" />
          ))}
        </div>
      )}

      {/* Error */}
      {isError && !loading && (
        <div className="text-center py-12">
          <p className="text-red-400 text-sm mb-3">Failed to load suggestions.</p>
          <button
            onClick={handleRetry}
            className="px-4 py-2 rounded-lg bg-[#2a2a2a] text-white text-sm hover:bg-[#333] transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* Load more */}
      {!loading && !isError && hasNextPage && filter === 'all' && (
        <div className="flex justify-center mt-5">
          <button
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            className="px-5 py-2 rounded-lg bg-[#2a2a2a] hover:bg-[#333] text-white text-sm font-medium transition-colors disabled:opacity-40"
          >
            {isFetchingNextPage ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}

      {/* Empty state */}
      {!loading && !isError && filtered.length === 0 && (
        <p className="text-gray-600 text-sm mt-4">
          {filter === 'all' ? 'No suggestions yet.' : `No ${filter} suggestions.`}
        </p>
      )}

      {/* Table — hidden on mobile */}
      {!loading && !isError && filtered.length > 0 && (
        <>
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto rounded-xl border border-[#2a2a2a]">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#2a2a2a] bg-[#141414]">
                  {['Email', 'Playlist', 'Link', 'Date', 'Status', ''].map((h, i) => (
                    <th
                      key={i}
                      className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-gray-600"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <SuggestionRow key={s.id} s={s} />
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="flex flex-col gap-3 md:hidden">
            {filtered.map((s) => (
              <MobileCard key={s.id} s={s} />
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default AdminSuggestionsPage;