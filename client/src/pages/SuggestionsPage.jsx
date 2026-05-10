/**
 * client/src/pages/SuggestionsPage.jsx
 *
 * User-facing page — two sections:
 *   1. Submit form — share a playlist link with the admin
 *   2. My Submissions — past submissions with status + admin message
 *
 * Uses:
 *   useSubmitSuggestion — POST /api/suggestions
 *   useMySubmissions    — GET  /api/suggestions/mine
 */

import { useState } from 'react';
import {
  LinkIcon,
  CheckCircleIcon,
  ClockIcon,
  ArrowTopRightOnSquareIcon,
} from '@heroicons/react/24/outline';
import { useSubmitSuggestion, useMySubmissions } from '../hooks/useSuggestions';

// ── Helpers ───────────────────────────────────────────────────────────────────

const ALLOWED_HOSTNAMES = new Set([
  'open.spotify.com',
  'youtube.com',
  'www.youtube.com',
  'music.youtube.com',
  'youtu.be',
]);

const isValidUrl = (str) => {
  try {
    const url = new URL(str.trim());
    return url.protocol === 'https:' && ALLOWED_HOSTNAMES.has(url.hostname);
  } catch {
    return false;
  }
};

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

// ── Status config ─────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  pending: {
    badge:   'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20',
    message: 'bg-gray-500/10 border border-gray-500/20 text-gray-300',
  },
  reviewed: {
    badge:   'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
    message: 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-300',
  },
  rejected: {
    badge:   'bg-red-500/10 text-red-400 border border-red-500/20',
    message: 'bg-yellow-500/10 border border-yellow-500/20 text-yellow-300',
  },
};

// ── SubmissionCard ────────────────────────────────────────────────────────────

const SubmissionCard = ({ s }) => {
  const config = STATUS_CONFIG[s.status] ?? STATUS_CONFIG.pending;

  return (
    <div className="bg-[#181818] border border-[#2a2a2a] rounded-xl px-4 py-3.5 flex flex-col gap-2.5">
      {/* Top row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="text-white text-sm font-medium truncate">
            {s.playlistName || <span className="text-gray-500 italic text-xs">No name given</span>}
          </span>
          <span className="text-gray-600 text-xs">{formatDate(s.createdAt)}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${config.badge}`}>
            {s.status}
          </span>
          <a
            href={s.link}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1 rounded text-gray-500 hover:text-purple-400 transition-colors"
            title="Open link"
          >
            <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>

      {/* Admin message */}
      {s.adminMessage && (
        <div className={`rounded-lg px-3 py-2.5 text-xs leading-relaxed ${config.message}`}>
          <span className="font-semibold opacity-70 uppercase tracking-wider text-[10px] block mb-1">
            Admin
          </span>
          {s.adminMessage}
        </div>
      )}

      {/* Resubmit hint for rejected */}
      {s.status === 'rejected' && !s.adminMessage && (
        <p className="text-xs text-yellow-500/70">
          Your suggestion was not accepted. You may submit a new one.
        </p>
      )}
    </div>
  );
};

// ── MySubmissions ─────────────────────────────────────────────────────────────

const MySubmissions = () => {
  const { submissions, loading, isError, refetch } = useMySubmissions();

  return (
    <div className="mt-10">
      <div className="flex items-center gap-2 mb-4">
        <ClockIcon className="w-4 h-4 text-gray-500" />
        <h2 className="text-gray-400 text-sm font-semibold">My Submissions</h2>
      </div>

      {loading && (
        <div className="flex flex-col gap-2">
          {[1, 2].map((n) => (
            <div key={n} className="h-16 rounded-xl bg-[#1a1a1a] animate-pulse" />
          ))}
        </div>
      )}

      {isError && !loading && (
        <div className="text-center py-6">
          <p className="text-red-400 text-xs mb-2">Failed to load submissions.</p>
          <button
            onClick={refetch}
            className="px-3 py-1.5 rounded-lg bg-[#2a2a2a] text-white text-xs hover:bg-[#333] transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {!loading && !isError && submissions.length === 0 && (
        <p className="text-gray-600 text-sm">No submissions yet.</p>
      )}

      {!loading && !isError && submissions.length > 0 && (
        <div className="flex flex-col gap-3">
          {submissions.map((s) => (
            <SubmissionCard key={s.id} s={s} />
          ))}
        </div>
      )}
    </div>
  );
};

// ── SuggestionsPage ───────────────────────────────────────────────────────────

