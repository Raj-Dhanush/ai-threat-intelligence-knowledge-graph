import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    setLoading(true);

    try {
      if (isRegistering) {
        // Register flow
        await api.post('/auth/register', { name, email, password });
        setSuccessMsg('Registration successful! Logging you in...');
        // Auto-login after registration
        const loginRes = await api.post('/auth/login', { email, password });
        localStorage.setItem('token', loginRes.data.token);
        if (loginRes.data.user) {
          localStorage.setItem('user', JSON.stringify(loginRes.data.user));
        }
        navigate('/dashboard');
      } else {
        // Login flow
        const res = await api.post('/auth/login', { email, password });
        localStorage.setItem('token', res.data.token);
        if (res.data.user) {
          localStorage.setItem('user', JSON.stringify(res.data.user));
        }
        navigate('/dashboard');
      }
    } catch (err) {
      console.error('Auth error:', err);
      setError(
        err.response?.data?.message ||
        (err.code === 'ERR_NETWORK' ? 'Unable to reach backend at http://localhost:5000' : 'Authentication failed')
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      position: 'relative'
    }}>
      {/* Background grid overlay */}
      <div style={{
        position: 'absolute',
        inset: 0,
        backgroundImage: 'linear-gradient(to right, rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.03) 1px, transparent 1px)',
        backgroundSize: '40px 40px',
        pointerEvents: 'none'
      }} />

      <div style={{
        width: '100%',
        maxWidth: '440px',
        position: 'relative',
        zIndex: 1
      }}>
        {/* Logo and header */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{
            width: '56px',
            height: '56px',
            background: 'linear-gradient(135deg, #06b6d4, #3b82f6)',
            borderRadius: '14px',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 24px rgba(6, 182, 212, 0.4)',
            marginBottom: '16px'
          }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              <path d="M12 8v4"/>
              <path d="M12 16h.01"/>
            </svg>
          </div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#f8fafc', marginBottom: '8px' }}>
            CYBER INTEL <span style={{ color: '#06b6d4' }}>GRAPH</span>
          </h1>
          <p style={{ color: '#94a3b8', fontSize: '0.9rem' }}>
            AI-Powered Threat Intelligence Knowledge Graph Platform
          </p>
        </div>

        {/* Login / Register Card */}
        <div className="cyber-card" style={{ padding: '32px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#f1f5f9' }}>
              {isRegistering ? 'Create Analyst Account' : 'Analyst Authentication'}
            </h2>
            <span style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.75rem',
              padding: '2px 8px',
              borderRadius: '4px',
              background: 'rgba(6, 182, 212, 0.15)',
              color: '#06b6d4',
              border: '1px solid rgba(6, 182, 212, 0.3)'
            }}>
              JWT AUTH
            </span>
          </div>

          {error && (
            <div style={{
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              color: '#fca5a5',
              padding: '12px 14px',
              borderRadius: '8px',
              fontSize: '0.875rem',
              marginBottom: '20px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              {error}
            </div>
          )}

          {successMsg && (
            <div style={{
              background: 'rgba(16, 185, 129, 0.15)',
              border: '1px solid rgba(16, 185, 129, 0.4)',
              color: '#6ee7b7',
              padding: '12px 14px',
              borderRadius: '8px',
              fontSize: '0.875rem',
              marginBottom: '20px'
            }}>
              {successMsg}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            {isRegistering && (
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '6px' }}>
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="SecOps Analyst"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    borderRadius: '8px',
                    background: '#1e293b',
                    border: '1px solid #334155',
                    color: '#f8fafc',
                    fontSize: '0.95rem'
                  }}
                />
              </div>
            )}

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '6px' }}>
                Analyst Email
              </label>
              <input
                type="email"
                required
                placeholder="analyst@threatintel.io"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  borderRadius: '8px',
                  background: '#1e293b',
                  border: '1px solid #334155',
                  color: '#f8fafc',
                  fontSize: '0.95rem'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '6px' }}>
                Password
              </label>
              <input
                type="password"
                required
                placeholder="••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  borderRadius: '8px',
                  background: '#1e293b',
                  border: '1px solid #334155',
                  color: '#f8fafc',
                  fontSize: '0.95rem'
                }}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="cyber-btn-primary"
              style={{
                width: '100%',
                padding: '12px',
                marginTop: '8px',
                fontSize: '0.95rem'
              }}
            >
              {loading ? (
                <span>Authenticating...</span>
              ) : isRegistering ? (
                'Register & Enter SOC'
              ) : (
                'Authenticate & Sign In'
              )}
            </button>
          </form>

          <div style={{
            marginTop: '24px',
            paddingTop: '20px',
            borderTop: '1px solid #1e293b',
            textAlign: 'center',
            fontSize: '0.875rem',
            color: '#94a3b8'
          }}>
            {isRegistering ? (
              <span>
                Already have an analyst account?{' '}
                <button
                  type="button"
                  onClick={() => { setIsRegistering(false); setError(''); }}
                  style={{ color: '#06b6d4', background: 'none', fontWeight: 600, textDecoration: 'underline' }}
                >
                  Sign In
                </button>
              </span>
            ) : (
              <span>
                First time logging in?{' '}
                <button
                  type="button"
                  onClick={() => { setIsRegistering(true); setError(''); }}
                  style={{ color: '#06b6d4', background: 'none', fontWeight: 600, textDecoration: 'underline' }}
                >
                  Register Account
                </button>
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
