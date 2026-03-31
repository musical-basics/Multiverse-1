import { useState, useRef, useEffect } from 'react';

interface IntentModalProps {
  sourceNodeId: string;
  sourceHash: string;
  onConfirm: (intent: string) => void;
  onCancel: () => void;
}

export default function IntentModal({ sourceNodeId, sourceHash, onConfirm, onCancel }: IntentModalProps) {
  const [intent, setIntent] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = async () => {
    if (!intent.trim()) return;
    setLoading(true);
    await onConfirm(intent.trim());
    setLoading(false);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(6px)',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div
        style={{
          background: 'rgba(20,18,30,0.97)',
          border: '1px solid #a78bfa44',
          borderRadius: 16,
          padding: '28px 32px',
          width: 420,
          boxShadow: '0 0 60px rgba(167,139,250,0.2), 0 16px 48px rgba(0,0,0,0.6)',
          fontFamily: '"Inter", sans-serif',
        }}
      >
        {/* Header */}
        <div style={{ marginBottom: 6 }}>
          <span style={{ fontSize: 10, letterSpacing: 2, color: '#a78bfa', textTransform: 'uppercase', fontWeight: 700 }}>
            ◈ New Branch
          </span>
        </div>
        <h2 style={{ fontSize: 17, fontWeight: 700, color: '#f1f5f9', marginBottom: 6, letterSpacing: '-0.4px' }}>
          What's your intent?
        </h2>
        <p style={{ fontSize: 12, color: '#64748b', marginBottom: 20, lineHeight: 1.5 }}>
          Branching from <code style={{ color: '#a78bfa', background: '#a78bfa11', padding: '1px 5px', borderRadius: 4 }}>{sourceHash.slice(0, 8)}</code>.
          This becomes your commit message and branch label.
        </p>

        {/* Input */}
        <input
          ref={inputRef}
          value={intent}
          onChange={(e) => setIntent(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); if (e.key === 'Escape') onCancel(); }}
          placeholder='e.g. "Refactor to Tailwind"'
          id="multiverse-intent-input"
          style={{
            width: '100%',
            padding: '11px 14px',
            borderRadius: 9,
            border: '1px solid #a78bfa55',
            background: 'rgba(167,139,250,0.07)',
            color: '#f1f5f9',
            fontSize: 14,
            fontFamily: '"Inter", sans-serif',
            outline: 'none',
            marginBottom: 18,
            boxSizing: 'border-box',
          }}
        />

        {/* Buttons */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            id="multiverse-intent-cancel"
            style={{
              padding: '9px 18px',
              borderRadius: 8,
              border: '1px solid #ffffff11',
              background: 'transparent',
              color: '#64748b',
              fontFamily: '"Inter", sans-serif',
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!intent.trim() || loading}
            id="multiverse-intent-confirm"
            style={{
              padding: '9px 22px',
              borderRadius: 8,
              border: 'none',
              background: intent.trim() ? 'linear-gradient(135deg, #a78bfa, #7c3aed)' : '#374151',
              color: intent.trim() ? '#fff' : '#6b7280',
              fontFamily: '"Inter", sans-serif',
              fontSize: 13,
              fontWeight: 600,
              cursor: intent.trim() && !loading ? 'pointer' : 'not-allowed',
              transition: 'all 0.2s',
              boxShadow: intent.trim() ? '0 0 20px rgba(167,139,250,0.3)' : 'none',
            }}
          >
            {loading ? 'Creating…' : '◈ Create Branch'}
          </button>
        </div>

        {/* Hidden meta for callers */}
        <input type="hidden" id="multiverse-source-node-id" value={sourceNodeId} />
      </div>
    </div>
  );
}
