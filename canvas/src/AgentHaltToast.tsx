import { useState } from 'react';

interface AgentHaltToastProps {
  onFix: () => void;
  onScrap: () => void;
  onDismiss: () => void;
  error?: string;
}

export default function AgentHaltToast({ onFix, onScrap, onDismiss, error }: AgentHaltToastProps) {
  const [loading, setLoading] = useState<'fix' | 'scrap' | null>(null);

  const handleScrap = async () => {
    setLoading('scrap');
    await onScrap();
    setLoading(null);
  };

  const handleFix = () => {
    setLoading('fix');
    onFix();
    setLoading(null);
  };

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 24,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 100,
        background: 'rgba(20, 16, 24, 0.95)',
        border: '1px solid #f87171',
        borderRadius: 14,
        padding: '16px 22px',
        minWidth: 340,
        boxShadow: '0 0 40px rgba(248,113,113,0.25), 0 8px 32px rgba(0,0,0,0.5)',
        backdropFilter: 'blur(14px)',
        fontFamily: '"Inter", sans-serif',
        animation: 'slideUp 0.25s ease-out',
      }}
    >
      <style>{`
        @keyframes slideUp {
          from { transform: translateX(-50%) translateY(20px); opacity: 0; }
          to   { transform: translateX(-50%) translateY(0);    opacity: 1; }
        }
      `}</style>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <span style={{ fontSize: 18 }}>⚠️</span>
        <span style={{ fontSize: 14, fontWeight: 700, color: '#f87171', letterSpacing: '-0.3px' }}>
          Agent Halted
        </span>
        <button
          onClick={onDismiss}
          style={{
            marginLeft: 'auto',
            background: 'none',
            border: 'none',
            color: '#64748b',
            cursor: 'pointer',
            fontSize: 16,
            lineHeight: 1,
            padding: 2,
          }}
        >×</button>
      </div>

      {/* Error detail */}
      {error && (
        <p style={{ fontSize: 12, color: '#94a3b8', marginBottom: 14, lineHeight: 1.5 }}>
          {error}
        </p>
      )}
      {!error && (
        <p style={{ fontSize: 12, color: '#94a3b8', marginBottom: 14, lineHeight: 1.5 }}>
          The agent left the workspace in a dirty state. Choose how to proceed.
        </p>
      )}

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 10 }}>
        <button
          onClick={handleFix}
          disabled={loading !== null}
          id="multiverse-agent-fix-btn"
          style={{
            flex: 1,
            padding: '9px 0',
            borderRadius: 8,
            border: '1px solid #4ade8044',
            background: 'rgba(74,222,128,0.1)',
            color: '#4ade80',
            fontFamily: '"Inter", sans-serif',
            fontSize: 13,
            fontWeight: 600,
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading && loading !== 'fix' ? 0.5 : 1,
            transition: 'all 0.15s',
          }}
        >
          {loading === 'fix' ? '…' : '🔧 Fix It'}
        </button>

        <button
          onClick={handleScrap}
          disabled={loading !== null}
          id="multiverse-agent-scrap-btn"
          style={{
            flex: 1,
            padding: '9px 0',
            borderRadius: 8,
            border: '1px solid #f8717144',
            background: 'rgba(248,113,113,0.1)',
            color: '#f87171',
            fontFamily: '"Inter", sans-serif',
            fontSize: 13,
            fontWeight: 600,
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading && loading !== 'scrap' ? 0.5 : 1,
            transition: 'all 0.15s',
          }}
        >
          {loading === 'scrap' ? 'Resetting…' : '🗑 Scrap It'}
        </button>
      </div>
    </div>
  );
}
