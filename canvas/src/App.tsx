import { useEffect, useState, useCallback, useRef } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
} from 'reactflow';
import type { Node, Edge } from 'reactflow';
import 'reactflow/dist/style.css';
import CommitNode from './CommitNode';
import { buildGraphElements } from './layout';

const DAEMON_URL = 'http://localhost:4444';
const WS_URL = 'ws://localhost:4444/ws';

const nodeTypes = { commitNode: CommitNode };

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

const STATUS_CONFIG: Record<ConnectionStatus, { label: string; color: string }> = {
  connecting: { label: 'Connecting…', color: '#a78bfa' },
  connected:  { label: 'Connected ✓', color: '#4ade80' },
  disconnected: { label: 'Disconnected', color: '#f59e0b' },
  error:      { label: 'Daemon Offline', color: '#f87171' },
};

export default function App() {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node[]>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge[]>([]);
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const wsRef = useRef<WebSocket | null>(null);

  const applyGraph = useCallback((graphData: { nodes: unknown[] }) => {
    if (!graphData?.nodes) return;
    const { nodes: rfNodes, edges: rfEdges } = buildGraphElements(graphData.nodes as Parameters<typeof buildGraphElements>[0]);
    setNodes(rfNodes);
    setEdges(rfEdges);
  }, [setNodes, setEdges]);

  // Fetch initial graph from REST
  const fetchGraph = useCallback(async () => {
    try {
      const res = await fetch(`${DAEMON_URL}/graph`);
      if (!res.ok) throw new Error('graph fetch failed');
      const data = await res.json();
      applyGraph(data);
    } catch (e) {
      console.warn('Initial graph fetch failed:', e);
    }
  }, [applyGraph]);

  // WebSocket connection
  useEffect(() => {
    let reconnectTimer: ReturnType<typeof setTimeout>;

    function connect() {
      setStatus('connecting');
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        setStatus('connected');
        fetchGraph();
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.event === 'graph_update' || msg.event === 'init') {
            applyGraph(msg.graph);
          }
        } catch { /* ignore */ }
      };

      ws.onclose = () => {
        setStatus('disconnected');
        reconnectTimer = setTimeout(connect, 3000);
      };

      ws.onerror = () => {
        setStatus('error');
        ws.close();
      };
    }

    connect();
    return () => {
      clearTimeout(reconnectTimer);
      wsRef.current?.close();
    };
  }, [fetchGraph, applyGraph]);

  const cfg = STATUS_CONFIG[status];

  return (
    <div style={{ width: '100vw', height: '100vh', background: 'linear-gradient(135deg, #0f0f14 0%, #1a1a24 100%)' }}>
      {/* Status bar */}
      <div
        style={{
          position: 'absolute',
          top: 16,
          left: 16,
          zIndex: 10,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          background: 'rgba(15,15,20,0.8)',
          border: `1px solid ${cfg.color}44`,
          borderRadius: 10,
          padding: '8px 16px',
          backdropFilter: 'blur(12px)',
          fontFamily: '"JetBrains Mono", "Fira Code", monospace',
          fontSize: 12,
          color: cfg.color,
          boxShadow: `0 0 20px ${cfg.color}22`,
        }}
      >
        <span style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: cfg.color,
          boxShadow: `0 0 6px ${cfg.color}`,
          display: 'inline-block',
          animation: status === 'connected' ? 'pulse 2s infinite' : 'none',
        }} />
        Multiverse Daemon — {cfg.label}
      </div>

      {/* Title */}
      <div
        style={{
          position: 'absolute',
          top: 16,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 10,
          fontFamily: '"Inter", sans-serif',
          fontSize: 18,
          fontWeight: 700,
          color: '#f1f5f9',
          letterSpacing: '-0.5px',
          textShadow: '0 0 40px rgba(74,222,128,0.3)',
        }}
      >
        ◈ Multiverse VC
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=JetBrains+Mono&display=swap');
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        .react-flow__background { background: transparent !important; }
        .react-flow__controls { background: rgba(15,15,20,0.85) !important; border: 1px solid #ffffff11 !important; }
        .react-flow__controls button { border: none !important; color: #94a3b8 !important; background: transparent !important; }
        .react-flow__controls button:hover { background: #ffffff10 !important; color: #4ade80 !important; }
        .react-flow__minimap { background: rgba(15,15,20,0.85) !important; border: 1px solid #ffffff11 !important; }
      `}</style>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#2a2a3a" gap={24} size={1} />
        <Controls />
        <MiniMap
          nodeColor={(n) => {
            const s = (n.data as { status?: string })?.status;
            if (s === 'active') return '#4ade80';
            if (s === 'conflicted') return '#facc15';
            return '#475569';
          }}
          maskColor="rgba(15,15,20,0.7)"
        />
      </ReactFlow>
    </div>
  );
}
