/**
 * client/src/pages/ForgotPassword.jsx
 *
 * Production-ready Forgot Password page.
 *
 * Flow:
 *   1. User enters email → sendPasswordResetEmail fires
 *   2. On success → show confirmation state (never reveal if email exists)
 *   3. On error → show safe, user-friendly message
 *
 * Security notes:
 *   - auth/user-not-found intentionally shows the SAME success UI as a
 *     valid email (prevents email enumeration attacks).
 *   - err.message is never surfaced — Firebase messages may contain PII.
 *   - Email is trimmed before use.
 *
 * Visual design: identical card/centering pattern as Login.jsx and Register.jsx.
 */

import { useState, useRef } from "react";
import { Link } from "react-router-dom";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "../firebase";

// ─── Firebase error → safe user-facing message ───────────────────────────────
const FIREBASE_ERROR_MESSAGES = {
  "auth/invalid-email": "Please enter a valid email address.",
  "auth/too-many-requests":
    "Too many attempts. Please wait a few minutes and try again.",
  "auth/network-request-failed":
    "Network error. Please check your connection and try again.",
  "auth/user-not-found": null, // Intentionally silent — show success UI instead
};

const getErrorMessage = (code) => {
  if (code in FIREBASE_ERROR_MESSAGES) return FIREBASE_ERROR_MESSAGES[code];
  return "Something went wrong. Please try again.";
};

// ─── Component ────────────────────────────────────────────────────────────────
const ForgotPassword = () => {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false); // success state

  // Synchronous double-submit guard (same pattern as Login.jsx)
  const submitting = useRef(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting.current) return;
    submitting.current = true;

    setError("");
    setLoading(true);

    try {
      await sendPasswordResetEmail(auth, email.trim());
      // Always show success — even for auth/user-not-found (handled below)
      setSent(true);
    } catch (err) {
      if (err?.code === "auth/user-not-found") {
        // Show success to prevent email enumeration
        setSent(true);
        return;
      }
      const msg = getErrorMessage(err?.code);
      if (msg) setError(msg);
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  };

  // ── Success state ─────────────────────────────────────────────────────────
  if (sent) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <div style={styles.logoRow}>
            <div style={styles.logoIcon} aria-hidden="true">
              <MusicNoteIcon />
            </div>
            <span style={styles.logoText}>MeloStream</span>
          </div>

          <div style={styles.successBox} role="status" aria-live="polite">
            <CheckIcon />
            <div>
              <p style={styles.successTitle}>Check your inbox</p>
              <p style={styles.successBody}>
                If an account exists for <strong>{email.trim()}</strong>, a
                password reset link has been sent. Check your spam folder if you
                don't see it.
              </p>
            </div>
          </div>

          <p style={styles.footerText}>
            <Link to="/login" style={styles.link}>
              ← Back to Sign In
            </Link>
          </p>
        </div>
      </div>
    );
  }

  // ── Form state ────────────────────────────────────────────────────────────
  return (
    <div style={styles.page}>
      <div style={styles.card}>
        {/* Brand */}
        <div style={styles.logoRow}>
          <div style={styles.logoIcon} aria-hidden="true">
            <MusicNoteIcon />
          </div>
          <span style={styles.logoText}>MeloStream</span>
        </div>
        <p style={styles.subtitle}>Reset your password</p>
        <p style={styles.hint}>
          Enter your email and we'll send you a reset link.
        </p>

        {/* Error banner */}
        {error && (
          <div style={styles.errorBox} role="alert" aria-live="polite">
            <AlertIcon />
            <span>{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} style={styles.form} noValidate>
          <div style={styles.fieldGroup}>
            <label htmlFor="fp-email" style={styles.label}>
              Email
            </label>
            <input
              id="fp-email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              disabled={loading}
              style={styles.input}
              onFocus={(e) =>
                (e.target.style.borderColor = "var(--color-accent)")
              }
              onBlur={(e) =>
                (e.target.style.borderColor = "var(--color-border)")
              }
            />
          </div>

          <button
            type="submit"
            disabled={loading || !email.trim()}
            style={{
              ...styles.primaryBtn,
              opacity: loading || !email.trim() ? 0.6 : 1,
              cursor: loading || !email.trim() ? "not-allowed" : "pointer",
            }}
          >
            {loading ? (
              <InlineLoader>
                <SpinnerIcon color="#000" /> Sending…
              </InlineLoader>
            ) : (
              "Send Reset Link"
            )}
          </button>
        </form>

        {/* Footer */}
        <p style={styles.footerText}>
          <Link to="/login" style={styles.link}>
            ← Back to Sign In
          </Link>
        </p>
      </div>
    </div>
  );
};

// ─── Layout helper ────────────────────────────────────────────────────────────
const InlineLoader = ({ children }) => (
  <span
    style={{
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "8px",
    }}
  >
    {children}
  </span>
);

// ─── Icons ────────────────────────────────────────────────────────────────────
const MusicNoteIcon = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
  >
    <path d="M9 3v10.55A4 4 0 1 0 11 17V7h4V3H9z" />
  </svg>
);

const AlertIcon = () => (
  <svg
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
    style={{ flexShrink: 0, marginTop: "1px" }}
  >
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
  </svg>
);

const CheckIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
    style={{ flexShrink: 0, marginTop: "2px", color: "var(--color-accent)" }}
  >
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5l-4.5-4.5 1.41-1.41L10 13.67l7.09-7.09L18.5 8l-8.5 8.5z" />
  </svg>
);

