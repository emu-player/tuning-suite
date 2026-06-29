'use client';
import { useSession } from '@/lib/store';
import { useRef, useState } from 'react';

export default function Toolbar() {
  const { status, checksumOk, loadFile, reset, addLog } = useSession();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const driverInputRef = useRef<HTMLInputElement | null>(null);

  const [pendingBin, setPendingBin] = useState<File | null>(null);
  const [driverFile, setDriverFile] = useState<File | null>(null);

  const handleBinSelection = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPendingBin(file);
      addLog(`[FILE] Selezionato binario: ${file.name}. Pronto per il caricamento.`);
    }
  };

  const handleDriverSelection = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setDriverFile(file);
      addLog(`[DRIVER] Selezionato driver di calibrazione: ${file.name}`);
    }
  };

  const executeLoad = async () => {
    if (!pendingBin) {
      addLog('[WARNING] Seleziona prima un file binario (.bin).');
      return;
    }
    await loadFile(pendingBin, 'GENERIC', driverFile || undefined);
  };

  const downloadSandboxFile = () => {
    addLog('[SYSTEM] Richiesta sandbox originale in corso...');
    window.location.href = '/api/generate-sandbox';
  };

  const statusColor = status === 'ready' ? '#22c55e' : status === 'parsing' ? '#f59e0b' : '#64748b';

  return (
    <div className="tbar-container">
      {/* Blocco CSS Iniettato per mantenere il componente isolato e trasparente */}
      <style>{`
        .tbar-container {
          height: 60px;
          background: var(--bg-surface);
          border-bottom: 1px solid var(--border);
          display: flex;
          align-items: center;
          padding: 0 20px;
          gap: 12px;
          flex-shrink: 0;
          width: 100%;
          box-sizing: border-box;
          overflow-x: auto;
          scrollbar-width: none; /* Firefox */
        }
        .tbar-container::-webkit-scrollbar {
          display: none; /* Chrome, Safari, Opera */
        }
        .tbar-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: var(--bg-elevated);
          color: var(--text-primary);
          border: 1px solid var(--border-bright);
          border-radius: 6px;
          padding: 6px 14px;
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1);
          white-space: nowrap;
          user-select: none;
        }
        .tbar-btn:hover {
          background: var(--border);
          border-color: var(--border-bright);
          transform: translateY(-0.5px);
        }
        .tbar-btn:active {
          transform: translateY(0.5px);
        }
        .tbar-btn-bin-empty {
          background: rgba(249, 87, 22, 0.05);
          color: var(--accent);
          border: 1px solid rgba(249, 87, 22, 0.2);
        }
        .tbar-btn-bin-empty:hover {
          background: rgba(249, 87, 22, 0.1);
          border-color: rgba(249, 87, 22, 0.4);
        }
        .tbar-btn-bin-filled {
          background: rgba(34, 197, 94, 0.05);
          color: #22c55e;
          border: 1px solid rgba(34, 197, 94, 0.2);
        }
        .tbar-btn-bin-filled:hover {
          background: rgba(34, 197, 94, 0.1);
          border-color: rgba(34, 197, 94, 0.4);
        }
        .tbar-btn-driver-empty {
          background: rgba(0, 240, 255, 0.05);
          color: var(--cyan);
          border: 1px solid rgba(0, 240, 255, 0.2);
        }
        .tbar-btn-driver-empty:hover {
          background: rgba(0, 240, 255, 0.1);
          border-color: rgba(0, 240, 255, 0.4);
        }
        .tbar-btn-driver-filled {
          background: rgba(0, 240, 255, 0.05);
          color: var(--cyan);
          border: 1px solid rgba(0, 240, 255, 0.2);
        }
        .tbar-btn-driver-filled:hover {
          background: rgba(0, 240, 255, 0.1);
          border-color: rgba(0, 240, 255, 0.4);
        }
        .tbar-btn-accent {
          background: var(--accent);
          color: #fff;
          border: 1px solid transparent;
          font-weight: 700;
        }
        .tbar-btn-accent:hover:not(:disabled) {
          background: var(--accent);
          opacity: 0.95;
          box-shadow: 0 0 12px rgba(249, 87, 22, 0.25);
        }
        .tbar-btn-accent:disabled {
          background: var(--bg-elevated);
          color: var(--text-muted);
          cursor: not-allowed;
          border: 1px solid var(--border);
        }
        .tbar-btn-cancel {
          background: transparent;
          color: var(--text-muted);
          border: 1px solid var(--border);
        }
        .tbar-btn-cancel:hover {
          color: var(--text-primary);
          border-color: var(--border-bright);
        }
        .tbar-divider {
          width: 1px;
          height: 20px;
          background: var(--border);
          flex-shrink: 0;
        }
        .tbar-filename-text {
          max-width: 150px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          display: inline-block;
          vertical-align: middle;
        }
        .tbar-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          border-radius: 4px;
          padding: 4px 10px;
          font-size: 10px;
          font-family: var(--font-mono);
          font-weight: 600;
          white-space: nowrap;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .tbar-badge-ok {
          background: rgba(34, 197, 94, 0.06);
          border: 1px solid rgba(34, 197, 94, 0.25);
          color: #22c55e;
        }
        .tbar-badge-err {
          background: rgba(239, 68, 68, 0.06);
          border: 1px solid rgba(239, 68, 68, 0.25);
          color: #ef4444;
        }
        .tbar-status-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          position: relative;
          flex-shrink: 0;
        }
        .tbar-status-dot-pulse {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          border-radius: 50%;
          animation: tbar-pulse 2s infinite ease-in-out;
        }
        @keyframes tbar-pulse {
          0% { transform: scale(1); opacity: 0.8; }
          50% { transform: scale(2.4); opacity: 0; }
          100% { transform: scale(1); opacity: 0; }
        }
      `}</style>

      {/* Generatore Sandbox */}
      <button onClick={downloadSandboxFile} className="tbar-btn">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        <span>Sandbox Originale</span>
      </button>

      <div className="tbar-divider" />

      {/* Input File Binario */}
      <input type="file" ref={fileInputRef} onChange={handleBinSelection} accept=".bin" style={{ display: 'none' }} />
      <button
        onClick={() => fileInputRef.current?.click()}
        className={`tbar-btn ${pendingBin ? 'tbar-btn-bin-filled' : 'tbar-btn-bin-empty'}`}
      >
        {pendingBin ? (
          <>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span className="tbar-filename-text">BIN: {pendingBin.name}</span>
          </>
        ) : (
          <>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="12" y1="18" x2="12" y2="12" />
              <polyline points="9 15 12 12 15 15" />
            </svg>
            <span>Seleziona File .bin</span>
          </>
        )}
      </button>

      {/* Input File Driver */}
      <input type="file" ref={driverInputRef} onChange={handleDriverSelection} accept=".xdf,.a2l" style={{ display: 'none' }} />
      <button
        onClick={() => driverInputRef.current?.click()}
        className={`tbar-btn ${driverFile ? 'tbar-btn-driver-filled' : 'tbar-btn-driver-empty'}`}
      >
        {driverFile ? (
          <>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span className="tbar-filename-text">DRIVER: {driverFile.name}</span>
          </>
        ) : (
          <>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <line x1="9" y1="3" x2="9" y2="21" />
              <line x1="15" y1="3" x2="15" y2="21" />
              <line x1="3" y1="9" x2="21" y2="9" />
              <line x1="3" y1="15" x2="21" y2="15" />
            </svg>
            <span>Carica Driver .XDF / .A2L</span>
          </>
        )}
      </button>

      {pendingBin && (
        <button
          onClick={executeLoad}
          disabled={status === 'parsing'}
          className="tbar-btn tbar-btn-accent"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
          <span>Elabora e Mappa File</span>
        </button>
      )}

      <div className="tbar-divider" />

      <button
        onClick={() => { reset(); setPendingBin(null); setDriverFile(null); }}
        className="tbar-btn tbar-btn-cancel"
      >
        <span>Annulla</span>
      </button>

      <div style={{ flex: 1 }} />

      {/* Stato Checksum Engine */}
      {checksumOk !== null && (
        <div className={`tbar-badge ${checksumOk ? 'tbar-badge-ok' : 'tbar-badge-err'}`}>
          {checksumOk ? (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          )}
          <span>CHECKSUM ENGINE {checksumOk ? 'COMPLIANT' : 'FAILURE'}</span>
        </div>
      )}

      {/* Stato Connessione / Parsing */}
      <div className="tbar-status-container">
        <div className="tbar-status-dot" style={{ background: statusColor }}>
          {(status === 'ready' || status === 'parsing') && (
            <div className="tbar-status-dot-pulse" style={{ background: statusColor }} />
          )}
        </div>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.03em' }}>
          {status}
        </span>
      </div>
    </div>
  );
}