const SuggestionsPage = () => {
  const [link, setLink]               = useState('');
  const [playlistName, setPlaylistName] = useState('');
  const [linkError, setLinkError]     = useState('');
  const [submitted, setSubmitted]     = useState(false);

  const { mutate, isPending } = useSubmitSuggestion();

  const handleSubmit = () => {
    const trimmed = link.trim();
    if (!trimmed) {
      setLinkError('Please paste a playlist link.');
      return;
    }
    if (!isValidUrl(trimmed)) {
      setLinkError('Only public Spotify or YouTube playlist links are accepted.');
      return;
    }
    setLinkError('');

    mutate(
      { link: trimmed, playlistName: playlistName.trim() || null },
      {
        onSuccess: () => setSubmitted(true),
        onError: (err) => {
          if (err?.status === 429) {
            setLinkError("You've already submitted a playlist today. Try again tomorrow.");
          } else if (err?.status === 400) {
            setLinkError(err?.message || 'Invalid submission. Please check the link.');
          } else {
            setLinkError('Something went wrong. Please try again.');
          }
        },
      }
    );
  };

  return (
    <div className="px-4 py-6 md:px-8 md:py-8 max-w-lg">

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <span className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center shrink-0">
          <LinkIcon className="w-5 h-5 text-purple-400" />
        </span>
        <div>
          <h1 className="text-white text-lg font-bold leading-tight">Share a Playlist</h1>
          <p className="text-gray-500 text-sm">Send a playlist link to the admin for review.</p>
        </div>
      </div>

      {/* Success state */}
      {submitted ? (
        <div className="flex flex-col items-center text-center py-8 gap-3 bg-[#181818] border border-[#2a2a2a] rounded-xl">
          <CheckCircleIcon className="w-12 h-12 text-emerald-400" />
          <p className="text-white font-semibold text-base">Thanks! We got it.</p>
          <p className="text-gray-400 text-sm max-w-xs">
            Your playlist link has been sent to the admin. We'll review it and add songs manually.
          </p>
          <button
            onClick={() => { setSubmitted(false); setLink(''); setPlaylistName(''); }}
            className="mt-1 px-5 py-2 rounded-lg bg-[#2a2a2a] text-white text-sm font-medium hover:bg-[#333] transition-colors"
          >
            Share another
          </button>
        </div>
      ) : (
        /* Form */
        <div className="flex flex-col gap-4">

          {/* Link field */}
          <div>
            <label htmlFor="pg-link" className="block text-xs font-medium text-gray-400 mb-1.5">
              Playlist link <span className="text-red-400">*</span>
            </label>
            <input
              id="pg-link"
              type="url"
              value={link}
              onChange={(e) => { setLink(e.target.value); if (linkError) setLinkError(''); }}
              placeholder="https://open.spotify.com/playlist/..."
              disabled={isPending}
              className={[
                'w-full bg-[#111] border rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-600',
                'focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-colors disabled:opacity-50',
                linkError ? 'border-red-500/60' : 'border-[#2a2a2a] focus:border-purple-500/60',
              ].join(' ')}
              autoComplete="off"
              spellCheck={false}
            />
            {linkError && (
              <p className="mt-1.5 text-xs text-red-400" role="alert">{linkError}</p>
            )}
          </div>

          {/* Name field */}
          <div>
            <label htmlFor="pg-name" className="block text-xs font-medium text-gray-400 mb-1.5">
              Playlist name <span className="text-gray-600">(optional)</span>
            </label>
            <input
              id="pg-name"
              type="text"
              value={playlistName}
              onChange={(e) => { if (e.target.value.length <= 50) setPlaylistName(e.target.value); }}
              placeholder="e.g. Chill Vibes 2024"
              disabled={isPending}
              maxLength={50}
              className="w-full bg-[#111] border border-[#2a2a2a] rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/60 transition-colors disabled:opacity-50"
            />
            <p className="mt-1 text-right text-[11px] text-gray-600">{playlistName.length}/50</p>
          </div>

          {/* Info note */}
          <p className="text-xs text-gray-500 bg-[#111] border border-[#222] rounded-lg px-3 py-2.5 leading-relaxed">
            Make sure your playlist is set to{' '}
            <span className="text-white font-medium">Public</span> before sharing —
            private links cannot be reviewed by the admin. No automatic import happens.
          </p>

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={isPending || !link.trim()}
            className="w-full py-2.5 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors"
          >
            {isPending ? 'Sending…' : 'Send to Admin'}
          </button>
        </div>
      )}

      {/* My Submissions section */}
      <MySubmissions />
    </div>
  );
};

export default SuggestionsPage;