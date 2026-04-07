import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { signInWithEmailAndPassword, signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { auth } from '../firebase';

const Login = () => {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      // FIX: Just navigate to /home — no extra getIdTokenResult() call here.
      // AdminRoute in App.js handles redirecting admins automatically.
      // AuthContext handles the token claim check in the background.
      navigate('/home');
    } catch (err) {
      setError('Invalid email or password. Please try again.');
    }
    setLoading(false);
  };

  const handleGoogleLogin = async () => {
    setError('');
    setGoogleLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      // FIX: Same — just go to /home, no extra token check
      navigate('/home');
    } catch (err) {
      if (err.code === 'auth/unauthorized-domain') {
        setError('Domain not authorized. Add it in Firebase Console.');
      } else if (err.code === 'auth/popup-blocked') {
        setError('Popup blocked. Please allow popups for this site.');
      } else if (err.code === 'auth/popup-closed-by-user') {
        setError('Sign-in cancelled.');
      } else {
        setError('Google sign-in failed. Please try again.');
      }
    }
    setGoogleLoading(false);
  };

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.logoRow}>
          <div style={styles.logoIcon}>♪</div>
          <span style={styles.logoText}>MeloStream</span>
        </div>
        <p style={styles.subtitle}>Sign in to your account</p>

        {error && <div style={styles.errorBox}>{error}</div>}

        <form onSubmit={handleLogin} style={styles.form}>
          <div style={styles.fieldGroup}>
            <label style={styles.label}>Email</label>
            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={styles.input}
              onFocus={e  => e.target.style.borderColor = '#22c55e'}
              onBlur={e   => e.target.style.borderColor = '#2d2d2d'}
            />
          </div>
          <div style={styles.fieldGroup}>
            <label style={styles.label}>Password</label>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={styles.input}
              onFocus={e  => e.target.style.borderColor = '#22c55e'}
              onBlur={e   => e.target.style.borderColor = '#2d2d2d'}
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            style={{ ...styles.primaryBtn, opacity: loading ? 0.6 : 1 }}
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <div style={styles.divider}>
          <span style={styles.dividerLine} />
          <span style={styles.dividerText}>or</span>
          <span style={styles.dividerLine} />
        </div>

        <button
          onClick={handleGoogleLogin}
          disabled={googleLoading}
          style={{ ...styles.googleBtn, opacity: googleLoading ? 0.6 : 1 }}
        >
          <GoogleIcon />
          {googleLoading ? 'Signing in…' : 'Continue with Google'}
        </button>

        <p style={styles.footerText}>
          Don't have an account?{' '}
          <Link to="/register" style={styles.link}>Create one</Link>
        </p>
      </div>
    </div>
  );
};

const GoogleIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="18" height="18" style={{ flexShrink: 0 }}>
    <path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12s5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24s8.955,20,20,20s20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"/>
    <path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z"/>
    <path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z"/>
    <path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571l6.19,5.238C36.971,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z"/>
  </svg>
);

const styles = {
  page: {
    minHeight: '100vh',
    background: '#0f0f0f',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px 16px',
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
  },
  card: {
    background: '#1a1a1a',
    border: '1px solid #2d2d2d',
    borderRadius: '16px',
    padding: '40px',
    width: '100%',
    maxWidth: '400px',
  },
  logoRow:  { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' },
  logoIcon: {
    width: '36px', height: '36px', background: '#22c55e', borderRadius: '10px',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: '#000', fontSize: '18px', fontWeight: '700',
  },
  logoText:  { color: '#fff', fontSize: '20px', fontWeight: '700', letterSpacing: '-0.3px' },
  subtitle:  { color: '#6b7280', fontSize: '14px', marginBottom: '28px' },
  errorBox: {
    background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
    color: '#f87171', borderRadius: '8px', padding: '12px 14px',
    fontSize: '13px', marginBottom: '20px',
  },
  form:       { display: 'flex', flexDirection: 'column', gap: '16px' },
  fieldGroup: { display: 'flex', flexDirection: 'column', gap: '6px' },
  label:      { color: '#9ca3af', fontSize: '13px', fontWeight: '500' },
  input: {
    background: '#111', border: '1px solid #2d2d2d', borderRadius: '8px',
    padding: '11px 14px', color: '#fff', fontSize: '14px', outline: 'none',
    transition: 'border-color 0.2s', width: '100%', boxSizing: 'border-box',
  },
  primaryBtn: {
    background: '#22c55e', color: '#000', border: 'none', borderRadius: '8px',
    padding: '12px', fontWeight: '600', fontSize: '14px', cursor: 'pointer',
    transition: 'background 0.2s', marginTop: '4px',
  },
  divider:     { display: 'flex', alignItems: 'center', gap: '12px', margin: '24px 0' },
  dividerLine: { flex: 1, height: '1px', background: '#2d2d2d' },
  dividerText: { color: '#4b5563', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' },
  googleBtn: {
    background: '#fff', color: '#111', border: 'none', borderRadius: '8px',
    padding: '11px 14px', fontWeight: '600', fontSize: '14px', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    gap: '10px', width: '100%', transition: 'background 0.2s',
  },
  footerText: { color: '#6b7280', fontSize: '13px', textAlign: 'center', marginTop: '24px' },
  link:       { color: '#22c55e', textDecoration: 'none', fontWeight: '500' },
};

export default Login;
