/**
 * client/src/serviceWorkerRegistration.js
 *
 * Registers the CRA-generated service worker in production only.
 *
 * Lifecycle events:
 *   onSuccess(registration) — SW installed, app is ready for offline use
 *   onUpdate(registration)  — New SW waiting; prompt user to update
 *
 * Usage in index.js:
 *   import * as serviceWorkerRegistration from './serviceWorkerRegistration';
 *   serviceWorkerRegistration.register({
 *     onSuccess: () => { ... show "Ready for offline" toast },
 *     onUpdate:  (reg) => { ... show "Update available" toast },
 *   });
 *
 * How to trigger the waiting SW to activate (in your update toast handler):
 *   registration.waiting.postMessage({ type: 'SKIP_WAITING' });
 *   window.location.reload();
 */

const isLocalhost = Boolean(
  window.location.hostname === 'localhost' ||
  window.location.hostname === '[::1]' ||
  window.location.hostname.match(/^127(?:\.(?:25[0-5]|2[0-4]\d|[01]?\d\d?)){3}$/)
);

/**
 * @param {{ onSuccess?: (reg: ServiceWorkerRegistration) => void,
 *            onUpdate?:  (reg: ServiceWorkerRegistration) => void }} config
 */
export function register(config = {}) {
  // Only register in production and when SW is supported
  if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) {
    return;
  }

  const publicUrl = new URL(process.env.PUBLIC_URL, window.location.href);

  // SW won't work if PUBLIC_URL is on a different origin
  if (publicUrl.origin !== window.location.origin) {
    return;
  }

  window.addEventListener('load', () => {
    const swUrl = `${process.env.PUBLIC_URL}/service-worker.js`;

    if (isLocalhost) {
      // On localhost: validate the SW file exists before registering
      checkValidServiceWorker(swUrl, config);
      navigator.serviceWorker.ready.then(() => {
        console.log('[SW] App is being served cache-first by a service worker.');
      });
    } else {
      registerValidSW(swUrl, config);
    }
  });
}

function registerValidSW(swUrl, config) {
  navigator.serviceWorker
    .register(swUrl)
    .then((registration) => {
      // Check for updates every time the page loads
      registration.update();

      registration.onupdatefound = () => {
        const installingWorker = registration.installing;
        if (!installingWorker) return;

        installingWorker.onstatechange = () => {
          if (installingWorker.state !== 'installed') return;

          if (navigator.serviceWorker.controller) {
            // New SW installed, old one still controlling — update available
            console.log('[SW] New content available; will be used after refresh.');
            config.onUpdate?.(registration);
          } else {
            // First install — app now works offline
            console.log('[SW] Content is cached for offline use.');
            config.onSuccess?.(registration);
          }
        };
      };
    })
    .catch((error) => {
      console.error('[SW] Registration failed:', error);
    });
}

function checkValidServiceWorker(swUrl, config) {
  fetch(swUrl, { headers: { 'Service-Worker': 'script' } })
    .then((response) => {
      const contentType = response.headers.get('content-type');
      if (
        response.status === 404 ||
        (contentType && !contentType.includes('javascript'))
      ) {
        // SW not found — unregister and reload
        navigator.serviceWorker.ready.then((registration) => {
          registration.unregister().then(() => window.location.reload());
        });
      } else {
        registerValidSW(swUrl, config);
      }
    })
    .catch(() => {
      console.log('[SW] No internet connection. App is running in offline mode.');
    });
}

export function unregister() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready
      .then((registration) => registration.unregister())
      .catch((error) => console.error('[SW] Unregister failed:', error));
  }
}