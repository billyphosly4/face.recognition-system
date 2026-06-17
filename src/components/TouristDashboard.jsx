import React, { useState, useEffect, useRef, useCallback } from 'react';
import './TouristDashboard.css';

const API_BASE = 'http://127.0.0.1:5000';

export default function TouristDashboard() {
  /* ── Guide list state ──────────────────────────────────────── */
  const [guides, setGuides] = useState([]);
  const [fetchLoading, setFetchLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);

  /* ── Verification modal state ──────────────────────────────── */
  const [selectedGuide, setSelectedGuide] = useState(null);   // guide object or null
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState(null);
  const [verifyStep, setVerifyStep] = useState(0);

  const videoRef = useRef(null);
  const streamRef = useRef(null);

  /* ── Fetch guides on mount ─────────────────────────────────── */
  useEffect(() => { fetchGuides(); }, []);

  const fetchGuides = async () => {
    setFetchLoading(true);
    setFetchError(null);
    try {
      const res = await fetch(`${API_BASE}/api/tourists/browse-guides`);
      const data = await res.json();
      if (data.success) setGuides(data.guides);
      else setFetchError(data.error || 'Failed to load guides.');
    } catch {
      setFetchError('Could not connect to the backend. Is the Flask server running on port 5000?');
    } finally {
      setFetchLoading(false);
    }
  };

  /* ── Verification loading ticker ───────────────────────────── */
  const VERIFY_STEPS = [
    'Capturing biometric snapshot…',
    'Extracting live face embedding vector…',
    'Fetching stored embedding from Firestore…',
    'Computing cosine similarity distance…',
  ];

  useEffect(() => {
    if (!verifying) { setVerifyStep(0); return; }
    const iv = setInterval(() => setVerifyStep(s => (s + 1) % VERIFY_STEPS.length), 1200);
    return () => clearInterval(iv);
  }, [verifying]);

  /* ── Camera lifecycle ──────────────────────────────────────── */
  const startCamera = useCallback(async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'environment' },
      });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setCameraActive(true);
    } catch {
      setCameraError('Camera access denied or unavailable. Check browser permissions.');
      setCameraActive(false);
    }
  }, []);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraActive(false);
  }, []);

  /* ── Open / close verification modal ───────────────────────── */
  const openVerify = (guide) => {
    setSelectedGuide(guide);
    setVerifyResult(null);
    setCameraError(null);
  };

  const closeVerify = () => {
    stopCamera();
    setSelectedGuide(null);
    setVerifyResult(null);
  };

  /* Start camera when modal opens */
  useEffect(() => {
    if (selectedGuide && !verifyResult) startCamera();
    return () => { if (!selectedGuide) stopCamera(); };
  }, [selectedGuide]);

  /* ── Capture frame → base64 ────────────────────────────────── */
  const captureFrame = () => {
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current?.videoWidth || 640;
    canvas.height = videoRef.current?.videoHeight || 480;
    canvas.getContext('2d').drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg');
  };

  /* ── Handle verification ───────────────────────────────────── */
  const handleVerify = async () => {
    if (!cameraActive) return;

    const photo = captureFrame();
    stopCamera();
    setVerifying(true);

    try {
      const res = await fetch(`${API_BASE}/api/tourists/verify-guide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guide_id: selectedGuide.id, photo }),
      });
      const data = await res.json();
      setVerifyResult(data);
    } catch {
      setVerifyResult({ success: false, error: 'Connection to backend failed.' });
    } finally {
      setVerifying(false);
    }
  };

  /* ── Retry verification ────────────────────────────────────── */
  const retryVerify = () => {
    setVerifyResult(null);
    startCamera();
  };

  /* ── Avatar color from name ────────────────────────────────── */
  const avatarHue = (name) => {
    let hash = 0;
    for (let i = 0; i < (name || '').length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return Math.abs(hash) % 360;
  };

  /* ═══════════════ RENDER ═══════════════════════════════════════ */
  return (
    <div className="td-container">
      {/* ── Section header ── */}
      <div className="td-header">
        <span className="td-badge">Tourist Portal</span>
        <h2 className="td-title">Browse Verified Tour Guides</h2>
        <p className="td-subtitle">
          Find a local guide for your trip. Before meeting, use the biometric scanner to verify
          the guide standing in front of you matches their approved Firestore profile.
        </p>
      </div>

      {/* ── Loading state ── */}
      {fetchLoading && (
        <div className="td-fetch-loading">
          <div className="td-pulse" />
          <p>Loading guide marketplace…</p>
        </div>
      )}

      {/* ── Error state ── */}
      {fetchError && !fetchLoading && (
        <div className="td-fetch-error">
          <WarnIcon className="td-err-icon" />
          <p>{fetchError}</p>
          <button className="td-btn secondary sm" onClick={fetchGuides}>Retry</button>
        </div>
      )}

      {/* ── Empty state ── */}
      {!fetchLoading && !fetchError && guides.length === 0 && (
        <div className="td-empty">
          <UsersIcon className="td-empty-icon" />
          <h3>No Guides Registered Yet</h3>
          <p>Switch to the <strong>Guide Portal</strong> tab to register the first guide.</p>
        </div>
      )}

      {/* ── Guide cards grid ── */}
      {!fetchLoading && guides.length > 0 && (
        <div className="td-grid">
          {guides.map(guide => (
            <div key={guide.id} className="td-card">
              <div className="td-card-top">
                <div className="td-avatar" style={{ '--hue': avatarHue(guide.name) }}>
                  {(guide.name || '?')[0].toUpperCase()}
                </div>
                <div className="td-card-info">
                  <h3 className="td-card-name">{guide.name}</h3>
                  <span className="td-card-id">ID: {guide.national_id}</span>
                </div>
                <span className="td-status-badge">{guide.status || 'approved'}</span>
              </div>

              {guide.bio && <p className="td-card-bio">{guide.bio}</p>}

              <div className="td-card-meta">
                <div className="td-meta-item">
                  <DollarIcon /><span>${guide.hourly_rate}/hr</span>
                </div>
                {guide.languages && (
                  <div className="td-meta-item">
                    <GlobeIcon /><span>{guide.languages}</span>
                  </div>
                )}
                {guide.phone && (
                  <div className="td-meta-item">
                    <PhoneIcon /><span>{guide.phone}</span>
                  </div>
                )}
              </div>

              <button className="td-btn primary full" onClick={() => openVerify(guide)}>
                <ScanIcon /> Verify Guide Identity
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ═══════ Verification Modal ═══════ */}
      {selectedGuide && (
        <div className="td-modal-backdrop" onClick={closeVerify}>
          <div className="td-modal" onClick={e => e.stopPropagation()}>
            {/* Modal close */}
            <button className="td-modal-close" onClick={closeVerify}>
              <CloseIcon />
            </button>

            {/* Guide info header */}
            <div className="td-modal-guide">
              <div className="td-avatar sm" style={{ '--hue': avatarHue(selectedGuide.name) }}>
                {(selectedGuide.name || '?')[0].toUpperCase()}
              </div>
              <div>
                <h3>Verifying: {selectedGuide.name}</h3>
                <span className="td-modal-sub">ID: {selectedGuide.national_id} · ${selectedGuide.hourly_rate}/hr</span>
              </div>
            </div>

            {/* ── Loading state ── */}
            {verifying && (
              <div className="td-verify-loading">
                <div className="td-v-spinner">
                  <div className="td-v-ring r1" />
                  <div className="td-v-ring r2" />
                  <FaceIcon className="td-v-ring-icon" />
                </div>
                <h3>Analysing Biometrics</h3>
                <p className="td-v-step">{VERIFY_STEPS[verifyStep]}</p>
              </div>
            )}

            {/* ── Camera feed ── */}
            {!verifying && !verifyResult && (
              <div className="td-camera-section">
                <p className="td-camera-instruction">Point your camera at the guide's face and tap <strong>Scan & Verify</strong></p>
                <div className="td-video-wrap">
                  <video ref={videoRef} autoPlay playsInline muted className={`td-video ${cameraActive ? 'ready' : ''}`} />
                  {!cameraActive && !cameraError && (
                    <div className="td-video-overlay">
                      <div className="td-pulse" /><p>Starting camera…</p>
                    </div>
                  )}
                  {cameraError && (
                    <div className="td-video-overlay error">
                      <WarnIcon className="td-icon-lg" />
                      <p>{cameraError}</p>
                      <button className="td-btn secondary sm" onClick={startCamera}>Retry</button>
                    </div>
                  )}
                  {cameraActive && (
                    <div className="td-scan-overlay">
                      <div className="td-scan-line" />
                      <div className="td-bracket tl" /><div className="td-bracket tr" />
                      <div className="td-bracket bl" /><div className="td-bracket br" />
                    </div>
                  )}
                </div>
                <button
                  className="td-btn verify-btn full"
                  onClick={handleVerify}
                  disabled={!cameraActive}
                >
                  <ScanIcon /> Scan & Verify Identity
                </button>
              </div>
            )}

            {/* ── Verification result ── */}
            {verifyResult && !verifying && (
              <div className="td-result-section">
                {verifyResult.success && verifyResult.verified ? (
                  /* ── Verified ── */
                  <div className="td-result verified">
                    <div className="td-result-icon-wrap success">
                      <CheckIcon />
                    </div>
                    <h2>✅ Guide Verified Successfully!</h2>
                    <p className="td-result-sub">
                      The face captured matches the stored biometric profile in Firestore.
                    </p>
                    <div className="td-result-stats">
                      <div className="td-stat">
                        <span className="td-stat-num">{verifyResult.confidence}%</span>
                        <span className="td-stat-lbl">Confidence</span>
                      </div>
                      <div className="td-stat">
                        <span className="td-stat-num">{verifyResult.distance}</span>
                        <span className="td-stat-lbl">Cosine Dist.</span>
                      </div>
                      <div className="td-stat">
                        <span className="td-stat-num mono">{verifyResult.engine}</span>
                        <span className="td-stat-lbl">Engine</span>
                      </div>
                    </div>
                  </div>
                ) : verifyResult.success && !verifyResult.verified ? (
                  /* ── Not matched ── */
                  <div className="td-result alert">
                    <div className="td-result-icon-wrap danger">
                      <AlertIcon />
                    </div>
                    <h2>❌ Alert: Face Does Not Match Stored Profile!</h2>
                    <p className="td-result-sub">
                      The person in front of you does <strong>not</strong> match the approved guide's biometric record.
                      Exercise caution and do not proceed with this individual.
                    </p>
                    <div className="td-result-stats">
                      <div className="td-stat">
                        <span className="td-stat-num">{verifyResult.confidence}%</span>
                        <span className="td-stat-lbl">Similarity</span>
                      </div>
                      <div className="td-stat">
                        <span className="td-stat-num">{verifyResult.distance}</span>
                        <span className="td-stat-lbl">Cosine Dist.</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* ── Error ── */
                  <div className="td-result error-result">
                    <div className="td-result-icon-wrap danger">
                      <AlertIcon />
                    </div>
                    <h2>Verification Error</h2>
                    <p className="td-result-sub">{verifyResult.error}</p>
                  </div>
                )}

                <div className="td-result-actions">
                  <button className="td-btn secondary" onClick={retryVerify}>
                    <CameraIcon /> Scan Again
                  </button>
                  <button className="td-btn ghost" onClick={closeVerify}>
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

/* ── Inline SVG Icons ──────────────────────────────────────────────── */
const ScanIcon = () => <svg className="td-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" /></svg>;
const WarnIcon = ({ className }) => <svg className={`td-icon ${className || ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>;
const CheckIcon = () => <svg className="td-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
const AlertIcon = () => <svg className="td-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
const CloseIcon = () => <svg className="td-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>;
const FaceIcon = () => <svg className="td-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 10a1 1 0 11-2 0 1 1 0 012 0zm6 0a1 1 0 11-2 0 1 1 0 012 0zm-6 4a3 3 0 106 0" /></svg>;
const CameraIcon = () => <svg className="td-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>;
const DollarIcon = () => <svg className="td-icon sm" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
const GlobeIcon = () => <svg className="td-icon sm" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
const PhoneIcon = () => <svg className="td-icon sm" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>;
const UsersIcon = ({ className }) => <svg className={`td-icon ${className || ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>;
