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
 *   - Dismissed state is session-only (no localStorage)
 *   - Popup shows again on every new visit
 *   - Once installed, never shows again
 *
 * Returns:
 *   {
 *     canInstall:    boolean  — true on Android when prompt is available
 *     isIOS:         boolean  — true on iOS Safari (not installed)
 *     isInstalled:   boolean  — true when running as standalone PWA
 *     isDismissed:   boolean  — true if user dismissed this session
 *     promptInstall: () => Promise<'accepted'|'dismissed'|null>
 *     dismiss:       () => void
 *   }
 */
import { useState, useEffect, useCallback } from 'react';

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

export function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isInstalled,    setIsInstalled]    = useState(isRunningStandalone);
  const [isDismissed,    setIsDismissed]    = useState(false); // session-only, no localStorage

  const isIOS = isIOSDevice();

  // Capture the beforeinstallprompt event (Android/Chrome only)
  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
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

  // Dismiss — session only, no persistence
  const dismiss = useCallback(() => {
    setIsDismissed(true);
  }, []);

  return {
    canInstall: !!deferredPrompt && !isInstalled && !isDismissed,
    isIOS: isIOS && !isInstalled && !isDismissed,
    isInstalled,
    isDismissed,
    promptInstall,
    dismiss,
  };
}