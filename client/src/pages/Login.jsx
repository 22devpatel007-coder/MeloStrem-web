/**
 * client/src/pages/Login.jsx
 *
 * Production-ready login page.
 *
 * ── Fixes ────────────────────────────────────────────────────────────────────
 *
 * 1. Card centering
 *    Uses height:100vh (not minHeight) so the flex container always has a
 *    full-viewport height to center against, regardless of #root height.
 *    Also add this one-time fix to client/src/styles/index.css:
 *
 *      html, body, #root { height: 100%; }
 *
 * 2. Double submit (root fix)
 *    useRef guard (`submitting`) is synchronous — unlike useState, a ref
 *    update is immediate and blocks a second click before the first re-render.
 *    The finally block always releases the guard so the form is never
 *    permanently locked on an unexpected error.
 *
 * 3. Silent first-attempt failure
 *    Root cause: old code caught all errors with one generic message AND did
 *    not handle the current Firebase unified error code `auth/invalid-credential`
 *    (replaces auth/user-not-found + auth/wrong-password since late 2023).
 *    Every known Firebase auth error code is now mapped explicitly below.
 *
 * 4. Error message security
 *    auth/user-not-found and auth/wrong-password intentionally return the
 *    SAME message. This prevents user enumeration attacks where an attacker
 *    probes which emails are registered.
 *
 * 5. Input security
 *    - Email is trimmed before use — prevents false failures from whitespace.
 *    - err.message is never logged — Firebase error messages can contain email.
 *    - autoComplete values are correct to encourage password manager usage.
 *    - Autofill background override prevents browser yellow fill on dark inputs.
 *
 * 6. Navigation race fix
 *    Root cause: navigate('/home') was called immediately after loginWithEmail
 *    resolved, but onAuthStateChanged (which sets user in the store) fires
 *    async AFTER that. ProtectedRoute saw user:null and redirected back to
 *    /login. Fix: navigation is driven entirely by a useEffect that watches
 *    the store — it fires only after onAuthStateChanged has set the user.
 *    No navigate() calls remain inside try blocks.
 *
 * 7. Forgot Password link added below the password field.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useRef, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { signInWithPopup, GoogleAuthProvider } from "firebase/auth";
import { auth } from "../firebase";
import { loginWithEmail } from "../services/auth.service";
import useAuthStore from "../store/authStore";
import { isValidEmail } from "../utils/validators";

// ─── Firebase error code → safe user-facing message ──────────────────────────
const FIREBASE_ERROR_MESSAGES = {
  "auth/invalid-credential": "Invalid email or password. Please try again.",
  "auth/user-not-found": "Invalid email or password. Please try again.",
  "auth/wrong-password": "Invalid email or password. Please try again.",
  "auth/invalid-email": "Please enter a valid email address.",
  "auth/user-disabled":
    "This account has been disabled. Please contact support.",
  "auth/too-many-requests":
    "Too many failed attempts. Your account is temporarily locked. Try again later.",
  "auth/network-request-failed":
    "Network error. Please check your connection and try again.",
  "auth/popup-blocked":
    "Popup was blocked. Please allow popups for this site and try again.",
  "auth/popup-closed-by-user": null, // User cancelled — not an error, show nothing
  "auth/unauthorized-domain":
    "This domain is not authorised. Please contact support.",
  "auth/operation-not-allowed":
    "This sign-in method is not enabled. Please contact support.",
};

const getErrorMessage = (code) =>
  FIREBASE_ERROR_MESSAGES[code] !== undefined
    ? FIREBASE_ERROR_MESSAGES[code]
    : "Something went wrong. Please try again.";

// ─── Component ────────────────────────────────────────────────────────────────
const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState(null);
  const [lockCountdown, setLockCountdown] = useState(0);

  // Synchronous guard — blocks double submit before first re-render
  const submitting = useRef(false);

  const navigate = useNavigate();

  // FIX: Watch store directly. Navigate only after onAuthStateChanged has
  // set the user — never navigate() inside a try block.
  const user = useAuthStore((s) => s.user);
  const authLoading = useAuthStore((s) => s.loading);
  useEffect(() => {
    if (!authLoading && user) navigate("/", { replace: true });
  }, [user, authLoading, navigate]);

  useEffect(() => {
  if (!lockedUntil) return;
  const tick = () => {
    const remaining = Math.ceil((lockedUntil - Date.now()) / 1000);
    if (remaining <= 0) {
      setLockedUntil(null);
      setLockCountdown(0);
      setFailedAttempts(0);
    } else {
      setLockCountdown(remaining);
    }
  };
  tick();
  const interval = setInterval(tick, 1000);
  return () => clearInterval(interval);
}, [lockedUntil]);

  const isBusy = loading || googleLoading;

  // ── Email / password login ─────────────────────────────────────────────────
  const MAX_ATTEMPTS = 5;
  const LOCK_DURATION_MS = 30000; // 30s, tune as you like

  const handleLogin = async (e) => {
    e.preventDefault();

    if (submitting.current) return;
    if (lockedUntil && Date.now() < lockedUntil) return;

    if (!isValidEmail(email)) {
      setError("Please enter a valid email address.");
      return;
    }

    submitting.current = true;

    setError("");
    setLoading(true);

    try {
      await loginWithEmail(email.trim(), password);
      setFailedAttempts(0);
      // No navigate() here — useEffect above handles it once store is ready
    } catch (err) {
      const msg = getErrorMessage(err?.code);
      if (msg) setError(msg);

      const next = failedAttempts + 1;
      setFailedAttempts(next);
      if (next >= MAX_ATTEMPTS) {
        setLockedUntil(Date.now() + LOCK_DURATION_MS);
        setError(`Too many attempts. Please wait ${LOCK_DURATION_MS / 1000}s and try again.`);
      }
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  };

  // ── Google login ───────────────────────────────────────────────────────────
  const handleGoogleLogin = async () => {
    if (submitting.current) return;
    submitting.current = true;

    setError("");
    setGoogleLoading(true);

    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      // No navigate() here — useEffect above handles it once store is ready
    } catch (err) {
      const msg = getErrorMessage(err?.code);
      if (msg) setError(msg);
    } finally {
      submitting.current = false;
      setGoogleLoading(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
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
        <p style={styles.subtitle}>Sign in to your account</p>

        {/* Error banner */}
        {error && (
          <div style={styles.errorBox} role="alert" aria-live="polite">
            <AlertIcon />
            <span>{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleLogin} style={styles.form} noValidate>
          <div style={styles.fieldGroup}>
            <label htmlFor="login-email" style={styles.label}>
              Email
            </label>
            <input
              id="login-email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              disabled={isBusy}
              style={styles.input}
              onFocus={(e) =>
                (e.target.style.borderColor = "var(--color-accent)")
              }
              onBlur={(e) =>
                (e.target.style.borderColor = "var(--color-border)")
              }
            />
          </div>

          <div style={styles.fieldGroup}>
            {/* Password label row — label left, forgot link right */}
            <div style={styles.passwordLabelRow}>
              <label htmlFor="login-password" style={styles.label}>
                Password
              </label>
             
            </div>
            <input
              id="login-password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              disabled={isBusy}
              style={styles.input}
              onFocus={(e) =>
                (e.target.style.borderColor = "var(--color-accent)")
              }
              onBlur={(e) =>
                (e.target.style.borderColor = "var(--color-border)")
              }
            />
          </div>
               <Link to="/forgot-password" style={styles.forgotLink}>
                Forgot password?
              </Link>
          <button
            type="submit"
            disabled={isBusy || (lockedUntil && Date.now() < lockedUntil)}
            style={{
              ...styles.primaryBtn,
              opacity: isBusy ? 0.6 : 1,
              cursor: isBusy ? "not-allowed" : "pointer",
            }}
          >
            {loading ? (
  <InlineLoader>
    <SpinnerIcon color="#000" /> Signing in…
  </InlineLoader>
) : lockedUntil && lockCountdown > 0 ? (
  `Try again in ${lockCountdown}s`
) : (
  "Sign In"
)}
          </button>
        </form>

        {/* Divider */}
        <div style={styles.divider} aria-hidden="true">
          <span style={styles.dividerLine} />
          <span style={styles.dividerText}>or</span>
          <span style={styles.dividerLine} />
        </div>

        {/* Google */}
        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={isBusy}
          style={{
            ...styles.googleBtn,
            opacity: isBusy ? 0.6 : 1,
            cursor: isBusy ? "not-allowed" : "pointer",
          }}
        >
          {googleLoading ? (
            <InlineLoader>
              <SpinnerIcon color="#111" /> Signing in…
            </InlineLoader>
          ) : (
            <InlineLoader>
              <GoogleIcon /> Continue with Google
            </InlineLoader>
          )}
        </button>

        {/* Footer */}
        <p style={styles.footerText}>
          Don't have an account?{" "}
          <Link to="/register" style={styles.link}>
            Create one
          </Link>
          <p style={styles.devCredit}>Developed by Dev · Personal use only</p>
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

const GoogleIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 48 48"
    width="17"
    height="17"
    aria-hidden="true"
    style={{ flexShrink: 0 }}
  >
    <path
      fill="#FFC107"
      d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
    />
    <path
      fill="#FF3D00"
      d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
    />
    <path
      fill="#4CAF50"
      d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
    />
    <path
      fill="#1976D2"
      d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
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
    color: "var(--color-text-muted)",
    fontSize: "var(--font-size-base)",
    margin: "var(--space-1) 0 var(--space-8)",
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
  // NEW: row that places "Password" label left and "Forgot password?" link right
  passwordLabelRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  label: {
    color: "var(--color-text-secondary)",
    fontSize: "var(--font-size-sm)",
    fontWeight: "var(--font-weight-medium)",
  },
  // NEW: subtle inline link for forgot password
  forgotLink: {
    color: "var(--color-text-muted)",
    fontSize: "var(--font-size-xs)",
    textDecoration: "none",
    fontWeight: "var(--font-weight-medium)",
    transition: "color var(--transition-fast)",
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
  divider: {
    display: "flex",
    alignItems: "center",
    gap: "var(--space-3)",
    margin: "var(--space-6) 0",
  },
  dividerLine: {
    flex: 1,
    height: "1px",
    background: "var(--color-border)",
  },
  dividerText: {
    color: "var(--color-text-muted)",
    fontSize: "var(--font-size-xs)",
    textTransform: "uppercase",
    letterSpacing: "0.8px",
    fontWeight: "var(--font-weight-medium)",
  },
  googleBtn: {
    background: "#ffffff",
    color: "#111111",
    border: "none",
    borderRadius: "var(--radius-md)",
    padding: "11px var(--space-4)",
    fontWeight: "var(--font-weight-semibold)",
    fontSize: "var(--font-size-base)",
    width: "100%",
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
  devCredit: {
  color: '#6b7280',
  fontSize: '13px',
  textAlign: "center",
  marginTop: "var(--space-3)",
  opacity: 0.6,
},
};

// ─── Inject global styles once ────────────────────────────────────────────────
if (
  typeof document !== "undefined" &&
  !document.getElementById("ms-login-styles")
) {
  const tag = document.createElement("style");
  tag.id = "ms-login-styles";
  tag.textContent = `
    @keyframes ms-spin { to { transform: rotate(360deg); } }

    #login-email:-webkit-autofill,
    #login-email:-webkit-autofill:hover,
    #login-email:-webkit-autofill:focus,
    #login-password:-webkit-autofill,
    #login-password:-webkit-autofill:hover,
    #login-password:-webkit-autofill:focus {
      -webkit-box-shadow: 0 0 0 1000px #111111 inset !important;
      -webkit-text-fill-color: #e5e7eb !important;
      caret-color: #e5e7eb !important;
    }
  `;
  document.head.appendChild(tag);
}

export default Login;