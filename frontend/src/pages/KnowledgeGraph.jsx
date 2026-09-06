import { useState, useEffect, useCallback, useMemo } from 'react';
import ReactFlow, {
  Controls,
  Background,
  MiniMap,
  useNodesState,
  useEdgesState,
  MarkerType,
  Handle,
  Position,
} from 'reactflow';
import 'reactflow/dist/style.css';
import Navbar from '../components/Navbar';
import api from '../services/api';

// Hardcoded documentId variable as required by project specification
const HARDCODED_DOCUMENT_ID = '6a9d0c13285653a498ac590e';

// Entity Styling configurations
const ENTITY_CONFIGS = {
  ThreatActor: {
    color: '#ef4444',
    bg: 'rgba(239, 68, 68, 0.12)',
    border: 'rgba(239, 68, 68, 0.4)',
    glow: 'rgba(239, 68, 68, 0.3)',
    icon: '☠️',
    label: 'THREAT ACTOR',
  },
  Malware: {
    color: '#f97316',
    bg: 'rgba(249, 115, 22, 0.12)',
    border: 'rgba(249, 115, 22, 0.4)',
    glow: 'rgba(249, 115, 22, 0.3)',
    icon: '🦠',
    label: 'MALWARE',
  },
  CVE: {
    color: '#06b6d4',
    bg: 'rgba(6, 182, 212, 0.12)',
    border: 'rgba(6, 182, 212, 0.4)',
    glow: 'rgba(6, 182, 212, 0.3)',
    icon: '🛡️',
    label: 'CVE / VULN',
  },
  Country: {
    color: '#10b981',
    bg: 'rgba(16, 185, 129, 0.12)',
    border: 'rgba(16, 185, 129, 0.4)',
    glow: 'rgba(16, 185, 129, 0.3)',
    icon: '🌐',
    label: 'COUNTRY / TARGET',
  },
};

// Custom Cyber Node Component for React Flow
function CyberNode({ data }) {
  const cfg = ENTITY_CONFIGS[data.type] || {
    color: '#a855f7',
    bg: 'rgba(168, 85, 247, 0.12)',
    border: 'rgba(168, 85, 247, 0.4)',
    glow: 'rgba(168, 85, 247, 0.3)',
    icon: '📌',
    label: data.type || 'ENTITY',
  };

  return (
    <div style={{
      background: '#0f172a',
      border: `1.5px solid ${cfg.border}`,
      borderRadius: '10px',
      padding: '12px 16px',
      minWidth: '180px',
      boxShadow: `0 4px 16px ${cfg.glow}`,
      color: '#f8fafc',
      fontFamily: 'var(--font-sans)',
      position: 'relative'
    }}>
      <Handle
        type="target"
        position={Position.Left}
        style={{ background: cfg.color, width: 8, height: 8 }}
      />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
        <span style={{
          fontSize: '0.68rem',
          fontFamily: 'var(--font-mono)',
          fontWeight: 700,
          color: cfg.color,
          letterSpacing: '0.5px'
        }}>
          {cfg.icon} {cfg.label}
        </span>
      </div>

      <div style={{
        fontWeight: 700,
        fontSize: '0.95rem',
        color: '#ffffff',
        letterSpacing: '0.2px',
        wordBreak: 'break-word'
      }}>
        {data.name || data.label}
      </div>

      <Handle
        type="source"
        position={Position.Right}
        style={{ background: cfg.color, width: 8, height: 8 }}
      />
    </div>
  );
}

