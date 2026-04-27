/**
 * client/src/components/pwa/InstallPrompt.jsx
 *
 * Shows a popup on every visit asking the user to install MeloStream.
 * Disappears permanently once installed.
 * Disappears for 7 days if dismissed (handled by useInstallPrompt).
 *
 * Works on:
 *   - Android Chrome      → native install prompt
 *   - iOS Safari 16.4+    → manual instructions sheet
 *   - Desktop Chrome      → native install prompt
 *   - Already installed   → never shows
 */

import { useState, useEffect } from 'react';
import { useInstallPrompt } from '../../hooks/useInstallPrompt';

export default function InstallPrompt() {
  const { canInstall, isIOS, isInstalled, promptInstall, dismiss } = useInstallPrompt();
  const [visible, setVisible] = useState(false);

  // Show after 2 seconds so it doesn't block initial render
  useEffect(() => {
    if (isInstalled) return;
    if (!canInstall && !isIOS) return;

    const timer = setTimeout(() => setVisible(true), 2000);
    return () => clearTimeout(timer);
  }, [canInstall, isIOS, isInstalled]);

  if (!visible) return null;

  // ── Android / Desktop ──────────────────────────────────────────────────────
  if (canInstall) {
    return (
      <Popup
        onDismiss={() => { dismiss(); setVisible(false); }}
        onInstall={async () => {
          const outcome = await promptInstall();
          if (outcome === 'accepted' || outcome === null) setVisible(false);
          // if 'dismissed' — keep popup visible so user can try again
        }}
        isIOS={false}
      />
    );
  }

  // ── iOS Safari ─────────────────────────────────────────────────────────────
  if (isIOS) {
    return (
      <Popup
        onDismiss={() => { dismiss(); setVisible(false); }}
        onInstall={null}
        isIOS={true}
      />
    );
  }

  return null;
}

// ── Popup UI ──────────────────────────────────────────────────────────────────

function Popup({ onDismiss, onInstall, isIOS }) {
  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
        onClick={onDismiss}
      />

      {/* Card — bottom sheet on mobile, centered on desktop */}
      <div className="fixed z-50 bottom-0 left-0 right-0 md:bottom-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:max-w-sm md:w-full">
        <div className="bg-[#1a1a1a] border border-white/10 rounded-t-2xl md:rounded-2xl p-6 shadow-2xl">

          {/* App icon + name */}
          <div className="flex items-center gap-4 mb-4">
            <img
              src="/icons/icon-192.png"
              alt="MeloStream"
              className="w-14 h-14 rounded-2xl shadow-lg"
              onError={(e) => { e.target.style.display = 'none'; }}
            />
            <div>
              <h2 className="text-white font-semibold text-lg leading-tight">MeloStream</h2>
              <p className="text-white/50 text-sm">music-web-gamma-eight.vercel.app</p>
            </div>
          </div>

          {/* Message */}
          <p className="text-white/70 text-sm mb-5 leading-relaxed">
            {isIOS
              ? 'Install MeloStream for the best experience — music keeps playing even when you switch apps.'
              : 'Install MeloStream on your device for uninterrupted playback, even with your screen off.'}
          </p>

          {/* iOS instructions */}
          {isIOS && (
            <div className="bg-white/5 rounded-xl p-4 mb-5 space-y-2">
              <IOSStep step={1} text="Tap the Share button in Safari" icon="⬆️" />
              <IOSStep step={2} text='Scroll down and tap "Add to Home Screen"' icon="➕" />
              <IOSStep step={3} text='Tap "Add" to confirm' icon="✅" />
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={onDismiss}
              className="flex-1 py-3 rounded-xl border border-white/10 text-white/50 text-sm font-medium hover:bg-white/5 transition-colors"
            >
              Not now
            </button>

            {!isIOS && (
              <button
                onClick={onInstall}
                className="flex-1 py-3 rounded-xl bg-green-500 hover:bg-green-400 text-black text-sm font-semibold transition-colors"
              >
                Install App
              </button>
            )}

            {isIOS && (
              <button
                onClick={onDismiss}
                className="flex-1 py-3 rounded-xl bg-green-500 hover:bg-green-400 text-black text-sm font-semibold transition-colors"
              >
                Got it
              </button>
            )}
          </div>

        </div>
      </div>
    </>
  );
}

function IOSStep({ step, text, icon }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-white/30 text-xs font-mono w-4">{step}.</span>
      <span className="text-lg">{icon}</span>
      <span className="text-white/60 text-sm">{text}</span>
    </div>
  );
}