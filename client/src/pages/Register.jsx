import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createUserWithEmailAndPassword, signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebase';

const Register = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const navigate = useNavigate();

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');
    if (password !== confirm) return setError('Passwords do not match.');
    if (password.length < 6) return setError('Password must be at least 6 characters.');
    setLoading(true);
    try {
      const result = await createUserWithEmailAndPassword(auth, email, password);
      await setDoc(doc(db, 'users', result.user.uid), {
        uid: result.user.uid,
        email,
        displayName: name,
        role: 'user',
        likedSongs: [],
        createdAt: serverTimestamp(),
      });
      navigate('/home');
    } catch (err) {
      setError(err.message.replace('Firebase: ', ''));
    }
    setLoading(false);
  };

  const handleGoogleLogin = async () => {
    setError('');
    setGoogleLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      navigate('/home');
    } catch (err) {
      setError('Google sign-in failed. Please try again.');
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
        <p style={styles.subtitle}>Create your account</p>

        {error && <div style={styles.errorBox}>{error}</div>}

        <form onSubmit={handleRegister} style={styles.form}>
          <div style={styles.fieldGroup}>
            <label style={styles.label}>Full Name</label>
            <input
              type="text"
              placeholder="John Doe"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              style={styles.input}
              onFocus={e => e.target.style.borderColor = '#22c55e'}
              onBlur={e => e.target.style.borderColor = '#2d2d2d'}
            />
          </div>
          <div style={styles.fieldGroup}>
            <label style={styles.label}>Email</label>
            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={styles.input}
              onFocus={e => e.target.style.borderColor = '#22c55e'}
              onBlur={e => e.target.style.borderColor = '#2d2d2d'}
            />
          </div>
          <div style={styles.fieldGroup}>
            <label style={styles.label}>Password</label>
            <input
              type="password"
              placeholder="Min. 6 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={styles.input}
              onFocus={e => e.target.style.borderColor = '#22c55e'}
              onBlur={e => e.target.style.borderColor = '#2d2d2d'}
            />
          </div>
          <div style={styles.fieldGroup}>
            <label style={styles.label}>Confirm Password</label>
            <input
              type="password"
              placeholder="••••••••"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              style={styles.input}
              onFocus={e => e.target.style.borderColor = '#22c55e'}
              onBlur={e => e.target.style.borderColor = '#2d2d2d'}
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            style={{ ...styles.primaryBtn, opacity: loading ? 0.6 : 1 }}
          >
            {loading ? 'Creating account…' : 'Create Account'}
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
          Already have an account?{' '}
          <Link to="/login" style={styles.link}>Sign in</Link>
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
  },
  errorBox: {
    background: 'rgba(239,68,68,0.1)',
    border: '1px solid rgba(239,68,68,0.3)',
    color: '#f87171',
    borderRadius: '8px',
    padding: '12px 14px',
    fontSize: '13px',
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
    transition: 'border-color 0.2s',
    width: '100%',
    boxSizing: 'border-box',
  },
  primaryBtn: {
    background: '#22c55e',
    color: '#000',
    border: 'none',
    borderRadius: '8px',
    padding: '12px',
    fontWeight: '600',
    fontSize: '14px',
    cursor: 'pointer',
    marginTop: '4px',
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
  },
  dividerText: {
    color: '#4b5563',
    fontSize: '12px',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  googleBtn: {
    background: '#fff',
    color: '#111',
    border: 'none',
    borderRadius: '8px',
    padding: '11px 14px',
    fontWeight: '600',
    fontSize: '14px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    width: '100%',
  },
  footerText: {
    color: '#6b7280',
    fontSize: '13px',
    textAlign: 'center',
    marginTop: '24px',
  },
  link: {
    color: '#22c55e',
    textDecoration: 'none',
    fontWeight: '500',
  },
};

export default Register;
