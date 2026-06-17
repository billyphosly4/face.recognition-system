import React, { useState, useRef } from 'react';
import './GuideRegister.css';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

export default function GuideRegister() {
  /* ── Form state ─────────────────────────────────────────────── */
  const [form, setForm] = useState({
    name: '',
    phone: '',
    national_id: '',
    hourly_rate: '',
    bio: '',
    languages: '',
  });

  /* ── Photo state ────────────────────────────────────────────── */
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef(null);

  /* ── Async state ────────────────────────────────────────────── */
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [result, setResult] = useState(null);

  /* ── Loading message ticker ─────────────────────────────────── */
  const STEPS = [
    'Detecting facial landmarks…',
    'Aligning face geometry…',
    'Generating 4096-dim VGG-Face embedding…',
    'Encrypting and writing to Firestore…',
  ];

  React.useEffect(() => {
    if (!loading) { setLoadingStep(0); return; }
    const iv = setInterval(() => setLoadingStep(s => (s + 1) % STEPS.length), 1400);
    return () => clearInterval(iv);
  }, [loading]);

  /* ── Handlers ───────────────────────────────────────────────── */
  const updateField = (key, value) => setForm(f => ({ ...f, [key]: value }));

  const handlePhoto = (file) => {
    if (!file) return;
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onloadend = () => setPhotoPreview(reader.result);
    reader.readAsDataURL(file);
    setResult(null);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) handlePhoto(file);
  };

  const handleSubmit = async () => {
    /* Validate */
    if (!form.name || !form.phone || !form.national_id || !form.hourly_rate) {
      setResult({ success: false, error: 'Please fill in all required fields (Name, Phone, National ID, Hourly Rate).' });
      return;
    }
    if (!photoFile) {
      setResult({ success: false, error: 'Please upload a profile photo for biometric registration.' });
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const fd = new FormData();
      fd.append('name', form.name);
      fd.append('phone', form.phone);
      fd.append('national_id', form.national_id);
      fd.append('hourly_rate', form.hourly_rate);
      fd.append('bio', form.bio);
      fd.append('languages', form.languages);
      fd.append('photo', photoFile);

      const res = await fetch(`${API_BASE}/api/guides/register`, {
        method: 'POST',
        body: fd,
      });
      const data = await res.json();
      setResult(data);

      if (data.success) {
        setForm({ name: '', phone: '', national_id: '', hourly_rate: '', bio: '', languages: '' });
        setPhotoFile(null);
        setPhotoPreview(null);
      }
    } catch {
      setResult({ success: false, error: 'Could not reach the backend API. Is the Flask server running on port 5000?' });
    } finally {
      setLoading(false);
    }
  };

  const resetResult = () => setResult(null);

  /* ── Render ─────────────────────────────────────────────────── */
  return (
    <div className="gr-container">
      {/* ── Section header ── */}
      <div className="gr-header">
        <span className="gr-badge">Guide Onboarding</span>
        <h2 className="gr-title">Register as a Verified Tour Guide</h2>
        <p className="gr-subtitle">
          Submit your profile details and an official photo. Our AI extracts a unique face
          embedding vector that tourists will use to verify your identity in person.
        </p>
      </div>

      {/* ── Loading overlay ── */}
      {loading && (
        <div className="gr-loading-overlay">
          <div className="gr-spinner">
            <div className="gr-ring r1" />
            <div className="gr-ring r2" />
            <div className="gr-ring r3" />
            <ShieldIcon className="gr-ring-icon" />
          </div>
          <h3>Processing Registration</h3>
          <p className="gr-load-step">{STEPS[loadingStep]}</p>
        </div>
      )}

      {/* ── Result card (replaces form on success) ── */}
      {result && !loading && (
        <div className={`gr-result ${result.success ? 'success' : 'error'}`}>
          <div className="gr-result-icon-wrap">
            {result.success ? <CheckCircle /> : <AlertTriangle />}
          </div>
          <h3>{result.success ? 'Guide Registered Successfully!' : 'Registration Failed'}</h3>
          {result.success ? (
            <div className="gr-result-details">
              <p className="gr-result-sub">The biometric face embedding has been stored in Firestore.</p>
              <div className="gr-profile-grid">
                <div className="gr-pf"><span className="gr-lbl">Name</span><span className="gr-val">{result.guide?.name}</span></div>
                <div className="gr-pf"><span className="gr-lbl">Phone</span><span className="gr-val">{result.guide?.phone}</span></div>
                <div className="gr-pf"><span className="gr-lbl">National ID</span><span className="gr-val">{result.guide?.national_id}</span></div>
                <div className="gr-pf"><span className="gr-lbl">Rate</span><span className="gr-val">${result.guide?.hourly_rate}/hr</span></div>
                <div className="gr-pf"><span className="gr-lbl">Status</span><span className="gr-val gr-approved">✓ {result.guide?.status}</span></div>
                <div className="gr-pf"><span className="gr-lbl">Doc ID</span><span className="gr-val mono">{result.guide?.id}</span></div>
              </div>
              <button className="gr-btn secondary" onClick={resetResult}>Register Another Guide</button>
            </div>
          ) : (
            <>
              <p className="gr-error-msg">{result.error}</p>
              <button className="gr-btn secondary" onClick={resetResult}>Try Again</button>
            </>
          )}
        </div>
      )}

      {/* ── Form (hidden during loading / result) ── */}
      {!result && !loading && (
        <div className="gr-form-layout">
          {/* Left: Form fields */}
          <div className="gr-fields">
            <div className="gr-field">
              <label className="gr-label">Full Name <span className="req">*</span></label>
              <input className="gr-input" placeholder="e.g. John Mwangi"
                value={form.name} onChange={e => updateField('name', e.target.value)} />
            </div>
            <div className="gr-row-2">
              <div className="gr-field">
                <label className="gr-label">Phone Number <span className="req">*</span></label>
                <input className="gr-input" placeholder="+254 712 345 678"
                  value={form.phone} onChange={e => updateField('phone', e.target.value)} />
              </div>
              <div className="gr-field">
                <label className="gr-label">National ID <span className="req">*</span></label>
                <input className="gr-input" placeholder="KE-12345678"
                  value={form.national_id} onChange={e => updateField('national_id', e.target.value)} />
              </div>
            </div>
            <div className="gr-row-2">
              <div className="gr-field">
                <label className="gr-label">Hourly Rate (USD) <span className="req">*</span></label>
                <input className="gr-input" type="number" min="1" step="0.5" placeholder="25"
                  value={form.hourly_rate} onChange={e => updateField('hourly_rate', e.target.value)} />
              </div>
              <div className="gr-field">
                <label className="gr-label">Languages</label>
                <input className="gr-input" placeholder="English, Swahili, French"
                  value={form.languages} onChange={e => updateField('languages', e.target.value)} />
              </div>
            </div>
            <div className="gr-field">
              <label className="gr-label">Bio / About</label>
              <textarea className="gr-textarea" rows={3} placeholder="Brief description of your experience, specialities, tour areas…"
                value={form.bio} onChange={e => updateField('bio', e.target.value)} />
            </div>
          </div>

          {/* Right: Photo upload */}
          <div className="gr-photo-section">
            <label className="gr-label">Registration Photo <span className="req">*</span></label>
            <div
              className={`gr-dropzone ${dragOver ? 'drag' : ''} ${photoPreview ? 'filled' : ''}`}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
            >
              <input ref={fileRef} type="file" accept="image/*" hidden
                onChange={e => handlePhoto(e.target.files[0])} />
              {photoPreview ? (
                <>
                  <img src={photoPreview} alt="preview" className="gr-preview-img" />
                  <div className="gr-preview-overlay"><span>Click to change</span></div>
                </>
              ) : (
                <div className="gr-drop-placeholder">
                  <ImageIcon className="gr-drop-icon" />
                  <p>Drag & drop or <span className="gr-link">browse</span></p>
                  <small>Clear, front-facing photo — PNG or JPG</small>
                </div>
              )}
            </div>

            <button className="gr-btn primary full" onClick={handleSubmit} disabled={loading}>
              <ShieldIcon className="gr-btn-icon" />
              Register & Generate Embedding
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Inline SVG Icons ────────────────────────────────────────────────── */
const ShieldIcon = ({ className }) => (
  <svg className={`gr-icon ${className || ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
  </svg>
);
const CheckCircle = () => (
  <svg className="gr-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);
const AlertTriangle = () => (
  <svg className="gr-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
  </svg>
);
const ImageIcon = ({ className }) => (
  <svg className={`gr-icon ${className || ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
      d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
);
