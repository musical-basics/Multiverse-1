import { useEffect, useState } from 'react';
import ReactFlow, { Background, Controls } from 'reactflow';
import 'reactflow/dist/style.css';

const initialNodes = [
  {
    id: 'genesis',
    position: { x: 250, y: 250 },
    data: { label: 'Genesis Node (State 0)' },
  },
];

export default function App() {
  const [status, setStatus] = useState('Connecting...');

  useEffect(() => {
    // Establish WebSocket connection to daemon
    const ws = new WebSocket('ws://localhost:4444/ws');

    ws.onopen = () => setStatus('Connected to Multiverse Daemon ✓');
    ws.onmessage = (event) => console.log('WS Message:', JSON.parse(event.data));
    ws.onclose = () => setStatus('Disconnected');
    ws.onerror = () => setStatus('Connection Error — Daemon offline?');

    return () => ws.close();
  }, []);

  return (
    <div style={{ width: '100vw', height: '100vh', backgroundColor: '#1E1E1E' }}>
      <div
        style={{
          position: 'absolute',
          top: 10,
          left: 10,
          zIndex: 10,
          color: '#4ade80',
          fontFamily: 'monospace',
          fontSize: '13px',
          background: 'rgba(0,0,0,0.5)',
          padding: '6px 12px',
          borderRadius: '6px',
          backdropFilter: 'blur(8px)',
        }}
      >
        Status: {status}
      </div>

      <ReactFlow nodes={initialNodes} edges={[]} fitView>
        <Background color="#555" gap={16} />
        <Controls />
      </ReactFlow>
    </div>
  );
}
