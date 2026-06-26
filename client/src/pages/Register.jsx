import { useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  updateProfile,
} from 'firebase/auth';
import { auth } from '../firebase';
import { isValidEmail } from '../utils/validators';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Maps raw Firebase error codes to human-friendly messages.
 * Never expose raw SDK strings to end-users in production.
 */
const FIREBASE_ERROR_MAP = {
  'auth/email-already-in-use': 'An account with this email already exists.',
  'auth/invalid-email': 'Please enter a valid email address.',
  'auth/weak-password': 'Password must be at least 6 characters.',
  'auth/network-request-failed': 'Network error. Please check your connection.',
  'auth/too-many-requests': 'Too many attempts. Please try again later.',
  'auth/popup-closed-by-user': 'Google sign-in was cancelled.',
  'auth/popup-blocked': 'Popup was blocked. Please allow popups and try again.',
};

const getFriendlyError = (err) => {
  if (err?.code && FIREBASE_ERROR_MAP[err.code]) {
    return FIREBASE_ERROR_MAP[err.code];
  }
  // Fallback: strip "Firebase: " prefix if present
  return err?.message
    ? err.message.replace(/^Firebase:\s*/i, '').replace(/\s*\(auth\/[\w-]+\)\.$/, '').trim()
    : 'Something went wrong. Please try again.';
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const GoogleIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 48 48"
    width="18"
    height="18"
    style={{ flexShrink: 0 }}
    aria-hidden="true"
  >
    <path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12s5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24s8.955,20,20,20s20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z" />
    <path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z" />
    <path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z" />
    <path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571l6.19,5.238C36.971,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z" />
  </svg>
);

const ErrorAlert = ({ message }) => {
  if (!message) return null;
  return (
    <div role="alert" aria-live="polite" style={styles.errorBox}>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ flexShrink: 0, marginTop: '1px' }}
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      <span>{message}</span>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

