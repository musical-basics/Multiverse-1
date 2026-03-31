import { memo } from 'react';
import { Handle, Position } from 'reactflow';

interface CommitNodeData {
  label: string;
  intent: string;
  hash: string;
  status: 'active' | 'inactive' | 'conflicted' | 'synth_pending' | 'synth_ok';
  timestamp?: string;
}

const STATUS_COLORS: Record<string, string> = {
  active: '#4ade80',
  inactive: '#94a3b8',
  conflicted: '#facc15',
  synth_pending: '#a78bfa',
  synth_ok: '#4ade80',
};

const CommitNode = memo(({ data }: { data: CommitNodeData }) => {
  const color = STATUS_COLORS[data.status] ?? '#94a3b8';
  const isGenesis = data.hash === 'genesis' || data.label === 'Genesis Node (State 0)';

  return (
    <div
      style={{
        background: 'rgba(30, 30, 40, 0.92)',
        border: `2px solid ${color}`,
        borderRadius: '12px',
        padding: '12px 16px',
        minWidth: '220px',
        maxWidth: '280px',
        boxShadow: `0 0 18px ${color}44`,
        backdropFilter: 'blur(10px)',
        fontFamily: '"Inter", "JetBrains Mono", monospace',
        color: '#e2e8f0',
        position: 'relative',
      }}
    >
      {/* Status dot */}
      <div
        style={{
          position: 'absolute',
          top: 10,
          right: 12,
          width: 10,
          height: 10,
          borderRadius: '50%',
          background: color,
          boxShadow: `0 0 6px ${color}`,
        }}
      />

      {/* Genesis badge */}
      {isGenesis && (
        <div
          style={{
            fontSize: '9px',
            letterSpacing: '1.5px',
            color: color,
            textTransform: 'uppercase',
            marginBottom: 4,
            fontWeight: 700,
          }}
        >
          ◈ GENESIS
        </div>
      )}

      {/* Intent / prompt as main label */}
      <div
        style={{
          fontSize: '13px',
          fontWeight: 600,
          lineHeight: 1.4,
          marginBottom: 8,
          color: '#f1f5f9',
        }}
      >
        {data.intent || data.label}
      </div>

      {/* Hash */}
      <div
        style={{
          fontSize: '11px',
          color: color,
          fontFamily: 'monospace',
          letterSpacing: '0.5px',
        }}
      >
        {data.hash.substring(0, 8)}
      </div>

      {/* Timestamp */}
      {data.timestamp && (
        <div style={{ fontSize: '10px', color: '#64748b', marginTop: 4 }}>
          {new Date(data.timestamp).toLocaleTimeString()}
        </div>
      )}

      <Handle type="target" position={Position.Left} style={{ background: color, border: 'none' }} />
      <Handle type="source" position={Position.Right} style={{ background: color, border: 'none' }} />
    </div>
  );
});

export default CommitNode;
