import React, { useState, useEffect, useRef, useCallback } from 'react';
import './Dashboard.css';

const API_BASE = 'http://127.0.0.1:5000';

export default function Dashboard({ currentUser, handleLogout }) {
  const [guides, setGuides] = useState([]);
  const [fetchLoading, setFetchLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  /* ── Verification Modal State ──────────────────────────────── */
  const [selectedGuide, setSelectedGuide] = useState(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState(null);
  const [verifyStep, setVerifyStep] = useState(0);

  const videoRef = useRef(null);
  const streamRef = useRef(null);

  /* ── Fetch Guides on Mount ─────────────────────────────────── */
  useEffect(() => {
    fetchGuides();
  }, []);

  const fetchGuides = async () => {
    setFetchLoading(true);
    setFetchError(null);
    try {
      const res = await fetch(`${API_BASE}/api/tourists/browse-guides`);
      const data = await res.json();
      if (data.success) {
        setGuides(data.guides);
      } else {
        setFetchError(data.error || 'Failed to load guides.');
      }
    } catch (err) {
      setFetchError('Could not connect to the backend. Is the Flask server running on port 5000?');
    } finally {
      setFetchLoading(false);
    }
  };

  /* ── Verification Step Ticker ────────────────────────────────── */
  const VERIFY_STEPS = [
    'Capturing biometric snapshot…',
    'Extracting live face embedding vector…',
    'Fetching stored embedding from Firestore…',
    'Computing cosine similarity distance…',
    'Finalizing verification result…',
  ];

  useEffect(() => {
    if (!verifying) { setVerifyStep(0); return; }
    const iv = setInterval(() => {
      setVerifyStep((s) => (s + 1) % VERIFY_STEPS.length);
    }, 1100);
    return () => clearInterval(iv);
  }, [verifying]);

  /* ── Camera Lifecycle ──────────────────────────────────────── */
  const startCamera = useCallback(async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setCameraActive(true);
    } catch (err) {
      const msg = err.name === 'NotAllowedError'
        ? 'Camera access denied. Please allow camera permissions in your browser settings.'
        : err.name === 'NotFoundError'
        ? 'No camera found on this device.'
        : 'Camera access failed. Please check your device and browser settings.';
      setCameraError(msg);
      setCameraActive(false);
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraActive(false);
  }, []);

  /* ── Open / Close Modal ──────────────────────────────────────── */
  const openVerify = (guide) => {
    setSelectedGuide(guide);
    setVerifyResult(null);
    setCameraError(null);
  };

  const closeVerify = useCallback(() => {
    stopCamera();
    setSelectedGuide(null);
    setVerifyResult(null);
    setVerifying(false);
  }, [stopCamera]);

  /* Start camera when modal opens */
  useEffect(() => {
    if (selectedGuide && !verifyResult) {
      startCamera();
    }
    return () => {
      if (!selectedGuide) stopCamera();
    };
  }, [selectedGuide, verifyResult, startCamera, stopCamera]);

  /* Close modal on Escape key */
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') closeVerify(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [closeVerify]);

  /* ── Capture Frame → Base64 ─────────────────────────────────── */
  const captureFrame = () => {
    const canvas = document.createElement('canvas');
    const vid = videoRef.current;
    canvas.width = vid?.videoWidth || 640;
    canvas.height = vid?.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (vid) ctx.drawImage(vid, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.9);
  };

  /* ── Handle Verify Request ──────────────────────────────────── */
  const handleVerify = async () => {
    if (!cameraActive) return;
    const photo = captureFrame();
    stopCamera();
    setVerifying(true);

    try {
      const res = await fetch(`${API_BASE}/api/tourists/verify-guide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guideId: selectedGuide.id, photo }),
      });
      const data = await res.json();
      setVerifyResult(data);
    } catch (err) {
      setVerifyResult({ success: false, error: 'Connection to verification backend failed. Ensure Flask server is running.' });
    } finally {
      setVerifying(false);
    }
  };

  const retryVerify = () => {
    setVerifyResult(null);
    startCamera();
  };

  /* ── Avatar Color from Name ─────────────────────────────────── */
  const avatarColor = (name) => {
    const palette = [
      ['#0d9488', '#ccfbf1'],
      ['#0f766e', '#99f6e4'],
      ['#065f46', '#a7f3d0'],
      ['#eab308', '#fef9c3'],
      ['#ca8a04', '#fef08a'],
      ['#d97706', '#fde68a'],
    ];
    let hash = 0;
    for (let i = 0; i < (name || '').length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return palette[Math.abs(hash) % palette.length];
  };

  /* ── Filtered Guides ────────────────────────────────────────── */
  const filteredGuides = guides.filter((g) => {
    const q = searchQuery.toLowerCase();
    return (
      !q ||
      (g.name || '').toLowerCase().includes(q) ||
      (g.languages || '').toLowerCase().includes(q) ||
      (g.bio || '').toLowerCase().includes(q)
    );
  });

  /* ═══════════════ RENDER ══════════════════════════════════════ */
  return (
    <div className="db-container">

      {/* ── Welcome Banner ──────────────────────────────── */}
      <div className="db-welcome">
        <div className="db-welcome-left">
          <h2 className="db-welcome-title">
            Welcome back, <span className="db-welcome-name">{currentUser?.name || 'Explorer'}</span> 👋
          </h2>
          <p className="db-welcome-sub">Logged in as <strong>{currentUser?.email}</strong></p>
        </div>
        <button className="db-logout-btn" onClick={handleLogout} id="logout-btn">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          Log Out
        </button>
      </div>

      {/* ── Directory Header ────────────────────────────── */}
      <div className="db-directory-header">
        <div className="db-directory-info">
          <span className="db-badge-pill">Active Directory</span>
          <h3 className="db-section-title">Browse Verified Guides</h3>
          <p className="db-section-sub">
            Select a guide to initiate live in-person identity verification. Point your camera at the guide to cross-reference their biometric profile.
          </p>
        </div>
        <div className="db-controls">
          <div className="db-search-box">
            <svg className="search-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              id="guide-search"
              type="text"
              placeholder="Search guides by name, language…"
              className="db-search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <button className="db-refresh-btn" onClick={fetchGuides} title="Refresh guide list">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>
      </div>

      {/* ── Loading State ─────────────────────────────────── */}
      {fetchLoading && (
        <div className="db-state-box">
          <div className="db-spinner-ring"></div>
          <p>Loading guide directory from Firestore…</p>
        </div>
      )}

      {/* ── Error State ───────────────────────────────────── */}
      {fetchError && !fetchLoading && (
        <div className="db-state-box db-error-box">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" className="db-state-icon">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <h4>Connection Error</h4>
          <p>{fetchError}</p>
          <button className="db-retry-btn" onClick={fetchGuides}>Retry Connection</button>
        </div>
      )}

      {/* ── Empty State ───────────────────────────────────── */}
      {!fetchLoading && !fetchError && guides.length === 0 && (
        <div className="db-state-box">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" className="db-state-icon">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <h4>No Guides Registered Yet</h4>
          <p>No approved guides are listed in the system. Check back later or contact support.</p>
        </div>
      )}

      {/* ── No Search Results ─────────────────────────────── */}
      {!fetchLoading && !fetchError && guides.length > 0 && filteredGuides.length === 0 && (
        <div className="db-state-box">
          <h4>No matches found</h4>
          <p>No guides match "<strong>{searchQuery}</strong>". Try a different name or language.</p>
          <button className="db-retry-btn" onClick={() => setSearchQuery('')}>Clear Search</button>
        </div>
      )}

      {/* ── Guide Marketplace Grid ────────────────────────── */}
      {!fetchLoading && filteredGuides.length > 0 && (
        <div className="db-grid">
          {filteredGuides.map((guide) => {
            const [fg, bg] = avatarColor(guide.name);
            return (
              <div key={guide.id} className="db-guide-card" id={`guide-card-${guide.id}`}>
                {/* Card Top */}
                <div className="card-top">
                  <div
                    className="guide-avatar"
                    style={{ backgroundColor: bg, color: fg }}
                  >
                    {(guide.name || '?')[0].toUpperCase()}
                  </div>
                  <div className="guide-meta">
                    <h4 className="guide-name">{guide.name}</h4>
                    <span className="guide-id-tag">
                      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2" />
                      </svg>
                      ID: {guide.national_id}
                    </span>
                  </div>
                  <span className="badge-approved">✓ Approved</span>
                </div>

                {/* Bio */}
                {guide.bio && (
                  <p className="guide-bio">{guide.bio.length > 100 ? guide.bio.slice(0, 100) + '…' : guide.bio}</p>
                )}

                {/* Specs */}
                <div className="guide-specs">
                  <div className="spec-chip">
                    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>${guide.hourly_rate}/hr</span>
                  </div>

                  {guide.phone && (
                    <div className="spec-chip">
                      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                      </svg>
                      <span>{guide.phone}</span>
                    </div>
                  )}

                  {guide.languages && (
                    <div className="spec-chip">
                      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span>{guide.languages}</span>
                    </div>
                  )}
                </div>

                {/* CTA */}
                <button
                  className="verify-btn"
                  onClick={() => openVerify(guide)}
                  id={`verify-btn-${guide.id}`}
                >
                  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Verify Guide In-Person
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Count badge */}
      {!fetchLoading && filteredGuides.length > 0 && (
        <div className="db-count-label">
          Showing {filteredGuides.length} of {guides.length} approved guide{guides.length !== 1 ? 's' : ''}
        </div>
      )}

      {/* ════════════════════════════════════════════════════
          VERIFICATION MODAL
         ════════════════════════════════════════════════════ */}
      {selectedGuide && (
        <div className="modal-backdrop" onClick={closeVerify}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">

            {/* Modal Header */}
            <div className="modal-header">
              <div className="modal-header-left">
                <div
                  className="modal-avatar"
                  style={{
                    backgroundColor: avatarColor(selectedGuide.name)[1],
                    color: avatarColor(selectedGuide.name)[0],
                  }}
                >
                  {(selectedGuide.name || '?')[0].toUpperCase()}
                </div>
                <div>
                  <h4 className="modal-guide-name">{selectedGuide.name}</h4>
                  <p className="modal-guide-sub">Live Biometric Verification · ID: {selectedGuide.national_id}</p>
                </div>
              </div>
              <button className="modal-close-btn" onClick={closeVerify} aria-label="Close verification" id="modal-close-btn">
                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* ── ANALYZING / PROCESSING STATE ── */}
            {verifying && (
              <div className="modal-analyzing">
                <div className="analyzing-rings">
                  <div className="ring ring-1"></div>
                  <div className="ring ring-2"></div>
                  <div className="ring-center">
                    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                        d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" />
                    </svg>
                  </div>
                </div>
                <h3 className="analyzing-title">Extracting Biometrics</h3>
                <p className="analyzing-step">{VERIFY_STEPS[verifyStep]}</p>
                <div className="analyzing-progress">
                  <div
                    className="analyzing-bar"
                    style={{ width: `${((verifyStep + 1) / VERIFY_STEPS.length) * 100}%` }}
                  ></div>
                </div>
              </div>
            )}

            {/* ── CAMERA VIEWPORT ── */}
            {!verifying && !verifyResult && (
              <div className="modal-camera-section">
                <p className="camera-instruction">
                  Ask the guide to face the camera directly. Align their face within the guide frame below, then capture the snapshot.
                </p>

                <div className="video-wrapper">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className={`camera-video ${cameraActive ? 'is-active' : ''}`}
                  />

                  {/* Loading camera */}
                  {!cameraActive && !cameraError && (
                    <div className="video-overlay">
                      <div className="cam-spinner"></div>
                      <span>Initializing camera…</span>
                    </div>
                  )}

                  {/* Camera error */}
                  {cameraError && (
                    <div className="video-overlay video-error">
                      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                      </svg>
                      <p>{cameraError}</p>
                      <button className="retry-cam-btn" onClick={startCamera}>Retry Camera Access</button>
                    </div>
                  )}

                  {/* Scanner overlay frame */}
                  {cameraActive && (
                    <div className="scanner-frame">
                      <div className="scanner-line"></div>
                      <div className="frame-corner tl"></div>
                      <div className="frame-corner tr"></div>
                      <div className="frame-corner bl"></div>
                      <div className="frame-corner br"></div>
                      <div className="frame-label">Align face here</div>
                    </div>
                  )}
                </div>

                <button
                  className="capture-btn"
                  onClick={handleVerify}
                  disabled={!cameraActive}
                  id="capture-verify-btn"
                >
                  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Capture & Verify Biometrics
                </button>
              </div>
            )}

            {/* ── RESULTS SECTION ── */}
            {verifyResult && !verifying && (
              <div className="modal-result-section">
                {verifyResult.success && verifyResult.verified ? (
                  /* ✅ IDENTITY VERIFIED */
                  <div className="result-card result-verified">
                    <div className="result-icon-ring success-ring">
                      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <h3 className="result-title">✅ Identity Confirmed!</h3>
                    <p className="result-desc">
                      Biometric data matched. The person in front of you is the verified guide{' '}
                      <strong>{selectedGuide.name}</strong>. You may proceed safely.
                    </p>
                    <div className="result-stats-row">
                      <div className="result-stat">
                        <span className="rs-value">{verifyResult.confidence}%</span>
                        <span className="rs-label">Confidence</span>
                      </div>
                      <div className="result-stat">
                        <span className="rs-value">{verifyResult.distance}</span>
                        <span className="rs-label">Cosine Dist.</span>
                      </div>
                      <div className="result-stat">
                        <span className="rs-value rs-engine">{verifyResult.engine}</span>
                        <span className="rs-label">Engine</span>
                      </div>
                    </div>
                  </div>

                ) : verifyResult.success && !verifyResult.verified ? (
                  /* ⚠️ MISMATCH */
                  <div className="result-card result-mismatch">
                    <div className="result-icon-ring danger-ring">
                      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
                          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                    </div>
                    <h3 className="result-title">⚠️ Biometric Mismatch!</h3>
                    <p className="result-desc">
                      The live face scan does <strong>not</strong> match the stored profile for{' '}
                      <strong>{selectedGuide.name}</strong>. Do not proceed. Report suspicious activity immediately.
                    </p>
                    <div className="result-stats-row">
                      <div className="result-stat">
                        <span className="rs-value rs-danger">{verifyResult.confidence}%</span>
                        <span className="rs-label">Similarity</span>
                      </div>
                      <div className="result-stat">
                        <span className="rs-value rs-danger">{verifyResult.distance}</span>
                        <span className="rs-label">Cosine Dist.</span>
                      </div>
                    </div>
                    <div className="mismatch-warning">
                      🚨 Contact your tour operator or local authorities if you suspect fraud.
                    </div>
                  </div>

                ) : (
                  /* 🔴 SYSTEM ERROR */
                  <div className="result-card result-error">
                    <div className="result-icon-ring error-ring">
                      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <h3 className="result-title">Verification Failed</h3>
                    <p className="result-desc">
                      {verifyResult.error || 'An unknown error occurred during verification. Please try again.'}
                    </p>
                  </div>
                )}

                <div className="result-actions">
                  <button className="result-btn-secondary" onClick={retryVerify} id="retry-verify-btn">
                    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Scan Again
                  </button>
                  <button className="result-btn-primary" onClick={closeVerify} id="close-result-btn">
                    Close
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>
      )}

    </div>
  );
}
