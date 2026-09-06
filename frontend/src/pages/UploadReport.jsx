import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import api from '../services/api';

export default function UploadReport() {
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [uploadedDoc, setUploadedDoc] = useState(null);

  const handleFileChange = (e) => {
    const selected = e.target.files[0];
    if (selected) {
      if (!selected.name.toLowerCase().endsWith('.pdf')) {
        setError('Only PDF files are supported.');
        setFile(null);
        return;
      }
      setError('');
      setFile(selected);
      if (!title) {
        // Auto-fill title based on filename without extension
        const cleanName = selected.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
        setTitle(cleanName.charAt(0).toUpperCase() + cleanName.slice(1));
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!file) {
      setError('Please select a PDF document to upload');
      return;
    }
    if (!title.trim()) {
      setError('Please provide a report title');
      return;
    }

    setUploading(true);

    const formData = new FormData();
    formData.append('title', title.trim());
    formData.append('file', file);

    try {
      const res = await api.post('/documents/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      const doc = res.data.document;
      setUploadedDoc(doc);
      setSuccess(`Report "${doc.title}" uploaded successfully! Extracted ${doc.extractedTextLength || 0} characters.`);
      localStorage.setItem('selectedDocumentId', doc.id);
    } catch (err) {
      console.error('Upload error:', err);
      setError(
        err.response?.data?.message || 'Failed to upload report. Check backend connectivity.'
      );
    } finally {
      setUploading(false);
    }
  };

  // Optional helper to extract and build graph immediately
  const handleAutoProcess = async () => {
    if (!uploadedDoc?.id) return;
    setExtracting(true);
    setError('');
    try {
      // 1. Extract entities
      await api.post(`/entities/extract/${uploadedDoc.id}`);
      // 2. Generate relationships
      await api.post(`/relationships/generate/${uploadedDoc.id}`);
      // 3. Navigate to graph
      navigate('/graph');
    } catch (err) {
      console.error('Auto-processing error:', err);
      setError('Extraction failed: ' + (err.response?.data?.message || err.message));
    } finally {
      setExtracting(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Navbar />

      <main style={{ flex: 1, padding: '40px 24px', maxWidth: '750px', margin: '0 auto', width: '100%' }}>
        <div style={{ marginBottom: '28px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <span style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.8rem',
              color: '#06b6d4',
              background: 'rgba(6, 182, 212, 0.1)',
              padding: '2px 8px',
              borderRadius: '4px',
              border: '1px solid rgba(6, 182, 212, 0.25)'
            }}>
              THREAT INTEL INGESTION
            </span>
          </div>
          <h1 style={{ fontSize: '1.85rem', fontWeight: 800, color: '#f8fafc', margin: 0 }}>
            Upload Threat Intelligence Report
          </h1>
          <p style={{ color: '#94a3b8', fontSize: '0.95rem', marginTop: '6px' }}>
            Ingest raw threat bulletins or advisories in PDF format for automated NLP parsing and knowledge graph modeling
          </p>
        </div>

        {error && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.4)',
            color: '#fca5a5',
            padding: '14px 16px',
            borderRadius: '8px',
            marginBottom: '24px',
            fontSize: '0.9rem'
          }}>
            {error}
          </div>
        )}

        {success && (
          <div style={{
            background: 'rgba(16, 185, 129, 0.15)',
            border: '1px solid rgba(16, 185, 129, 0.4)',
            color: '#6ee7b7',
            padding: '16px',
            borderRadius: '8px',
            marginBottom: '24px',
            fontSize: '0.95rem'
          }}>
            <div style={{ fontWeight: 600, marginBottom: '6px' }}>✓ Success</div>
            <div>{success}</div>

            <div style={{ marginTop: '16px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={handleAutoProcess}
                disabled={extracting}
                className="cyber-btn-primary"
                style={{ fontSize: '0.9rem', padding: '8px 16px' }}
              >
                {extracting ? 'Extracting & Linking Graph...' : '⚡ Extract Entities & View Graph'}
              </button>
              <button
                type="button"
                onClick={() => navigate('/graph')}
                className="cyber-btn-secondary"
                style={{ fontSize: '0.9rem', padding: '8px 16px' }}
              >
                Go to Graph Viewer →
              </button>
            </div>
          </div>
        )}

        <div className="cyber-card">
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
            {/* Title Input */}
            <div>
              <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, color: '#e2e8f0', marginBottom: '8px' }}>
                Report Dossier Title <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g. APT29 Cobalt Strike Campaign Report 2026"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  borderRadius: '8px',
                  background: '#1e293b',
                  border: '1px solid #334155',
                  color: '#f8fafc',
                  fontSize: '0.95rem'
                }}
              />
            </div>

            {/* File Upload Zone */}
            <div>
              <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, color: '#e2e8f0', marginBottom: '8px' }}>
                Upload PDF Report <span style={{ color: '#ef4444' }}>*</span>
              </label>

              <div style={{
                border: '2px dashed #334155',
                borderRadius: '10px',
                padding: '36px 20px',
                textAlign: 'center',
                backgroundColor: 'rgba(30, 41, 59, 0.4)',
                cursor: 'pointer',
                position: 'relative',
                transition: 'all 0.2s'
              }}>
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  required
                  onChange={handleFileChange}
                  style={{
                    position: 'absolute',
                    inset: 0,
                    opacity: 0,
                    cursor: 'pointer',
                    width: '100%',
                    height: '100%'
                  }}
                />

                <div style={{
                  width: '50px',
                  height: '50px',
                  borderRadius: '12px',
                  background: 'rgba(6, 182, 212, 0.15)',
                  color: '#06b6d4',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '12px'
                }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                </div>

                {file ? (
                  <div>
                    <p style={{ fontWeight: 600, color: '#38bdf8', fontSize: '1rem' }}>
                      {file.name}
                    </p>
                    <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginTop: '4px' }}>
                      {(file.size / 1024 / 1024).toFixed(2)} MB • Ready to upload
                    </p>
                  </div>
                ) : (
                  <div>
                    <p style={{ fontWeight: 600, color: '#f1f5f9', fontSize: '0.95rem' }}>
                      Click or drag and drop threat PDF here
                    </p>
                    <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginTop: '4px' }}>
                      PDF documents up to 10 MB accepted
                    </p>
                  </div>
                )}
              </div>
            </div>

            <button
              type="submit"
              disabled={uploading || !file}
              className="cyber-btn-primary"
              style={{
                width: '100%',
                padding: '14px',
                fontSize: '1rem',
                marginTop: '10px'
              }}
            >
              {uploading ? 'Parsing & Uploading PDF...' : 'Upload & Ingest Report'}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
