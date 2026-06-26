/**
 * client/src/utils/validators.js
 *
 * Shared input validators used across auth forms (Login, Register,
 * ForgotPassword) before hitting Firebase — catches obviously malformed
 * input early so we don't waste an Auth API call on garbage and so the
 * user gets an instant, consistent error message.
 *
 * isValidEmail() is intentionally a simple, permissive RFC-5322-ish regex.
 * It is NOT meant to catch every invalid email ever — that's impossible
 * without sending a verification email. It only catches obviously broken
 * input (missing @, missing domain, spaces, etc.) before the network call.
 */

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * @param {string} email
 * @returns {boolean} true if the string looks like a valid email
 */
export function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  return EMAIL_REGEX.test(email.trim());
}