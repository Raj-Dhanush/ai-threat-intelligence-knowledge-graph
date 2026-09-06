import { Link, useLocation, useNavigate } from 'react-router-dom';

export default function Navbar() {
  const location = useLocation();
  const navigate = useNavigate();

  let user = null;
  try {
    user = JSON.parse(localStorage.getItem('user'));
  } catch (e) {
    user = null;
  }

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/');
  };

  return (
    <header className="cyber-navbar">
      <div className="brand-badge">
        <div className="brand-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            <path d="M12 8v4"/>
            <path d="M12 16h.01"/>
          </svg>
        </div>
        <div>
          <span className="brand-title">CYBER INTEL</span>
          <span className="brand-accent">GRAPH</span>
        </div>
      </div>

      <nav className="nav-links">
        <Link 
          to="/dashboard" 
          className={`nav-link ${location.pathname === '/dashboard' ? 'active' : ''}`}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="7" height="7" />
            <rect x="14" y="3" width="7" height="7" />
            <rect x="14" y="14" width="7" height="7" />
            <rect x="3" y="14" width="7" height="7" />
          </svg>
          Dashboard
        </Link>

        <Link 
          to="/upload" 
          className={`nav-link ${location.pathname === '/upload' ? 'active' : ''}`}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          Upload Report
        </Link>

        <Link 
          to="/graph" 
          className={`nav-link ${location.pathname === '/graph' ? 'active' : ''}`}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="6" cy="6" r="3" />
            <circle cx="18" cy="18" r="3" />
            <circle cx="18" cy="6" r="3" />
            <line x1="8.5" y1="7.5" x2="15.5" y2="16.5" />
            <line x1="8.5" y1="6" x2="15.5" y2="6" />
          </svg>
          Knowledge Graph
        </Link>

        <div style={{ marginLeft: '12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          {user && (
            <span style={{ 
              fontSize: '0.8rem', 
              color: '#94a3b8', 
              fontFamily: 'var(--font-mono)',
              borderRight: '1px solid #334155',
              paddingRight: '12px'
            }}>
              {user.name || user.email}
            </span>
          )}
          <button onClick={handleLogout} className="logout-btn" title="Sign Out">
            Sign Out
          </button>
        </div>
      </nav>
    </header>
  );
}
