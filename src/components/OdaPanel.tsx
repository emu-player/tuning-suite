'use client';
import { useSession } from '@/lib/store';
import { ShieldCheck, ShieldAlert, Layers } from 'lucide-react';

export default function OdaPanel() {
  const { odaViolations, status, maps } = useSession();
  const hasData = status === 'ready';

  return (
    <div className="flex-1 overflow-y-auto p-8 bg-brand-base">
      <div className="max-w-4xl mx-auto flex flex-col gap-6">
        <div>
          <h2 className="text-xl font-black text-brand-primary tracking-wider">ODA GUARD (OVERLAPPING DATA AREA)</h2>
          <p className="text-xs text-brand-secondary/80 mt-1 leading-relaxed">
            Il software analizza la segmentazione esadecimale e previene la sovrascrittura di blocchi comuni.
            Mappe sovrapposte o assi condivisi non conformi vengono bloccati prima della scrittura reale sul binario.
          </p>
        </div>

        {/* Status indicator */}
        <div className={`border rounded-xl p-5 flex items-center gap-5 backdrop-blur-md transition-all duration-300 ${
          hasData && odaViolations.length === 0
            ? 'bg-brand-ok/10 border-brand-ok/30 text-brand-ok shadow-[0_4px_15px_rgba(16,185,129,0.05)]'
            : !hasData 
              ? 'bg-brand-surface border-brand-border text-brand-secondary'
              : 'bg-brand-err/10 border-brand-err/30 text-brand-err'
        }`}>
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
            hasData && odaViolations.length === 0 ? 'bg-brand-ok/20' : !hasData ? 'bg-brand-elevated' : 'bg-brand-err/20'
          }`}>
            {hasData && odaViolations.length === 0 ? <ShieldCheck size={28} /> : <ShieldAlert size={28} />}
          </div>
          <div>
            <div className="text-sm font-black tracking-wider uppercase">
              {!hasData ? 'ATTESA FILE ORIGINALE' : odaViolations.length === 0 ? 'MEMORIA SICURA - NESSUN CONFLITTO ✓' : `${odaViolations.length} CONFLITTI DI MEMORIA TROVATI`}
            </div>
            <p className="text-xs text-brand-secondary/80 mt-0.5">
              {!hasData 
                ? 'Carica un binario originale centralina per avviare il monitor ODA.' 
                : odaViolations.length === 0 
                  ? 'Il compilatore ha scansionato gli offset. Le aree dei dati fisici sono isolate.'
                  : 'Rilevato incrocio dati tra tabelle adiacenti. Rischio corruzione.'}
            </p>
          </div>
        </div>

        {/* Registro segmenti centralina */}
        {hasData && (
          <div className="bg-brand-surface border border-brand-border rounded-xl overflow-hidden shadow-[0_8px_24px_rgba(0,0,0,0.5)]">
            <div className="grid grid-cols-[1fr_120px_120px] gap-4 px-6 py-4 bg-brand-surface/60 border-b border-brand-border text-[10px] font-bold text-brand-secondary/50 uppercase tracking-widest">
              <span>MAPPATURA IDENTIFICATA</span>
              <span>DIMENSIONI</span>
              <span className="text-right">STATO CANALE</span>
            </div>

            <div className="divide-y divide-brand-border">
              {maps.map((m, i) => (
                <div key={m.mapId} className="grid grid-cols-[1fr_120px_120px] gap-4 px-6 py-4 items-center">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-brand-accent-glow flex items-center justify-center text-brand-accent">
                      <Layers size={14} />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-brand-primary">{m.label}</div>
                      <div className="font-mono text-[9px] text-brand-accent mt-0.5">{m.unit}</div>
                    </div>
                  </div>
                  <span className="font-mono text-[10px] font-semibold text-brand-secondary">{m.rows} riga × {m.cols} col</span>
                  <div className="text-right">
                    <span className="text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded border bg-brand-ok/10 border-brand-ok/30 text-brand-ok">
                      PROTEGGIBILE
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
