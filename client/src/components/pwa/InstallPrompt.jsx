/**
 * client/src/components/pwa/InstallPrompt.jsx
 *
 * Centered popup on ALL devices — mobile, tablet, desktop.
 * No bottom sheet. No conflict with mobile nav bar.
 */

import { useState, useEffect } from 'react';
import { useInstallPrompt } from '../../hooks/useInstallPrompt';

export default function InstallPrompt() {
  const { canInstall, isIOS, isInstalled, promptInstall, dismiss } = useInstallPrompt();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isInstalled) return;
    if (!canInstall && !isIOS) return;
    const timer = setTimeout(() => setVisible(true), 2000);
    return () => clearTimeout(timer);
  }, [canInstall, isIOS, isInstalled]);

  if (!visible) return null;
  if (!canInstall && !isIOS) return null;

  const handleDismiss = () => {
    dismiss();
    setVisible(false);
  };

  const handleInstall = async () => {
    const outcome = await promptInstall();
    if (outcome === 'accepted' || outcome === null) setVisible(false);
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm"
        onClick={handleDismiss}
      />

      {/* Centered card on ALL screen sizes */}
      <div className="fixed inset-0 z-[9999] flex items-center justify-center px-5 pointer-events-none">
        <div className="pointer-events-auto w-full max-w-sm bg-[#1c1c1c] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">

          {/* Top accent bar */}
          <div className="h-1 w-full bg-gradient-to-r from-green-500 to-green-400" />

          <div className="p-6">
            {/* App icon + name */}
            <div className="flex items-center gap-4 mb-5">
              <img
                src="/icons/icon-192.png"
                alt="MeloStream"
                className="w-14 h-14 rounded-2xl shadow-lg flex-shrink-0"
                onError={(e) => { e.target.style.display = 'none'; }}
              />
              <div className="min-w-0">
                <h2 className="text-white font-bold text-lg leading-tight">MeloStream</h2>
                <p className="text-white/40 text-xs truncate">music-web-gamma-eight.vercel.app</p>
              </div>
            </div>

            {/* Message */}
            <p className="text-white/65 text-sm leading-relaxed mb-5">
              {isIOS
                ? 'Install MeloStream for the best experience — music keeps playing even when you switch apps.'
                : 'Install MeloStream on your device. Music keeps playing even with your screen off.'}
            </p>

            {/* iOS steps */}
            {isIOS && (
              <div className="bg-white/5 rounded-xl p-4 mb-5 space-y-3">
                <IOSStep icon="⬆️" text='Tap the Share button in Safari' />
                <IOSStep icon="➕" text='Tap "Add to Home Screen"' />
                <IOSStep icon="✅" text='Tap "Add" to confirm' />
              </div>
            )}

            {/* Buttons */}
            <div className="flex gap-3">
              <button
                onClick={handleDismiss}
                className="flex-1 py-3 rounded-xl border border-white/10 text-white/50 text-sm font-medium active:bg-white/10 hover:bg-white/5 transition-colors"
              >
                Not now
              </button>

              <button
                onClick={isIOS ? handleDismiss : handleInstall}
                className="flex-1 py-3 rounded-xl bg-green-500 hover:bg-green-400 active:bg-green-600 text-black text-sm font-bold transition-colors"
              >
                {isIOS ? 'Got it' : 'Install App'}
              </button>
            </div>
          </div>

        </div>
      </div>
    </>
  );
}

function IOSStep({ icon, text }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-base flex-shrink-0">{icon}</span>
      <span className="text-white/60 text-sm">{text}</span>
    </div>
  );
}