const Register = () => {
  const [fields, setFields] = useState({
    name: '',
    email: '',
    password: '',
    confirm: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const navigate = useNavigate();
  const submitting = useRef(false);

  const handleChange = (e) => {
    setFields((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    // Clear error as user corrects input
    if (error) setError('');
  };

  // Client-side validation before hitting Firebase
  const validate = () => {
    if (!fields.name.trim()) return 'Full name is required.';
    if (!fields.email.trim()) return 'Email is required.';
    if (!isValidEmail(fields.email)) return 'Please enter a valid email address.';
    if (fields.password.length < 6) return 'Password must be at least 6 characters.';
    if (fields.password !== fields.confirm) return 'Passwords do not match.';
    return null;
  };

  const handleRegister = async (e) => {
    e.preventDefault();

    if (submitting.current) return;
    submitting.current = true;

    setError('');

    const validationError = validate();
    if (validationError) {
      submitting.current = false;
      return setError(validationError);
    }

   setLoading(true);
    try {
      const result = await createUserWithEmailAndPassword(
        auth,
        fields.email.trim(),
        fields.password,
      );
      // Set displayName on the Firebase Auth user so it appears in the
      // ID token claims (req.user.name) — auth.controller.js reads this
      // when creating the Firestore user doc on first /api/auth/verify call.
      await updateProfile(result.user, { displayName: fields.name.trim() });
      await result.user.getIdToken(true);
      navigate('/home');
    } catch (err) {
      setError(getFriendlyError(err));
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    if (submitting.current) return;
    submitting.current = true;

    setError('');
    setGoogleLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      await signInWithPopup(auth, provider);
      navigate('/home');
    } catch (err) {
      // Don't show error if user just closed the popup
      if (err?.code !== 'auth/popup-closed-by-user') {
        setError(getFriendlyError(err));
      }
    } finally {
      submitting.current = false;
      setGoogleLoading(false);
    }
  };

  const isLoading = loading || googleLoading;

  return (
    // This wrapper guarantees centering regardless of whether the parent
    // is PageWrapper, a plain div, or the app root — it takes full viewport
    // height and centers content both axes, just like Login.jsx.
    <div style={styles.page}>
      <div style={styles.card}>
        {/* ── Logo ── */}
        <div style={styles.logoRow}>
          <div style={styles.logoIcon} aria-hidden="true">♪</div>
          <span style={styles.logoText}>MeloStream</span>
        </div>
        <p style={styles.subtitle}>Create your account</p>

        {/* ── Error ── */}
        <ErrorAlert message={error} />

        {/* ── Form ── */}
        <form onSubmit={handleRegister} style={styles.form} noValidate>
          <Field
            label="Full Name"
            name="name"
            type="text"
            placeholder="John Doe"
            value={fields.name}
            onChange={handleChange}
            autoComplete="name"
            disabled={isLoading}
            required
          />
          <Field
            label="Email"
            name="email"
            type="email"
            placeholder="you@example.com"
            value={fields.email}
            onChange={handleChange}
            autoComplete="email"
            disabled={isLoading}
            required
          />
          <Field
            label="Password"
            name="password"
            type="password"
            placeholder="Min. 6 characters"
            value={fields.password}
            onChange={handleChange}
            autoComplete="new-password"
            disabled={isLoading}
            required
          />
          <Field
            label="Confirm Password"
            name="confirm"
            type="password"
            placeholder="••••••••"
            value={fields.confirm}
            onChange={handleChange}
            autoComplete="new-password"
            disabled={isLoading}
            required
          />

          <button
            type="submit"
            disabled={isLoading}
            style={{
              ...styles.primaryBtn,
              opacity: loading ? 0.65 : 1,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? 'Creating account…' : 'Create Account'}
          </button>
        </form>

        {/* ── Divider ── */}
        <div style={styles.divider} aria-hidden="true">
          <span style={styles.dividerLine} />
          <span style={styles.dividerText}>OR</span>
          <span style={styles.dividerLine} />
        </div>

        {/* ── Google ── */}
        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={isLoading}
          style={{
            ...styles.googleBtn,
            opacity: googleLoading ? 0.65 : 1,
            cursor: googleLoading ? 'not-allowed' : 'pointer',
          }}
        >
          <GoogleIcon />
          {googleLoading ? 'Signing in…' : 'Continue with Google'}
        </button>

        {/* ── Footer ── */}
        <p style={styles.footerText}>
          Already have an account?{' '}
          <Link to="/login" style={styles.link}>
            Sign in
          </Link>
        </p>
          <p style={styles.devCredit}>Developed by Dev · Personal use only</p>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Field sub-component — keeps JSX clean and focus styles in one place
// ---------------------------------------------------------------------------

const Field = ({ label, name, type, placeholder, value, onChange, autoComplete, disabled, required }) => {
  const [focused, setFocused] = useState(false);

  return (
    <div style={styles.fieldGroup}>
      <label htmlFor={name} style={styles.label}>
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        autoComplete={autoComplete}
        disabled={disabled}
        required={required}
        style={{
          ...styles.input,
          borderColor: focused ? '#22c55e' : '#2d2d2d',
          opacity: disabled ? 0.6 : 1,
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
    </div>
  );
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = {
  // Full-viewport centering — works whether rendered inside PageWrapper or not.
  // position:fixed ensures it always covers the true viewport, not a scrollable parent.
  page: {
    position: 'fixed',
    inset: 0,
    background: '#0f0f0f',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px 16px',
    overflowY: 'auto',
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    zIndex: 0,
  },
  card: {
    background: '#1a1a1a',
    border: '1px solid #2d2d2d',
    borderRadius: '16px',
    padding: '40px',
    width: '100%',
    maxWidth: '400px',
    // Prevent card from being taller than viewport on small screens
    maxHeight: 'calc(100vh - 48px)',
    overflowY: 'auto',
  },
  logoRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '8px',
  },
  logoIcon: {
    width: '36px',
    height: '36px',
    background: '#22c55e',
    borderRadius: '10px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#000',
    fontSize: '18px',
    fontWeight: '700',
    flexShrink: 0,
  },
  logoText: {
    color: '#fff',
    fontSize: '20px',
    fontWeight: '700',
    letterSpacing: '-0.3px',
  },
  subtitle: {
    color: '#6b7280',
    fontSize: '14px',
    marginBottom: '28px',
    marginTop: 0,
  },
  errorBox: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '8px',
    background: 'rgba(239,68,68,0.1)',
    border: '1px solid rgba(239,68,68,0.35)',
    color: '#f87171',
    borderRadius: '8px',
    padding: '11px 14px',
    fontSize: '13px',
    lineHeight: '1.5',
    marginBottom: '20px',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  fieldGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  label: {
    color: '#9ca3af',
    fontSize: '13px',
    fontWeight: '500',
  },
  input: {
    background: '#111',
    border: '1px solid #2d2d2d',
    borderRadius: '8px',
    padding: '11px 14px',
    color: '#fff',
    fontSize: '14px',
    outline: 'none',
    transition: 'border-color 0.15s ease',
    width: '100%',
    boxSizing: 'border-box',
  },
  primaryBtn: {
    background: '#22c55e',
    color: '#000',
    border: 'none',
    borderRadius: '8px',
    padding: '12px',
    fontWeight: '700',
    fontSize: '14px',
    width: '100%',
    marginTop: '4px',
    transition: 'opacity 0.15s ease',
  },
  divider: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    margin: '24px 0',
  },
  dividerLine: {
    flex: 1,
    height: '1px',
    background: '#2d2d2d',
    display: 'block',
  },
  dividerText: {
    color: '#4b5563',
    fontSize: '11px',
    fontWeight: '600',
    letterSpacing: '0.8px',
  },
  googleBtn: {
    background: '#fff',
    color: '#111',
    border: 'none',
    borderRadius: '8px',
    padding: '11px 14px',
    fontWeight: '600',
    fontSize: '14px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    width: '100%',
    transition: 'opacity 0.15s ease',
  },
  footerText: {
    color: '#6b7280',
    fontSize: '13px',
    textAlign: 'center',
    marginTop: '24px',
    marginBottom: 0,
  },
  link: {
    color: '#22c55e',
    textDecoration: 'none',
    fontWeight: '600',
  },
  devCredit: {
  color: '#6b7280',
  fontSize: '11px',
  textAlign: 'center',
  marginTop: '12px',
  marginBottom: 0,
  opacity: 0.6,
},
};

export default Register;