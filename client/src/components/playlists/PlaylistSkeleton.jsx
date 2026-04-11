/**
 * client/src/components/playlists/PlaylistSkeleton.jsx
 *
 * Shimmer skeleton for playlist cards and timeline rows.
 * Pure CSS animation — no JS, no dependencies.
 * Matches exact dimensions of PlaylistCard to prevent layout shift.
 */

import React from 'react';

// ── Shimmer keyframe injected once ────────────────────────────────────────────
const SHIMMER_STYLE = `
@keyframes meloShimmer {
  0%   { background-position: -400px 0; }
  100% { background-position: 400px 0; }
}
.melo-shimmer {
  background: linear-gradient(
    90deg,
    #1a1a1a 25%,
    #242424 50%,
    #1a1a1a 75%
  );
  background-size: 400px 100%;
  animation: meloShimmer 1.4s ease infinite;
}
`;

let styleInjected = false;
const injectStyle = () => {
  if (styleInjected || typeof document === 'undefined') return;
  const tag = document.createElement('style');
  tag.textContent = SHIMMER_STYLE;
  document.head.appendChild(tag);
  styleInjected = true;
};

// ── Grid Card Skeleton ─────────────────────────────────────────────────────────
export const PlaylistCardSkeleton = () => {
  injectStyle();
  return (
    <div
      style={{
        background: '#141414',
        border: '1px solid #1f1f1f',
        borderRadius: 12,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
      aria-hidden="true"
    >
      {/* Cover art placeholder */}
      <div
        className="melo-shimmer"
        style={{ aspectRatio: '1 / 1', width: '100%' }}
      />

      {/* Text placeholders */}
      <div style={{ padding: '12px 14px 14px' }}>
        {/* Title */}
        <div
          className="melo-shimmer"
          style={{ height: 13, borderRadius: 6, marginBottom: 8, width: '70%' }}
        />
        {/* Song count */}
        <div
          className="melo-shimmer"
          style={{ height: 11, borderRadius: 6, width: '40%', marginBottom: 12 }}
        />
        {/* Last played badge */}
        <div
          className="melo-shimmer"
          style={{ height: 10, borderRadius: 6, width: '55%' }}
        />
      </div>
    </div>
  );
};

// ── Timeline Row Skeleton ──────────────────────────────────────────────────────
export const PlaylistTimelineSkeleton = () => {
  injectStyle();
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '12px 0',
        borderBottom: '1px solid #1a1a1a',
      }}
      aria-hidden="true"
    >
      {/* Thumbnail */}
      <div
        className="melo-shimmer"
        style={{ width: 52, height: 52, borderRadius: 8, flexShrink: 0 }}
      />
      {/* Text */}
      <div style={{ flex: 1 }}>
        <div
          className="melo-shimmer"
          style={{ height: 13, borderRadius: 6, width: '45%', marginBottom: 8 }}
        />
        <div
          className="melo-shimmer"
          style={{ height: 11, borderRadius: 6, width: '25%' }}
        />
      </div>
      {/* Date badge */}
      <div
        className="melo-shimmer"
        style={{ height: 11, borderRadius: 6, width: 70, flexShrink: 0 }}
      />
    </div>
  );
};

// ── Grid skeleton group ────────────────────────────────────────────────────────
export const PlaylistGridSkeleton = ({ count = 6 }) => (
  <div
    style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
      gap: 14,
    }}
  >
    {Array.from({ length: count }, (_, i) => (
      <PlaylistCardSkeleton key={i} />
    ))}
  </div>
);

// ── Timeline skeleton group ────────────────────────────────────────────────────
export const PlaylistTimelineSkeletonGroup = ({ count = 5 }) => (
  <div>
    {/* Section header placeholder */}
    <div
      className="melo-shimmer"
      style={{ height: 11, borderRadius: 6, width: 90, marginBottom: 14 }}
      aria-hidden="true"
    />
    {Array.from({ length: count }, (_, i) => (
      <PlaylistTimelineSkeleton key={i} />
    ))}
  </div>
);

// ── Resume Banner Skeleton ─────────────────────────────────────────────────────
export const ResumeBannerSkeleton = () => {
  injectStyle();
  return (
    <div
      style={{
        background: '#141414',
        border: '1px solid #1f1f1f',
        borderRadius: 14,
        padding: '16px 20px',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        marginBottom: 28,
      }}
      aria-hidden="true"
    >
      <div
        className="melo-shimmer"
        style={{ width: 52, height: 52, borderRadius: 8, flexShrink: 0 }}
      />
      <div style={{ flex: 1 }}>
        <div
          className="melo-shimmer"
          style={{ height: 11, borderRadius: 6, width: 90, marginBottom: 8 }}
        />
        <div
          className="melo-shimmer"
          style={{ height: 14, borderRadius: 6, width: '40%', marginBottom: 6 }}
        />
        <div
          className="melo-shimmer"
          style={{ height: 11, borderRadius: 6, width: '25%' }}
        />
      </div>
      <div
        className="melo-shimmer"
        style={{ width: 84, height: 34, borderRadius: 8, flexShrink: 0 }}
      />
    </div>
  );
};