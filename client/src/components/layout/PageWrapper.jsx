/**
 * client/src/components/layout/PageWrapper.jsx
 *
 * Layout contract:
 *  - Sits inside the flex row shell in App.jsx
 *  - Takes flex-1 min-w-0 to fill remaining width next to Sidebar
 *  - <main> is the ONLY scroll region — overflow-y-auto + flex-1 + min-h-0
 *  - pb-28 clears the fixed MiniPlayerBar (~80px) with safe zone
 *
 * FIX: Removed any chance of double-scroll. The outer div is a strict
 * flex column with overflow-hidden so only <main> scrolls.
 */

import { useState } from 'react';
import { Bars3Icon, MusicalNoteIcon } from '@heroicons/react/24/outline';
import { NavLink } from 'react-router-dom';
import Sidebar from './Sidebar';

export const PageWrapper = ({ title, children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-full w-full min-w-0 overflow-hidden">

      {/* ── Sidebar ── */}
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* ── Main content column ── */}
      <div className="flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden">

        {/* ── Mobile top bar (shrink-0 so it never compresses) ── */}
        <header className="md:hidden flex items-center gap-3 px-4 py-3 bg-[#111111] border-b border-[#2a2a2a] shrink-0 z-20">
          <button
            className="p-1.5 text-gray-400 hover:text-white transition-colors rounded-md hover:bg-[#2a2a2a]"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open navigation menu"
          >
            <Bars3Icon className="w-5 h-5" />
          </button>

          <NavLink to="/" className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-md bg-emerald-500 flex items-center justify-center">
              <MusicalNoteIcon className="w-3.5 h-3.5 text-white" />
            </span>
            <span className="text-white font-bold text-base tracking-tight">
              MeloStream
            </span>
          </NavLink>
        </header>

        {/*
          ── Scrollable page content ──────────────────────────────────────
          CRITICAL TRIO for scroll inside flex:
            flex-1     → takes all remaining vertical space
            min-h-0    → allows flex child to shrink below content height
            overflow-y-auto → enables scroll when content exceeds height
          pb-28: clears fixed MiniPlayerBar so last song row is reachable
        */}
        <main className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden pb-28">
          {title && (
            <div className="px-6 pt-6 pb-2">
              <h1 className="text-2xl font-bold text-white">{title}</h1>
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
};

export default PageWrapper;