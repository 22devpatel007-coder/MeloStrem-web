/**
 * client/src/hooks/useInstallPrompt.js
 *
 * Manages PWA install prompt state across Android and iOS.
 *
 * Android/Chrome:
 *   - Intercepts the `beforeinstallprompt` event before the browser shows it
 *   - Exposes `promptInstall()` so you can show it at the right moment
 *   - Tracks `isInstalled` via the `appinstalled` event
 *
 * iOS Safari:
 *   - `beforeinstallprompt` never fires on iOS
 *   - Detects iOS + standalone mode to show manual instructions
 *   - `isIOS` flag lets you render an iOS-specific instruction sheet
 *
 * Persistence:
 *   - Dismissed state stored in localStorage so the prompt doesn't re-appear
 *     every session after the user dismisses it
 *   - Key: 'melostream_install_dismissed'
 *
 * Returns:
 *   {
 *     canInstall:    boolean  — true on Android when prompt is available
 *     isIOS:         boolean  — true on iOS Safari (not installed)
 *     isInstalled:   boolean  — true when running as standalone PWA
 *     isDismissed:   boolean  — true if user dismissed the prompt this session
 *     promptInstall: () => Promise<'accepted'|'dismissed'|null>
 *     dismiss:       () => void
 *   }
 */

import { useState, useEffect, useCallback } from 'react';

const DISMISSED_KEY = 'melostream_install_dismissed';
const DISMISSED_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days in ms

function isIOSDevice() {
  return (
    typeof navigator !== 'undefined' &&
    /iPad|iPhone|iPod/.test(navigator.userAgent) &&
    !window.MSStream
  );
}

function isRunningStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  );
}

function wasDismissedRecently() {
  try {
    const stored = localStorage.getItem(DISMISSED_KEY);
    if (!stored) return false;
    const { ts } = JSON.parse(stored);
    return Date.now() - ts < DISMISSED_TTL;
  } catch {
    return false;
  }
}

export function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isInstalled,    setIsInstalled]    = useState(isRunningStandalone);
  const [isDismissed,    setIsDismissed]    = useState(wasDismissedRecently);

  const isIOS = isIOSDevice();

  // Capture the beforeinstallprompt event (Android/Chrome only)
  useEffect(() => {
    const handler = (e) => {
      e.preventDefault(); // Stop browser from showing its own prompt
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  // Track when the app is installed
  useEffect(() => {
    const handler = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('appinstalled', handler);
    return () => window.removeEventListener('appinstalled', handler);
  }, []);

  // Show the native install prompt (Android only)
  const promptInstall = useCallback(async () => {
    if (!deferredPrompt) return null;

    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      setDeferredPrompt(null);
      return outcome; // 'accepted' | 'dismissed'
    } catch (err) {
      console.warn('[useInstallPrompt] prompt() failed:', err.message);
      return null;
    }
  }, [deferredPrompt]);

  // Dismiss — persist so it doesn't re-appear for 7 days
  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(DISMISSED_KEY, JSON.stringify({ ts: Date.now() }));
    } catch {
      // localStorage can throw in private browsing — non-fatal
    }
    setIsDismissed(true);
  }, []);

  return {
    // Android: native prompt available
    canInstall: !!deferredPrompt && !isInstalled && !isDismissed,
    // iOS: show manual instructions
    isIOS: isIOS && !isInstalled && !isDismissed,
    isInstalled,
    isDismissed,
    promptInstall,
    dismiss,
  };
}