/**
 * client/src/components/ui/SectionHeader.jsx
 *
 * Reusable section heading row used on the Home page and any future
 * page that needs a labelled content section with an optional "See all" link.
 *
 * Layout:
 *   [Title]  ·····················  [See all →]   (if `to` is provided)
 *   [Title]                                        (if `to` is omitted)
 *
 * Props:
 *   title   {string}           Required. Section heading text.
 *   to      {string}           Optional. react-router path for "See all" link.
 *   count   {number|string}    Optional. Shown as a muted badge next to title.
 *   action  {ReactNode}        Optional. Custom element instead of "See all".
 *
 * Usage examples:
 *   <SectionHeader title="Artists" to="/artists" />
 *   <SectionHeader title="Albums"  to="/albums"  count={12} />
 *   <SectionHeader title="All Songs" />
 */

import { Link } from 'react-router-dom';

const SectionHeader = ({ title, to, count, action }) => (
  <div className="flex items-center justify-between mb-4">

    {/* ── Left: title + optional count badge ── */}
    <div className="flex items-center gap-2.5">
      <h2 className="text-lg font-bold text-white tracking-tight leading-none">
        {title}
      </h2>

      {count != null && (
        <span className="text-xs text-gray-500 font-medium tabular-nums">
          {count}
        </span>
      )}
    </div>

    {/* ── Right: See all link OR custom action ── */}
    {action ?? (
      to ? (
        <Link
          to={to}
          className={[
            'text-sm font-medium text-emerald-500',
            'hover:text-emerald-400 transition-colors duration-150',
            'focus-visible:outline-none focus-visible:ring-2',
            'focus-visible:ring-emerald-500 rounded',
          ].join(' ')}
        >
          See all
        </Link>
      ) : null
    )}
  </div>
);

export default SectionHeader;