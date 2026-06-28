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

  return (
    <div style={{
      height: 60, background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)',
      display: 'flex', alignItems: 'center', padding: '0 20px', gap: 12, flexShrink: 0,
    }}>
      {/* Generatore Sandbox */}
      <button
        onClick={downloadSandboxFile}
        style={{
          background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border-bright)',
          borderRadius: 7, padding: '6px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
        }}
      >
        📥 Sandbox Originale
      </button>

      <div style={{ width: 1, height: 24, background: 'var(--border)' }} />

      {/* Input File Binario */}
      <input type="file" ref={fileInputRef} onChange={handleBinSelection} accept=".bin" style={{ display: 'none' }} />
      <button
        onClick={() => fileInputRef.current?.click()}
        style={{
          background: pendingBin ? 'var(--bg-elevated)' : 'rgba(249, 87, 22, 0.1)',
          color: pendingBin ? '#22c55e' : 'var(--accent)',
          border: '1px solid var(--border-bright)', borderRadius: 7, padding: '6px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer'
        }}
      >
        {pendingBin ? `✓ BIN: ${pendingBin.name.substring(0, 15)}...` : 'Seleziona File .bin'}
      </button>

      {/* Input File Driver */}
      <input type="file" ref={driverInputRef} onChange={handleDriverSelection} accept=".xdf,.a2l" style={{ display: 'none' }} />
      <button
        onClick={() => driverInputRef.current?.click()}
        style={{
          background: driverFile ? 'var(--bg-elevated)' : 'rgba(0, 240, 255, 0.1)',
          color: driverFile ? 'var(--cyan)' : 'var(--text-secondary)',
          border: '1px solid var(--border-bright)', borderRadius: 7, padding: '6px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer'
        }}
      >
        {driverFile ? `✓ DRIVER: ${driverFile.name.substring(0, 15)}...` : 'Carica Driver .XDF / .A2L'}
      </button>

      {pendingBin && (
        <button
          onClick={executeLoad}
          disabled={status === 'parsing'}
          style={{
            background: 'var(--accent)', color: '#fff', border: 'none',
            borderRadius: 7, padding: '6px 14px', fontSize: 11, fontWeight: 700,
            cursor: status === 'parsing' ? 'not-allowed' : 'pointer',
          }}
        >
          Elabora e Mappa File
        </button>
      )}

      <div style={{ width: 1, height: 24, background: 'var(--border)' }} />

      <button
        onClick={() => { reset(); setPendingBin(null); setDriverFile(null); }}
        style={{
          background: 'transparent', color: 'var(--text-muted)',
          border: '1px solid var(--border)', borderRadius: 7,
          padding: '6px 12px', fontSize: 11, cursor: 'pointer',
        }}
      >
        Annulla
      </button>

      <div style={{ flex: 1 }} />

      {checksumOk !== null && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: checksumOk ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
          border: `1px solid ${checksumOk ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
          borderRadius: 6, padding: '4px 10px', fontSize: 11,
          fontFamily: 'var(--font-mono)', color: checksumOk ? '#22c55e' : '#ef4444',
        }}>
          <span>{checksumOk ? '✓' : '✗'}</span>
          <span>CHECKSUM ENGINE COMPLIANT</span>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-secondary)' }}>
        <div style={{
          width: 7, height: 7, borderRadius: '50%',
          background: status === 'ready' ? '#22c55e' : status === 'parsing' ? '#f59e0b' : '#4a5568',
          boxShadow: status === 'ready' ? '0 0 6px rgba(34,197,94,0.6)' : 'none',
        }} />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase' }}>
          {status}
        </span>
      </div>
    </div>
  );
}
