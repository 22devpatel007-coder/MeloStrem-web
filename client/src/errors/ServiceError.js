// ─── client/src/errors/ServiceError.js ───────────────────────────────────────
//
// Unified frontend error class for MeloStream.
//
// Every Axios error that surfaces from a service file is wrapped in a
// ServiceError before it reaches a hook, component, or Toast. This means:
//   • Components never see raw Axios error shapes or Firebase error codes.
//   • All error display flows through one place (errorMessages.js).
//   • Errors carry structured context (endpoint, action) for error reporting
//     (Phase 4 errorReporter.js will consume these fields).
//
// USAGE in service files:
//   import { ServiceError } from '../errors/ServiceError';
//
//   try {
//     const res = await api.get('/songs');
//     return res.data;
//   } catch (err) {
//     throw ServiceError.from(err, { endpoint: '/songs', action: 'loading songs' });
//   }
//
// USAGE in components / hooks:
//   } catch (err) {
//     const serviceErr = ServiceError.from(err);
//     toast.error(serviceErr.userMessage);
//   }
// ─────────────────────────────────────────────────────────────────────────────

import { getErrorMessage } from '../utils/errorMessages';

export class ServiceError extends Error {
  /**
   * @param {object} params
   * @param {string} params.message        - Raw technical message (for logs/devs only)
   * @param {string} params.code           - Machine-readable code from backend error.code
   * @param {number|null} params.status    - HTTP status code, or null for network errors
   * @param {string} params.userMessage    - Safe, friendly string shown to the user
   * @param {string} params.endpoint       - API path that was called, e.g. '/songs'
   * @param {string} params.action         - What the user was doing, e.g. 'loading songs'
   * @param {boolean} params.isNetworkError - True when the server was unreachable
   */
  constructor({
    message = 'Something went wrong.',
    code = 'UNKNOWN',
    status = null,
    userMessage = null,
    endpoint = '',
    action = '',
    isNetworkError = false,
  } = {}) {
    super(message);

    // Preserve correct stack trace in V8 (Chrome/Node)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ServiceError);
    }

    this.name = 'ServiceError';
    this.code = code;
    this.status = status;
    this.endpoint = endpoint;
    this.action = action;
    this.isNetworkError = isNetworkError;

    // userMessage: prefer explicit override, otherwise derive from error code.
    // getErrorMessage() returns a safe, user-friendly string for every known code.
    this.userMessage = userMessage ?? getErrorMessage(code, { action, isNetworkError });
  }

  // ── Static factory ────────────────────────────────────────────────────────

  /**
   * Wraps any caught error (Axios error, plain Error, or unknown) into a
   * ServiceError. Safe to call on anything — never throws.
   *
   * This is the primary constructor used in service file catch blocks.
   *
   * @param {unknown} err                     - The caught error
   * @param {object}  [context]               - Optional context for richer errors
   * @param {string}  [context.endpoint]      - API path that was called
   * @param {string}  [context.action]        - What the user was doing
   * @param {string}  [context.userMessage]   - Override the auto-derived user message
   * @returns {ServiceError}
   */
  static from(err, context = {}) {
    // Already a ServiceError — merge context if new info provided, return as-is
    if (err instanceof ServiceError) {
      if (context.endpoint && !err.endpoint) err.endpoint = context.endpoint;
      if (context.action && !err.action) err.action = context.action;
      return err;
    }

    // Errors produced by api.js response interceptor already have .code / .status
    const code = err?.code ?? 'UNKNOWN';
    const status = err?.status ?? null;
    const isNetworkError = err?.isNetworkError === true || status === null && !!err?.message;
    const message = err?.message ?? 'An unexpected error occurred.';

    return new ServiceError({
      message,
      code,
      status,
      isNetworkError,
      endpoint: context.endpoint ?? '',
      action: context.action ?? '',
      userMessage: context.userMessage ?? null, // null → auto-derived in constructor
    });
  }

  /**
   * Returns true if this error should be shown to the user as a toast/banner.
   * Filters out errors that are handled silently (e.g. cancelled requests).
   *
   * @returns {boolean}
   */
  isUserFacing() {
    // Cancelled requests (axios CancelToken / AbortController) are silent
    if (this.code === 'ERR_CANCELED' || this.code === 'ABORTED') return false;
    return true;
  }

  /**
   * Serialises the error to a plain object for error reporting (Phase 4).
   * Never includes the stack trace in production.
   *
   * @param {boolean} [includStack=false]
   * @returns {object}
   */
  toReport(includeStack = false) {
    return {
      name: this.name,
      code: this.code,
      status: this.status,
      message: this.message,
      endpoint: this.endpoint,
      action: this.action,
      isNetworkError: this.isNetworkError,
      ...(includeStack && { stack: this.stack }),
    };
  }
}

export default ServiceError;