export default function KnowledgeGraph() {
  // Use saved documentId or fall back to HARDCODED_DOCUMENT_ID
  const [activeDocId, setActiveDocId] = useState(() => {
    return localStorage.getItem('selectedDocumentId') || HARDCODED_DOCUMENT_ID;
  });

  const [documents, setDocuments] = useState([]);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [error, setError] = useState('');
  const [stats, setStats] = useState({ entityCount: 0, relCount: 0 });

  const nodeTypes = useMemo(() => ({ cyberNode: CyberNode }), []);

  // Fetch document list to allow switching reports
  useEffect(() => {
    api.get('/documents')
      .then((res) => {
        const docs = res.data.documents || [];
        setDocuments(docs);
        // If current activeDocId isn't set, default to first document if available
        if (docs.length > 0 && !localStorage.getItem('selectedDocumentId')) {
          setActiveDocId(docs[0]._id);
        }
      })
      .catch((e) => console.warn('Could not fetch doc list:', e.message));
  }, []);

  // Layout algorithm: Organize entities cleanly by type column
  const calculateLayout = (entities) => {
    const columns = {
      ThreatActor: [],
      Malware: [],
      CVE: [],
      Country: [],
      Other: [],
    };

    entities.forEach((e) => {
      if (columns[e.type]) {
        columns[e.type].push(e);
      } else {
        columns.Other.push(e);
      }
    });

    const activeCols = ['ThreatActor', 'Malware', 'CVE', 'Country', 'Other'].filter(
      (k) => columns[k].length > 0
    );

    const generatedNodes = [];
    const colSpacing = 300;
    const rowSpacing = 110;

    activeCols.forEach((colKey, colIdx) => {
      const items = columns[colKey];
      const startY = Math.max(50, 300 - (items.length * rowSpacing) / 2);

      items.forEach((item, rowIdx) => {
        generatedNodes.push({
          id: item._id,
          type: 'cyberNode',
          position: {
            x: 80 + colIdx * colSpacing,
            y: startY + rowIdx * rowSpacing,
          },
          data: {
            name: item.name,
            type: item.type,
            label: item.name,
          },
        });
      });
    });

    return generatedNodes;
  };

  // Main fetch function for entities and relationships
  const fetchGraphData = useCallback(async (docId) => {
    if (!docId) return;
    setLoading(true);
    setError('');
    setStatusMsg('Loading threat intelligence knowledge graph...');

    try {
      // 1. Fetch Entities & Relationships in parallel
      const [entitiesRes, relationshipsRes] = await Promise.all([
        api.get(`/entities/${docId}`),
        api.get(`/relationships/${docId}`),
      ]);

      const rawEntities = entitiesRes.data.entities || [];
      const rawRelationships = relationshipsRes.data.relationships || [];

      setStats({
        entityCount: rawEntities.length,
        relCount: rawRelationships.length,
      });

      // 2. Convert entities to nodes
      const graphNodes = calculateLayout(rawEntities);

      // 3. Convert relationships to edges
      const graphEdges = rawRelationships.map((rel, index) => {
        const sourceId = rel.source?.id || rel.source?._id || rel.source;
        const targetId = rel.target?.id || rel.target?._id || rel.target;

        const relName = rel.relation || 'relates_to';
        let edgeColor = '#06b6d4'; // cyan default
        if (relName === 'exploits') edgeColor = '#ef4444'; // red for exploit
        if (relName === 'uses') edgeColor = '#f97316';     // orange for malware use
        if (relName === 'targets') edgeColor = '#10b981';  // green for country target

        return {
          id: rel.id || rel._id || `edge-${index}-${sourceId}-${targetId}`,
          source: String(sourceId),
          target: String(targetId),
          label: relName.toUpperCase(),
          animated: true,
          style: {
            stroke: edgeColor,
            strokeWidth: 2,
          },
          labelStyle: {
            fill: '#ffffff',
            fontWeight: 700,
            fontSize: 11,
            fontFamily: 'var(--font-mono)',
          },
          labelBgStyle: {
            fill: '#090d16',
            fillOpacity: 0.9,
            stroke: edgeColor,
            strokeWidth: 1,
          },
          labelBgPadding: [6, 4],
          labelBgBorderRadius: 4,
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: edgeColor,
            width: 16,
            height: 16,
          },
        };
      });

      setNodes(graphNodes);
      setEdges(graphEdges);

      if (rawEntities.length === 0) {
        setStatusMsg('No entities found for this document yet. Click "Extract Entities" below to analyze the report.');
      } else {
        setStatusMsg('');
      }
    } catch (err) {
      console.error('Error loading graph:', err);
      setError(
        err.response?.data?.message || 'Failed to fetch knowledge graph for document ' + docId
      );
    } finally {
      setLoading(false);
    }
  }, [setNodes, setEdges]);

  // Load graph on activeDocId change
  useEffect(() => {
    if (activeDocId) {
      fetchGraphData(activeDocId);
    }
  }, [activeDocId, fetchGraphData]);

  // Run extraction & relationship generation if needed
  const handleRunPipeline = async () => {
    if (!activeDocId) return;
    setLoading(true);
    setError('');
    try {
      setStatusMsg('Extracting CVEs, threat actors, malware & target countries...');
      await api.post(`/entities/extract/${activeDocId}`);

      setStatusMsg('Correlating entities and generating knowledge relationships...');
      await api.post(`/relationships/generate/${activeDocId}`);

      setStatusMsg('Graph updated successfully!');
      fetchGraphData(activeDocId);
    } catch (err) {
      console.error('Pipeline error:', err);
      setError(err.response?.data?.message || 'Failed to run extraction pipeline');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Navbar />

      {/* Control / Toolbar Bar */}
      <div style={{
        background: 'rgba(15, 23, 42, 0.95)',
        borderBottom: '1px solid #1e293b',
        padding: '12px 24px',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '16px'
      }}>
        {/* Document Selector / ID input */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#94a3b8' }}>
            Active Document:
          </label>

          {documents.length > 0 ? (
            <select
              value={activeDocId}
              onChange={(e) => {
                setActiveDocId(e.target.value);
                localStorage.setItem('selectedDocumentId', e.target.value);
              }}
              style={{
                background: '#1e293b',
                color: '#f8fafc',
                border: '1px solid #334155',
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '0.85rem',
                minWidth: '220px'
              }}
            >
              {documents.map((d) => (
                <option key={d._id} value={d._id}>
                  {d.title} ({d._id.slice(-6)})
                </option>
              ))}
              <option value={HARDCODED_DOCUMENT_ID}>
                Hardcoded Default ({HARDCODED_DOCUMENT_ID.slice(-6)})
              </option>
            </select>
          ) : (
            <input
              type="text"
              value={activeDocId}
              onChange={(e) => setActiveDocId(e.target.value)}
              placeholder="Enter Document ID"
              style={{
                background: '#1e293b',
                color: '#f8fafc',
                border: '1px solid #334155',
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '0.85rem',
                width: '240px',
                fontFamily: 'var(--font-mono)'
              }}
            />
          )}

          <button
            onClick={() => fetchGraphData(activeDocId)}
            className="cyber-btn-secondary"
            style={{ padding: '6px 12px', fontSize: '0.8rem' }}
            disabled={loading}
          >
            Reload
          </button>
        </div>

        {/* Legend / Metrics */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem' }}>
            <span style={{ color: '#94a3b8' }}>Nodes:</span>
            <span style={{ color: '#06b6d4', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
              {stats.entityCount}
            </span>
            <span style={{ color: '#94a3b8', marginLeft: '6px' }}>Edges:</span>
            <span style={{ color: '#34d399', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
              {stats.relCount}
            </span>
          </div>

          <div style={{ height: '18px', width: '1px', background: '#334155' }} />

          {/* Color Legend */}
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '0.75rem' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#f87171' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ef4444' }} />
              Threat Actor
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#fb923c' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#f97316' }} />
              Malware
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#38bdf8' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#06b6d4' }} />
              CVE
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#34d399' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981' }} />
              Country
            </span>
          </div>

          <button
            onClick={handleRunPipeline}
            disabled={loading || !activeDocId}
            className="cyber-btn-primary"
            style={{ padding: '6px 14px', fontSize: '0.8rem' }}
          >
            ⚡ Run Extraction Pipeline
          </button>
        </div>
      </div>

      {/* Messages banner */}
      {(error || statusMsg) && (
        <div style={{
          padding: '8px 24px',
          background: error ? 'rgba(239, 68, 68, 0.15)' : 'rgba(6, 182, 212, 0.15)',
          borderBottom: '1px solid ' + (error ? 'rgba(239, 68, 68, 0.3)' : 'rgba(6, 182, 212, 0.3)'),
          color: error ? '#fca5a5' : '#67e8f9',
          fontSize: '0.85rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <span>{error || statusMsg}</span>
          {error && (
            <button
              onClick={() => setError('')}
              style={{ background: 'none', color: '#fca5a5', fontWeight: 'bold' }}
            >
              ✕
            </button>
          )}
        </div>
      )}

      {/* React Flow Container */}
      <div style={{ flex: 1, width: '100%', height: '100%', position: 'relative', background: '#090d16' }}>
        {nodes.length === 0 && !loading && (
          <div style={{
            position: 'absolute',
            zIndex: 10,
            top: '40%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            textAlign: 'center',
            background: 'rgba(15, 23, 42, 0.85)',
            padding: '32px 40px',
            borderRadius: '12px',
            border: '1px solid #334155',
            backdropFilter: 'blur(8px)',
            maxWidth: '500px'
          }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>🕸️</div>
            <h3 style={{ fontSize: '1.2rem', color: '#f8fafc', marginBottom: '8px' }}>
              No Graph Elements Loaded
            </h3>
            <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginBottom: '20px' }}>
              This document does not have extracted entities or relationships generated yet.
            </p>
            <button
              onClick={handleRunPipeline}
              className="cyber-btn-primary"
              style={{ fontSize: '0.9rem' }}
            >
              ⚡ Extract Entities & Build Graph
            </button>
          </div>
        )}

        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.25 }}
        >
          <Background color="#1e293b" gap={24} size={1} />
          <Controls
            style={{
              background: '#0f172a',
              borderColor: '#334155',
              borderRadius: '8px',
              fill: '#94a3b8',
            }}
          />
          <MiniMap
            nodeColor={(node) => {
              const type = node.data?.type;
              if (type === 'ThreatActor') return '#ef4444';
              if (type === 'Malware') return '#f97316';
              if (type === 'CVE') return '#06b6d4';
              if (type === 'Country') return '#10b981';
              return '#a855f7';
            }}
            maskColor="rgba(9, 13, 22, 0.7)"
            style={{
              background: '#0f172a',
              border: '1px solid #334155',
              borderRadius: '8px',
            }}
          />
        </ReactFlow>
      </div>
    </div>
  );
}
