import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import api from '../services/api';

export default function Dashboard() {
  const navigate = useNavigate();
  const [documents, setDocuments] = useState([]);
  const [stats, setStats] = useState({
    totalDocs: 0,
    totalEntities: 0,
    totalRelationships: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    setLoading(true);
    setError('');
    try {
      // 1. Fetch user's uploaded documents
      const docsRes = await api.get('/documents');
      const docs = docsRes.data.documents || [];
      setDocuments(docs);

      let entitiesCount = 0;
      let relationshipsCount = 0;

      // 2. Sample or aggregate entities & relationships for recent docs
      await Promise.all(
        docs.slice(0, 10).map(async (doc) => {
          try {
            const [eRes, rRes] = await Promise.allSettled([
              api.get(`/entities/${doc._id}`),
              api.get(`/relationships/${doc._id}`),
            ]);
            if (eRes.status === 'fulfilled' && eRes.value.data?.count) {
              entitiesCount += eRes.value.data.count;
            }
            if (rRes.status === 'fulfilled' && rRes.value.data?.count) {
              relationshipsCount += rRes.value.data.count;
            }
          } catch (err) {
            // Ignore per-doc error
          }
        })
      );

      setStats({
        totalDocs: docs.length,
        totalEntities: entitiesCount,
        totalRelationships: relationshipsCount,
      });
    } catch (err) {
      console.error('Error fetching dashboard stats:', err);
      setError('Unable to load documents from backend');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Navbar />

      <main style={{ flex: 1, padding: '32px', maxWidth: '1300px', margin: '0 auto', width: '100%' }}>
        {/* Header section */}
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '20px',
          marginBottom: '32px'
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <span style={{
                display: 'inline-block',
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: '#10b981',
                boxShadow: '0 0 8px #10b981'
              }} />
              <span style={{
                fontSize: '0.8rem',
                fontFamily: 'var(--font-mono)',
                color: '#10b981',
                textTransform: 'uppercase',
                letterSpacing: '1px'
              }}>
                SOC Monitoring Active
              </span>
            </div>
            <h1 style={{ fontSize: '2rem', fontWeight: 800, color: '#f8fafc', margin: 0 }}>
              Threat Intelligence Command Center
            </h1>
            <p style={{ color: '#94a3b8', fontSize: '0.95rem', marginTop: '4px' }}>
              Automated cyber document analysis, entity extraction, and relationship knowledge graphs
            </p>
          </div>

          {/* Quick Action Buttons */}
          <div style={{ display: 'flex', gap: '14px' }}>
            <button
              onClick={() => navigate('/upload')}
              className="cyber-btn-primary"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              Upload Report
            </button>

            <button
              onClick={() => navigate('/graph')}
              className="cyber-btn-secondary"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="6" cy="6" r="3" />
                <circle cx="18" cy="18" r="3" />
                <circle cx="18" cy="6" r="3" />
                <line x1="8.5" y1="7.5" x2="15.5" y2="16.5" />
                <line x1="8.5" y1="6" x2="15.5" y2="6" />
              </svg>
              View Knowledge Graph
            </button>
          </div>
        </div>

        {error && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.4)',
            color: '#fca5a5',
            padding: '12px 16px',
            borderRadius: '8px',
            marginBottom: '24px'
          }}>
            {error}
          </div>
        )}

        {/* 3 Metric Cards */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: '24px',
          marginBottom: '36px'
        }}>
          {/* Total Documents Card */}
          <div className="cyber-card" style={{ position: 'relative', overflow: 'hidden' }}>
            <div style={{
              position: 'absolute',
              top: '-15px',
              right: '-15px',
              width: '90px',
              height: '90px',
              background: 'radial-gradient(circle, rgba(6, 182, 212, 0.2) 0%, transparent 70%)',
              borderRadius: '50%',
              pointerEvents: 'none'
            }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
              <div>
                <p style={{ color: '#94a3b8', fontSize: '0.85rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Total Ingested Reports
                </p>
                <h3 style={{ fontSize: '2.5rem', fontWeight: 800, color: '#f8fafc', marginTop: '6px', fontFamily: 'var(--font-mono)' }}>
                  {loading ? '...' : stats.totalDocs}
                </h3>
              </div>
              <div style={{
                width: '44px',
                height: '44px',
                borderRadius: '10px',
                background: 'rgba(6, 182, 212, 0.15)',
                border: '1px solid rgba(6, 182, 212, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#06b6d4'
              }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                  <polyline points="10 9 9 9 8 9" />
                </svg>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: '#64748b' }}>
              <span style={{ color: '#06b6d4', fontWeight: 600 }}>PDFs Analyzed</span>
              <span>• Stored in Threat Vault</span>
            </div>
          </div>

          {/* Total Entities Card */}
          <div className="cyber-card" style={{ position: 'relative', overflow: 'hidden' }}>
            <div style={{
              position: 'absolute',
              top: '-15px',
              right: '-15px',
              width: '90px',
              height: '90px',
              background: 'radial-gradient(circle, rgba(168, 85, 247, 0.2) 0%, transparent 70%)',
              borderRadius: '50%',
              pointerEvents: 'none'
            }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
              <div>
                <p style={{ color: '#94a3b8', fontSize: '0.85rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Total Extracted Entities
                </p>
                <h3 style={{ fontSize: '2.5rem', fontWeight: 800, color: '#f8fafc', marginTop: '6px', fontFamily: 'var(--font-mono)' }}>
                  {loading ? '...' : stats.totalEntities}
                </h3>
              </div>
              <div style={{
                width: '44px',
                height: '44px',
                borderRadius: '10px',
                background: 'rgba(168, 85, 247, 0.15)',
                border: '1px solid rgba(168, 85, 247, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#c084fc'
              }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2L2 7l10 5 10-5-10-5z" />
                  <path d="M2 17l10 5 10-5" />
                  <path d="M2 12l10 5 10-5" />
                </svg>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: '#64748b' }}>
              <span className="badge-threat-actor" style={{ padding: '1px 6px', borderRadius: '4px', fontSize: '0.7rem' }}>Actors</span>
              <span className="badge-malware" style={{ padding: '1px 6px', borderRadius: '4px', fontSize: '0.7rem' }}>Malware</span>
              <span className="badge-cve" style={{ padding: '1px 6px', borderRadius: '4px', fontSize: '0.7rem' }}>CVEs</span>
              <span className="badge-country" style={{ padding: '1px 6px', borderRadius: '4px', fontSize: '0.7rem' }}>Geo</span>
            </div>
          </div>

          {/* Total Relationships Card */}
          <div className="cyber-card" style={{ position: 'relative', overflow: 'hidden' }}>
            <div style={{
              position: 'absolute',
              top: '-15px',
              right: '-15px',
              width: '90px',
              height: '90px',
              background: 'radial-gradient(circle, rgba(16, 185, 129, 0.2) 0%, transparent 70%)',
              borderRadius: '50%',
              pointerEvents: 'none'
            }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
              <div>
                <p style={{ color: '#94a3b8', fontSize: '0.85rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Total Threat Relationships
                </p>
                <h3 style={{ fontSize: '2.5rem', fontWeight: 800, color: '#f8fafc', marginTop: '6px', fontFamily: 'var(--font-mono)' }}>
                  {loading ? '...' : stats.totalRelationships}
                </h3>
              </div>
              <div style={{
                width: '44px',
                height: '44px',
                borderRadius: '10px',
                background: 'rgba(16, 185, 129, 0.15)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#34d399'
              }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="6" y1="3" x2="6" y2="15" />
                  <circle cx="18" cy="6" r="3" />
                  <circle cx="6" cy="18" r="3" />
                  <path d="M18 9a9 9 0 0 1-9 9" />
                </svg>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: '#64748b' }}>
              <span style={{ color: '#34d399', fontWeight: 600 }}>Graph Edges</span>
              <span>• Exploits / Uses / Targets</span>
            </div>
          </div>
        </div>

        {/* Ingested Documents List */}
        <div className="cyber-card">
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '20px',
            borderBottom: '1px solid #1e293b',
            paddingBottom: '16px'
          }}>
            <div>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#f8fafc' }}>
                Ingested Threat Reports
              </h2>
              <p style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
                PDF intelligence dossiers parsed and available for graph exploration
              </p>
            </div>
            <button
              onClick={fetchDashboardData}
              className="cyber-btn-secondary"
              style={{ padding: '6px 12px', fontSize: '0.85rem' }}
            >
              Refresh
            </button>
          </div>

          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
              Loading threat intelligence reports...
            </div>
          ) : documents.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center' }}>
              <p style={{ color: '#94a3b8', marginBottom: '16px' }}>
                No intelligence reports uploaded yet.
              </p>
              <button
                onClick={() => navigate('/upload')}
                className="cyber-btn-primary"
              >
                Upload First Threat Report
              </button>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #334155', color: '#94a3b8', fontSize: '0.8rem', textTransform: 'uppercase' }}>
                    <th style={{ padding: '12px 16px' }}>Report Title</th>
                    <th style={{ padding: '12px 16px' }}>Document ID</th>
                    <th style={{ padding: '12px 16px' }}>Extracted Chars</th>
                    <th style={{ padding: '12px 16px' }}>Date</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {documents.map((doc) => (
                    <tr 
                      key={doc._id}
                      style={{
                        borderBottom: '1px solid #1e293b',
                        transition: 'background 0.2s',
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                      <td style={{ padding: '14px 16px', fontWeight: 600, color: '#f1f5f9' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span style={{ color: '#06b6d4' }}>📄</span>
                          {doc.title}
                        </div>
                      </td>
                      <td style={{ padding: '14px 16px', fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: '#64748b' }}>
                        {doc._id}
                      </td>
                      <td style={{ padding: '14px 16px', color: '#94a3b8' }}>
                        {doc.extractedText ? `${doc.extractedText.length.toLocaleString()} chars` : '0'}
                      </td>
                      <td style={{ padding: '14px 16px', color: '#94a3b8', fontSize: '0.85rem' }}>
                        {new Date(doc.createdAt).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric'
                        })}
                      </td>
                      <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                        <button
                          onClick={() => {
                            localStorage.setItem('selectedDocumentId', doc._id);
                            navigate('/graph');
                          }}
                          className="cyber-btn-secondary"
                          style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                        >
                          View Graph →
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
