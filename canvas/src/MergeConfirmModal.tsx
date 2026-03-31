interface SynthNodeProps {
  sourceId: string;
  sourceHash: string;
  targetId: string;
  targetHash: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function MergeConfirmModal({
  sourceId: _s,
  sourceHash,
  targetId: _t,
  targetHash,
  onConfirm,
  onCancel,
}: SynthNodeProps) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.65)',
        backdropFilter: 'blur(6px)',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div
        style={{
          background: 'rgba(20,18,30,0.97)',
          border: '1px solid #facc1544',
          borderRadius: 16,
          padding: '28px 32px',
          width: 440,
          boxShadow: '0 0 60px rgba(250,204,21,0.15), 0 16px 48px rgba(0,0,0,0.6)',
          fontFamily: '"Inter", sans-serif',
        }}
      >
        <div style={{ marginBottom: 6 }}>
          <span style={{ fontSize: 10, letterSpacing: 2, color: '#facc15', textTransform: 'uppercase', fontWeight: 700 }}>
            ◈ Synthesis
          </span>
        </div>
        <h2 style={{ fontSize: 17, fontWeight: 700, color: '#f1f5f9', marginBottom: 8, letterSpacing: '-0.4px' }}>
          Merge these timelines?
        </h2>
        <p style={{ fontSize: 12, color: '#64748b', marginBottom: 20, lineHeight: 1.6 }}>
          The Crucible will attempt a deterministic Git merge between:
          <br />
          <code style={{ color: '#4ade80', background: '#4ade8011', padding: '1px 5px', borderRadius: 4 }}>{sourceHash.slice(0, 8)}</code>
          {' '}→{' '}
          <code style={{ color: '#a78bfa', background: '#a78bfa11', padding: '1px 5px', borderRadius: 4 }}>{targetHash.slice(0, 8)}</code>
          <br /><br />
          If conflicts are found, a yellow Synthesis Node will appear for AI-assisted resolution.
        </p>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            style={{
              padding: '9px 18px', borderRadius: 8, border: '1px solid #ffffff11',
              background: 'transparent', color: '#64748b', fontFamily: '"Inter", sans-serif',
              fontSize: 13, cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            id="multiverse-merge-confirm"
            style={{
              padding: '9px 22px', borderRadius: 8, border: 'none',
              background: 'linear-gradient(135deg, #facc15, #f59e0b)',
              color: '#1a1a00', fontFamily: '"Inter", sans-serif',
              fontSize: 13, fontWeight: 700, cursor: 'pointer',
              boxShadow: '0 0 20px rgba(250,204,21,0.3)',
            }}
          >
            ⚗ Begin Synthesis
          </button>
        </div>
      </div>
    </div>
  );
}
