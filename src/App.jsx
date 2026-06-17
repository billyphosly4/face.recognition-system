import { useState, useEffect } from 'react';
import Home from './pages/Home';
import Signup from './pages/Signup';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import GuideRegister from './components/GuideRegister';
import './App.css';

// Production backend URL - deployed on Render
const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

function App() {
  const [page, setPage] = useState('home'); // 'home' | 'login' | 'signup' | 'dashboard' | 'guide-register'
  const [currentUser, setCurrentUser] = useState(null);
  const [status, setStatus] = useState(null);

  // ── Session Persistency & Initialization ──
  useEffect(() => {
    const savedUser = localStorage.getItem('tourguard_user');
    if (savedUser) {
      try {
        const user = JSON.parse(savedUser);
        setCurrentUser(user);
        setPage('dashboard');
      } catch (e) {
        localStorage.removeItem('tourguard_user');
      }
    }
  }, []);

  // ── Route Guards ──
  useEffect(() => {
    if (currentUser) {
      if (page === 'login' || page === 'signup') {
        setPage('dashboard');
      }
    } else {
      if (page === 'dashboard') {
        setPage('home');
      }
    }
  }, [currentUser, page]);

  // ── Fetch Health Check Status ──
  const fetchStatus = () => {
    fetch(`${API_BASE}/api/status`)
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => {});
  };

  useEffect(() => {
    fetchStatus();
    // Poll status every 15s to keep dashboard sync'd
    const interval = setInterval(fetchStatus, 15000);
    return () => clearInterval(interval);
  }, []);

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem('tourguard_user');
    setPage('home');
  };

  const isPublicView = page === 'home' || page === 'login' || page === 'signup';

  return (
    <div className={`app-shell ${isPublicView ? 'public-layout' : 'authenticated-layout'}`}>
      
      {/* ── CONDITIONALLY RENDERED NAVBAR ── */}
      {isPublicView ? (
        /* Standard Consumer Public Navbar */
        <nav className="public-nav">
          <div className="nav-brand" onClick={() => setPage('home')} style={{ cursor: 'pointer' }}>
            <svg className="nav-logo" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <div className="brand-texts">
              <span className="brand-title">TourGuard</span>
              <span className="brand-tagline">Safe travel exploration platform</span>
            </div>
          </div>
          <div className="nav-links">
            <button className="nav-btn-link" onClick={() => setPage('home')}>Home</button>
            <button className="btn btn-secondary btn-sm" onClick={() => setPage('login')}>Log In</button>
            <button className="btn btn-primary btn-sm" onClick={() => setPage('signup')}>Sign Up</button>
          </div>
        </nav>
      ) : (
        /* Premium Dashboard Authenticated Navbar */
        <nav className="dashboard-nav">
          <div className="nav-brand" onClick={() => setPage('dashboard')} style={{ cursor: 'pointer' }}>
            <svg className="nav-logo" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <div className="brand-texts">
              <span className="brand-title">TourGuard</span>
              <span className="brand-subtitle">Tourism Matching & Biometric Safety</span>
            </div>
          </div>
          <div className="nav-status">
            <div className="user-indicator">
              <span className="user-dot"></span>
              <span className="user-name">{currentUser?.name || 'Tourist'}</span>
            </div>
            <span className="system-time">
              {new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
            </span>
          </div>
        </nav>
      )}

      {/* ── SYSTEM STATUS GRID (Authenticated Dashboard Only) ── */}
      {!isPublicView && (
        <section className="dashboard-stats-grid">
          <div className="stat-card">
            <span className="stat-label">Biometric Engine</span>
            <div className="stat-value-row">
              <span className="stat-number">{status?.deepface_available ? 'DeepFace' : 'Simulator'}</span>
              <span className={`stat-indicator ${status?.deepface_available ? 'green' : 'amber'}`}>
                {status?.deepface_available ? 'Active' : 'Simulated'}
              </span>
            </div>
            <span className="stat-desc">
              {status?.deepface_available ? 'VGG-Face 4096-dim embeddings' : status?.deepface_error || 'Using random vector simulation'}
            </span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Database Mode</span>
            <div className="stat-value-row">
              <span className="stat-number">{status?.firestore_mode?.includes('Mock') ? 'Local Mock' : 'Firestore'}</span>
              <span className={`stat-indicator ${status?.firestore_mode?.includes('Mock') ? 'amber' : 'green'}`}>
                {status?.firestore_mode?.includes('Mock') ? 'File-based' : 'Cloud'}
              </span>
            </div>
            <span className="stat-desc">{status?.firestore_mode || 'Checking connection…'}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Active Guides</span>
            <div className="stat-value-row">
              <span className="stat-number">{status?.guides_count ?? '—'}</span>
              <span className="stat-indicator purple">Verified</span>
            </div>
            <span className="stat-desc">Approved guides in Firestore database</span>
          </div>
        </section>
      )}

      {/* ── DYNAMIC PAGE VIEWS ── */}
      <main className="dashboard-main-container">
        {page === 'home' && <Home setPage={setPage} />}
        {page === 'signup' && <Signup setPage={setPage} />}
        {page === 'login' && <Login setPage={setPage} setCurrentUser={setCurrentUser} />}
        {page === 'dashboard' && <Dashboard currentUser={currentUser} handleLogout={handleLogout} />}
        {page === 'guide-register' && (
          <div className="register-utility-wrap">
            <div className="utility-back-bar">
              <button className="btn btn-secondary btn-sm" onClick={() => setPage('dashboard')}>
                ← Back to Dashboard
              </button>
              <span className="utility-badge">⚙️ Admin Sandbox Console</span>
            </div>
            <GuideRegister />
          </div>
        )}
      </main>

      {/* ── FOOTERS ── */}
      {isPublicView ? (
        /* Standard Professional Consumer Footer */
        <footer className="public-footer">
          <div className="footer-top">
            <div className="footer-brand">
              <span className="footer-title">TourGuard</span>
              <p className="footer-subtitle">Safe, secure, and transparent local guide matching.</p>
            </div>
            <div className="footer-links-group">
              <a href="#about">About Platform</a>
              <a href="#privacy">Privacy Policy</a>
              <a href="#safety">Safety Guidelines</a>
            </div>
            <div className="footer-badges">
              <span className="safety-badge">🛡️ Verified Biometrics</span>
              <span className="safety-badge">🔒 Secure Cloud Sync</span>
              <span className="safety-badge">🤝 Trusted Matching</span>
            </div>
          </div>
          <div className="footer-bottom">
            <p>© 2026 TourGuard Systems. All rights reserved.</p>
          </div>
        </footer>
      ) : (
        /* Dashboard Footer with Admin sandbox links */
        <footer className="dashboard-footer">
          <div className="footer-credits">
            <p>© 2026 TourGuard Systems. All rights reserved.</p>
          </div>
          <div className="footer-links">
            <button className="footer-btn-link admin-link" onClick={() => setPage('guide-register')}>
              🔧 Admin Sandbox: Register Test Guide
            </button>
            <span className="divider">•</span>
            <a href="#security">Security Protocols</a>
            <span className="divider">•</span>
            <a href="#api">API Reference</a>
          </div>
        </footer>
      )}
      
    </div>
  );
}

export default App;
