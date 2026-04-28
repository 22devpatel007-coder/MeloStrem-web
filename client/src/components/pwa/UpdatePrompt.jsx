/**
 * client/src/components/pwa/UpdatePrompt.jsx
 *
 * Shows a centered popup when a new SW version is waiting.
 * Listens to the sw:update DOM event fired by index.js → serviceWorkerRegistration.
 *
 * Flow:
 *   1. SW detects new version → serviceWorkerRegistration fires sw:update
 *   2. This component stores the registration and shows the banner
 *   3. User taps "Update" → postMessage SKIP_WAITING → reload
 *   4. User taps "Later" → banner dismissed for this session only
 *
 * Design matches InstallPrompt exactly — same card, same colors, same accent bar.
 */

import { useState, useEffect } from 'react';

export default function UpdatePrompt() {
  const [visible, setVisible]           = useState(false);
  const [registration, setRegistration] = useState(null);

  useEffect(() => {
    const handleUpdate = (e) => {
      setRegistration(e.detail);
      setVisible(true);
    };

    window.addEventListener('sw:update', handleUpdate);
    return () => window.removeEventListener('sw:update', handleUpdate);
  }, []);

  if (!visible) return null;

  const handleUpdate = () => {
    if (registration?.waiting) {
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
    window.location.reload();
  };

  const handleDismiss = () => {
    setVisible(false);
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm"
        onClick={handleDismiss}
      />

      {/* Centered card — matches InstallPrompt layout exactly */}
      <div className="fixed inset-0 z-[9999] flex items-center justify-center px-5 pointer-events-none">
        <div className="pointer-events-auto w-full max-w-sm bg-[#1c1c1c] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">

          {/* Top accent bar */}
          <div className="h-1 w-full bg-gradient-to-r from-green-500 to-green-400" />

          <div className="p-6">
            {/* Icon + title */}
            <div className="flex items-center gap-4 mb-5">
              <img
                src="/icons/icon-192.png"
                alt="MeloStream"
                className="w-14 h-14 rounded-2xl shadow-lg flex-shrink-0"
                onError={(e) => { e.target.style.display = 'none'; }}
              />
              <div className="min-w-0">
                <h2 className="text-white font-bold text-lg leading-tight">Update Available</h2>
                <p className="text-white/40 text-xs truncate">MeloStream</p>
              </div>
            </div>

            {/* Message */}
            <p className="text-white/65 text-sm leading-relaxed mb-5">
              A new version of MeloStream is ready. Update now for the latest fixes and improvements.
            </p>

            {/* Buttons */}
            <div className="flex gap-3">
              <button
                onClick={handleDismiss}
                className="flex-1 py-3 rounded-xl border border-white/10 text-white/50 text-sm font-medium active:bg-white/10 hover:bg-white/5 transition-colors"
              >
                Later
              </button>
              <button
                onClick={handleUpdate}
                className="flex-1 py-3 rounded-xl bg-green-500 hover:bg-green-400 active:bg-green-600 text-black text-sm font-bold transition-colors"
              >
                Update Now
              </button>
            </div>
          </div>

        </div>
      </div>
    </>
  );
}