const SpinnerIcon = ({ color = "#000" }) => (
  <svg
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden="true"
    style={{ animation: "ms-spin 0.75s linear infinite", flexShrink: 0 }}
  >
    <circle
      cx="12"
      cy="12"
      r="10"
      stroke={color}
      strokeWidth="2.5"
      strokeOpacity="0.25"
    />
    <path
      d="M12 2a10 10 0 0 1 10 10"
      stroke={color}
      strokeWidth="2.5"
      strokeLinecap="round"
    />
  </svg>
);

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = {
  page: {
    height: "100vh",
    width: "100vw",
    background: "var(--color-bg)",
    backgroundImage:
      "radial-gradient(ellipse 70% 60% at 50% 50%, rgba(34,197,94,0.035) 0%, transparent 70%)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "var(--space-6) var(--space-4)",
    fontFamily: "var(--font-family)",
    boxSizing: "border-box",
    overflow: "hidden",
  },
  card: {
    background: "var(--color-surface)",
    border: "1px solid var(--color-border)",
    borderTop: "1px solid var(--color-border-emphasis)",
    borderRadius: "var(--radius-xl)",
    padding: "var(--space-10)",
    width: "100%",
    maxWidth: "400px",
    boxShadow: "var(--shadow-overlay)",
    boxSizing: "border-box",
  },
  logoRow: {
    display: "flex",
    alignItems: "center",
    gap: "var(--space-3)",
    marginBottom: "var(--space-2)",
  },
  logoIcon: {
    width: "36px",
    height: "36px",
    background: "var(--color-accent)",
    borderRadius: "var(--radius-md)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "var(--color-text-inverse)",
    flexShrink: 0,
  },
  logoText: {
    color: "var(--color-text-primary)",
    fontSize: "var(--font-size-xl)",
    fontWeight: "var(--font-weight-bold)",
    letterSpacing: "-0.3px",
  },
  subtitle: {
    color: "var(--color-text-primary)",
    fontSize: "var(--font-size-lg)",
    fontWeight: "var(--font-weight-semibold)",
    margin: "var(--space-4) 0 var(--space-1)",
  },
  hint: {
    color: "var(--color-text-muted)",
    fontSize: "var(--font-size-sm)",
    margin: "0 0 var(--space-6)",
    lineHeight: "var(--line-height-normal)",
  },
  errorBox: {
    display: "flex",
    alignItems: "flex-start",
    gap: "var(--space-2)",
    background: "var(--color-danger-muted)",
    border: "1px solid rgba(244,63,94,0.25)",
    color: "var(--color-danger-hover)",
    borderRadius: "var(--radius-md)",
    padding: "var(--space-3) var(--space-4)",
    fontSize: "var(--font-size-sm)",
    lineHeight: "var(--line-height-normal)",
    marginBottom: "var(--space-5)",
  },
  successBox: {
    display: "flex",
    alignItems: "flex-start",
    gap: "var(--space-3)",
    background: "rgba(34,197,94,0.08)",
    border: "1px solid rgba(34,197,94,0.25)",
    borderRadius: "var(--radius-md)",
    padding: "var(--space-4)",
    margin: "var(--space-6) 0",
  },
  successTitle: {
    color: "var(--color-text-primary)",
    fontSize: "var(--font-size-base)",
    fontWeight: "var(--font-weight-semibold)",
    margin: "0 0 var(--space-1)",
  },
  successBody: {
    color: "var(--color-text-muted)",
    fontSize: "var(--font-size-sm)",
    lineHeight: "var(--line-height-normal)",
    margin: 0,
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "var(--space-4)",
  },
  fieldGroup: {
    display: "flex",
    flexDirection: "column",
    gap: "var(--space-2)",
  },
  label: {
    color: "var(--color-text-secondary)",
    fontSize: "var(--font-size-sm)",
    fontWeight: "var(--font-weight-medium)",
  },
  input: {
    background: "var(--color-sidebar-bg)",
    border: "1px solid var(--color-border)",
    borderRadius: "var(--radius-md)",
    padding: "11px var(--space-4)",
    color: "var(--color-text-primary)",
    fontSize: "var(--font-size-base)",
    outline: "none",
    transition: "border-color var(--transition-fast)",
    width: "100%",
    boxSizing: "border-box",
    fontFamily: "var(--font-family)",
  },
  primaryBtn: {
    background: "var(--color-accent)",
    color: "var(--color-text-inverse)",
    border: "none",
    borderRadius: "var(--radius-md)",
    padding: "12px var(--space-4)",
    fontWeight: "var(--font-weight-semibold)",
    fontSize: "var(--font-size-base)",
    width: "100%",
    marginTop: "var(--space-2)",
    transition: "opacity var(--transition-fast)",
    fontFamily: "var(--font-family)",
    minHeight: "44px",
    lineHeight: 1,
  },
  footerText: {
    color: "var(--color-text-muted)",
    fontSize: "var(--font-size-sm)",
    textAlign: "center",
    marginTop: "var(--space-6)",
  },
  link: {
    color: "var(--color-accent-dim)",
    textDecoration: "none",
    fontWeight: "var(--font-weight-medium)",
  },
};

// ─── Inject spinner keyframes once ───────────────────────────────────────────
if (
  typeof document !== "undefined" &&
  !document.getElementById("ms-fp-styles")
) {
  const tag = document.createElement("style");
  tag.id = "ms-fp-styles";
  tag.textContent = `
    @keyframes ms-spin { to { transform: rotate(360deg); } }
    #fp-email:-webkit-autofill,
    #fp-email:-webkit-autofill:hover,
    #fp-email:-webkit-autofill:focus {
      -webkit-box-shadow: 0 0 0 1000px #111111 inset !important;
      -webkit-text-fill-color: #e5e7eb !important;
      caret-color: #e5e7eb !important;
    }
  `;
  document.head.appendChild(tag);
}

export default ForgotPassword;
