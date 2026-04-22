'use strict';

/**
 * server/src/services/keepAlive.js
 *
 * Self-ping service to prevent Render free-tier cold starts.
 *
 * Fixes over the previous inline implementation:
 *   1. URL validated at construction — misconfiguration surfaces at boot,
 *      not at minute 14.
 *   2. Pre-flight probe on start() — immediate visibility if unreachable.
 *   3. Consecutive failure counter — escalates warn → error after threshold,
 *      making the condition alertable in any log aggregator.
 *   4. Jitter on interval — prevents thundering herd across instances.
 *   5. stop() method — interval is cleared cleanly on graceful shutdown.
 */

const https = require('https');
const http  = require('http');

const MAX_CONSECUTIVE_FAILURES = 3;
const JITTER_MS                = 30_000; // ±30 seconds

class KeepAlive {
  /**
   * @param {object} opts
   * @param {string|null} opts.backendUrl
   * @param {number}      opts.intervalMs
   * @param {string}      opts.nodeEnv
   * @param {object}      opts.logger       - Winston logger instance
   */
  constructor({ backendUrl, intervalMs, nodeEnv, logger }) {
    this._logger      = logger;
    this._nodeEnv     = nodeEnv;
    this._intervalMs  = intervalMs;
    this._timer       = null;
    this._failures    = 0;
    this._enabled     = false;
    this._pingUrl     = null;
    this._client      = null;

    // ── Validate URL at construction time ─────────────────────────────────────
    // Surfaces misconfiguration at boot (logged as error), not at minute 14.
    if (!backendUrl) {
      // Intentionally absent in local dev — not an error.
      return;
    }

    let parsed;
    try {
      parsed = new URL(`${backendUrl}/health`);
    } catch {
      logger.error(
        '[KeepAlive] BACKEND_URL is not a valid URL — self-ping disabled.', {
          backendUrl,
        },
      );
      return;
    }

    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      logger.error(
        '[KeepAlive] BACKEND_URL must use http or https — self-ping disabled.', {
          backendUrl,
        },
      );
      return;
    }

    this._pingUrl = parsed.href;
    this._client  = parsed.protocol === 'https:' ? https : http;
    this._enabled = true;
  }

  /**
   * Arms the keep-alive interval.
   * Fires a pre-flight probe immediately, then on every (intervalMs ± jitter).
   * No-op outside production or when URL was invalid.
   */
  start() {
    if (this._nodeEnv !== 'production' || !this._enabled) return;

    this._logger.info(
      `[KeepAlive] Self-ping enabled → ${this._pingUrl} ` +
      `every ~${Math.round(this._intervalMs / 60_000)} min (±${JITTER_MS / 1000}s jitter)`,
    );

    // Pre-flight: fire immediately so misconfiguration or a dead URL is
    // visible in logs at boot — not after the first interval elapses.
    this._ping();

    // Schedule with jitter to prevent thundering herd across instances.
    this._scheduleNext();
  }

  /**
   * Clears the interval. Called from gracefulShutdown.
   */
  stop() {
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
      this._logger.info('[KeepAlive] Self-ping stopped (shutdown).');
    }
  }

  // ── Private ────────────────────────────────────────────────────────────────

  _scheduleNext() {
    // Jitter: random value in [-JITTER_MS, +JITTER_MS]
    const jitter = Math.floor(Math.random() * JITTER_MS * 2) - JITTER_MS;
    const delay  = Math.max(60_000, this._intervalMs + jitter); // floor at 1 min

    this._timer = setTimeout(() => {
      this._ping();
      this._scheduleNext();
    }, delay);

    // Unref so the timer never keeps the process alive during shutdown.
    if (this._timer.unref) this._timer.unref();
  }

  _ping() {
    const req = this._client.get(this._pingUrl, (res) => {
      // Drain response body — required to free the socket.
      res.resume();

      if (res.statusCode === 200) {
        if (this._failures > 0) {
          this._logger.info(
            `[KeepAlive] Ping recovered after ${this._failures} consecutive failure(s).`,
          );
        }
        this._failures = 0;
        return;
      }

      this._handleFailure(
        `ping returned HTTP ${res.statusCode}`,
      );
    });

    req.on('error', (err) => {
      this._handleFailure(err.message);
    });

    // Socket timeout: don't let a hung connection block the event loop.
    req.setTimeout(10_000, () => {
      req.destroy();
      this._handleFailure('ping socket timed out after 10s');
    });

    req.end();
  }

  _handleFailure(reason) {
    this._failures += 1;

    // Escalate to error after threshold — makes the condition alertable.
    if (this._failures >= MAX_CONSECUTIVE_FAILURES) {
      this._logger.error(
        `[KeepAlive] ${this._failures} consecutive ping failures — ` +
        `instance may be sleeping. Last reason: ${reason}`, {
          pingUrl:  this._pingUrl,
          failures: this._failures,
        },
      );
    } else {
      this._logger.warn(
        `[KeepAlive] Ping failed (${this._failures}/${MAX_CONSECUTIVE_FAILURES}): ${reason}`,
      );
    }
  }
}

module.exports = { KeepAlive };