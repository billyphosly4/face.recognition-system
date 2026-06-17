import React from 'react';
import './Home.css';

export default function Home({ setPage }) {
  return (
    <div className="home-container">
      {/* ── HERO SECTION ── */}
      <section className="hero-section">
        <div className="hero-content">
          <div className="hero-badge-pill">
            <span className="badge-icon">🛡️</span>
            <span className="badge-text">Secure Travel Network</span>
          </div>
          <h1 className="hero-headline">
            Explore the World with <span className="text-gradient">Complete Confidence</span>
          </h1>
          <p className="hero-description">
            TourGuard connects adventurers like you with officially vetted local guides. 
            Enjoy peace of mind with our exclusive real-time biometric verification shield 
            that ensures the guide standing in front of you is exactly who they claim to be.
          </p>
          <div className="hero-cta-group">
            <button className="btn btn-primary btn-lg" onClick={() => setPage('signup')}>
              Get Started
              <svg className="btn-icon-arrow" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </button>
            <button className="btn btn-secondary btn-lg" onClick={() => setPage('login')}>
              Log In to Portal
            </button>
          </div>
        </div>

        {/* Travel Representation Background Image Placeholder */}
        <div className="hero-visual-placeholder">
          <div className="visual-overlay"></div>
          <div className="visual-graphic">
            {/* Styled vector mockup representing travel, mountains, and safety */}
            <svg viewBox="0 0 500 350" fill="none" className="travel-vector">
              <defs>
                <linearGradient id="skyGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#0f766e" />
                  <stop offset="100%" stopColor="#115e59" />
                </linearGradient>
                <linearGradient id="mountainGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#134e4a" />
                  <stop offset="100%" stopColor="#042f2e" />
                </linearGradient>
                <linearGradient id="sunGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#fef08a" />
                  <stop offset="100%" stopColor="#eab308" />
                </linearGradient>
              </defs>
              {/* Sky */}
              <rect width="500" height="350" rx="16" fill="url(#skyGrad)" />
              {/* Sun */}
              <circle cx="380" cy="100" r="45" fill="url(#sunGrad)" />
              {/* Distant mountains */}
              <polygon points="100,350 220,180 340,350" fill="#115e59" opacity="0.6" />
              <polygon points="250,350 360,150 480,350" fill="#115e59" opacity="0.4" />
              {/* Foreground mountains */}
              <polygon points="0,350 150,140 320,350" fill="url(#mountainGrad)" />
              <polygon points="180,350 330,120 500,350" fill="url(#mountainGrad)" />
              {/* Path/Road */}
              <polygon points="200,350 250,220 280,350" fill="#eab308" opacity="0.8" />
              {/* Safety Badge Floating */}
              <g transform="translate(40, 40)">
                <rect width="130" height="40" rx="20" fill="rgba(255,255,255,0.15)" backdropFilter="blur(8px)" stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
                <circle cx="20" cy="20" r="10" fill="#eab308" />
                <path d="M17 20l2 2 4-4" stroke="#1f2937" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <text x="38" y="24" fill="#ffffff" fontSize="11" fontWeight="bold" fontFamily="sans-serif">VERIFIED USER</text>
              </g>
            </svg>
            <div className="travel-caption">
              <span>📍 Explore Vetted Guides Globally</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── CORE VALUE GRID ── */}
      <section className="values-section">
        <div className="section-header">
          <span className="section-tag">Premium Safety Protocols</span>
          <h2 className="section-title">Designed for Secure Travel Matching</h2>
          <p className="section-subtitle">
            Traditional travel platforms leave guide matching to chance. TourGuard eliminates risk using modern cryptographic identity shields.
          </p>
        </div>

        <div className="value-grid">
          <div className="value-card">
            <div className="value-icon-box">
              <svg className="value-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <h3>Peace of Mind</h3>
            <p>
              Instantly verify that the guide meeting you at the terminal is a verified professional. No imposter scams, no unvetted intermediaries.
            </p>
          </div>

          <div className="value-card">
            <div className="value-icon-box">
              <svg className="value-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <h3>Trusted Connections</h3>
            <p>
              Browse detailed profiles of licensed, approved guides complete with their hourly booking rates, verified badges, and languages spoken.
            </p>
          </div>

          <div className="value-card">
            <div className="value-icon-box">
              <svg className="value-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h3>Real-time Fraud Prevention</h3>
            <p>
              By cross-referencing live face-embedding vectors against securely encrypted records, you receive confirmation of validity within seconds.
            </p>
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS SECTION ── */}
      <section className="steps-section">
        <h2 className="steps-title">Secure Match in Three Steps</h2>
        <div className="steps-container">
          <div className="step-item">
            <div className="step-number">1</div>
            <h4>Browse Vetted Local Guides</h4>
            <p>Sign in to view a comprehensive grid of approved guides with license IDs and transparent rates.</p>
          </div>
          <div className="step-arrow">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
          <div className="step-item">
            <div className="step-number">2</div>
            <h4>Initiate Biometric Scan</h4>
            <p>Meet in person, choose the guide on your dashboard, and start the device camera stream.</p>
          </div>
          <div className="step-arrow">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
          <div className="step-item">
            <div className="step-number">3</div>
            <h4>Verify Identity Instantly</h4>
            <p>The system computes similarity index. Start your journey with complete confidence.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
