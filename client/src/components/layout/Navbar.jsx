import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';

const Navbar = () => {
  const { user: currentUser, isAdmin, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const isActive = (path) => location.pathname === path;

  return (
    <>
      <style>{`
        .nav-link {
          color: #9ca3af;
          text-decoration: none;
          font-size: 14px;
          font-weight: 500;
          padding: 6px 10px;
          border-radius: 6px;
          transition: color 0.2s, background 0.2s;
        }
        .nav-link:hover { color: #fff; background: rgba(255,255,255,0.05); }
        .nav-link.active { color: #fff; }
        .logout-btn {
          background: transparent;
          border: 1px solid #2d2d2d;
          color: #9ca3af;
          border-radius: 7px;
          padding: 7px 14px;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          transition: border-color 0.2s, color 0.2s;
          font-family: inherit;
        }
        .logout-btn:hover { border-color: #f87171; color: #f87171; }
        .hamburger {
          display: none;
          background: none;
          border: none;
          cursor: pointer;
          padding: 4px;
          color: #9ca3af;
        }
        @media (max-width: 640px) {
          .nav-links-desktop { display: none !important; }
          .hamburger { display: flex !important; align-items: center; }
        }
        .mobile-menu {
          display: none;
          position: absolute;
          top: 61px;
          left: 0;
          right: 0;
          background: #1a1a1a;
          border-bottom: 1px solid #2d2d2d;
          padding: 12px 20px 16px;
          flex-direction: column;
          gap: 4px;
          z-index: 100;
        }
        .mobile-menu.open { display: flex; }
        .mobile-nav-link {
          color: #9ca3af;
          text-decoration: none;
          font-size: 15px;
          font-weight: 500;
          padding: 10px 12px;
          border-radius: 8px;
          transition: color 0.2s, background 0.2s;
        }
        .mobile-nav-link:hover, .mobile-nav-link.active { color: #fff; background: rgba(255,255,255,0.05); }
        .mobile-logout {
          margin-top: 8px;
          background: transparent;
          border: 1px solid #2d2d2d;
          color: #9ca3af;
          border-radius: 8px;
          padding: 10px 12px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          text-align: left;
          font-family: inherit;
          transition: border-color 0.2s, color 0.2s;
        }
        .mobile-logout:hover { border-color: #f87171; color: #f87171; }
      `}</style>
      <nav style={styles.nav}>
        <div style={styles.inner}>
          {/* Logo */}
          <Link to="/home" style={styles.logo}>
            <span style={styles.logoIcon}>♪</span>
            <span style={styles.logoText}>MeloStream</span>
          </Link>

          {/* Desktop Links */}
          <div className="nav-links-desktop" style={styles.links}>
            <Link to="/home" className={`nav-link${isActive('/home') ? ' active' : ''}`}>Home</Link>
            <Link to="/search" className={`nav-link${isActive('/search') ? ' active' : ''}`}>Search</Link>
            <Link to="/liked" className={`nav-link${isActive('/liked') ? ' active' : ''}`}>Liked</Link>
            <Link to="/playlists" className={`nav-link${location.pathname.startsWith('/playlists') ? ' active' : ''}`}>Playlists</Link>
            {isAdmin && (
              <Link to="/admin" className={`nav-link${location.pathname.startsWith('/admin') ? ' active' : ''}`}>Admin</Link>
            )}
          </div>

          {/* Desktop Right */}
          <div className="nav-links-desktop" style={styles.right}>
            {currentUser?.email && (
              <span style={styles.email}>{currentUser.email}</span>
            )}
            <button onClick={handleLogout} className="logout-btn">Logout</button>
          </div>

          {/* Hamburger */}
          <button
            className="hamburger"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Toggle menu"
          >
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              {menuOpen ? (
                <>
                  <line x1="4" y1="4" x2="18" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  <line x1="18" y1="4" x2="4" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </>
              ) : (
                <>
                  <line x1="3" y1="7" x2="19" y2="7" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  <line x1="3" y1="12" x2="19" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  <line x1="3" y1="17" x2="19" y2="17" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </>
              )}
            </svg>
          </button>
        </div>

        {/* Mobile Menu */}
        <div className={`mobile-menu${menuOpen ? ' open' : ''}`}>
          <Link to="/home" className={`mobile-nav-link${isActive('/home') ? ' active' : ''}`} onClick={() => setMenuOpen(false)}>Home</Link>
          <Link to="/search" className={`mobile-nav-link${isActive('/search') ? ' active' : ''}`} onClick={() => setMenuOpen(false)}>Search</Link>
          <Link to="/liked" className={`mobile-nav-link${isActive('/liked') ? ' active' : ''}`} onClick={() => setMenuOpen(false)}>Liked</Link>
          <Link to="/playlists" className={`mobile-nav-link${location.pathname.startsWith('/playlists') ? ' active' : ''}`} onClick={() => setMenuOpen(false)}>Playlists</Link>
          {isAdmin && (
            <Link to="/admin" className={`mobile-nav-link${location.pathname.startsWith('/admin') ? ' active' : ''}`} onClick={() => setMenuOpen(false)}>Admin</Link>
          )}
          {currentUser?.email && (
            <span style={{ color: '#6b7280', fontSize: '12px', padding: '8px 12px 0' }}>{currentUser.email}</span>
          )}
          <button onClick={() => { setMenuOpen(false); handleLogout(); }} className="mobile-logout">Logout</button>
        </div>
      </nav>
    </>
  );
};

const styles = {
  nav: {
    background: '#1a1a1a',
    borderBottom: '1px solid #2d2d2d',
    position: 'sticky',
    top: 0,
    zIndex: 50,
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
  },
  inner: {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '0 20px',
    height: '60px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '16px',
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    textDecoration: 'none',
    flexShrink: 0,
  },
  logoIcon: {
    width: '30px',
    height: '30px',
    background: '#22c55e',
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#000',
    fontSize: '15px',
    fontWeight: '700',
  },
  logoText: {
    color: '#fff',
    fontSize: '16px',
    fontWeight: '700',
    letterSpacing: '-0.3px',
  },
  links: {
    display: 'flex',
    alignItems: 'center',
    gap: '2px',
    flex: 1,
    paddingLeft: '16px',
  },
  right: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    flexShrink: 0,
  },
  email: {
    color: '#6b7280',
    fontSize: '12px',
    maxWidth: '160px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
};

export default Navbar;
