'use client';

import { useSession } from '@/lib/store';
import { ShieldCheck, ShieldAlert, Layers } from 'lucide-react';

export default function OdaPanel() {
  const { odaViolations, status, maps } = useSession();
  const hasData = status === 'ready';

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-8 bg-brand-base select-none scroll-smooth">
      <div className="max-w-4xl mx-auto flex flex-col gap-6">
        
        {/* Intestazione del Pannello */}
        <div className="flex flex-col gap-1.5 border-b border-brand-border/60 pb-6">
          <div className="flex items-center gap-2">
            <span className="flex h-1.5 w-1.5 rounded-full bg-brand-accent animate-pulse shrink-0" />
            <h2 className="text-xl font-black text-brand-primary tracking-wider uppercase">
              ODA GUARD (OVERLAPPING DATA AREA)
            </h2>
          </div>
          <p className="text-xs text-brand-secondary/80 leading-relaxed max-w-3xl">
            Il software analizza la segmentazione esadecimale e previene la sovrascrittura di blocchi comuni.
            Mappe sovrapposte o assi condivisi non conformi vengono bloccati prima della scrittura reale sul binario.
          </p>
        </div>

        {/* Indicatore di Stato Diagnostica (Status Banner) */}
        <div className={`relative border rounded-xl p-5 flex flex-col sm:flex-row sm:items-center gap-5 backdrop-blur-md transition-all duration-300 overflow-hidden group ${
          hasData && odaViolations.length === 0
            ? 'bg-brand-ok/5 border-brand-ok/25 text-brand-ok shadow-[0_4px_20px_rgba(16,185,129,0.03)]'
            : !hasData 
              ? 'bg-brand-surface/40 border-brand-border/80 text-brand-secondary'
              : 'bg-brand-err/5 border-brand-err/25 text-brand-err shadow-[0_4px_20px_rgba(239,68,68,0.03)]'
        }`}>
          {/* Sofisticato effetto radiale luminoso sullo sfondo */}
          <div className={`absolute -right-12 -top-12 w-28 h-28 rounded-full filter blur-3xl opacity-15 transition-opacity duration-300 group-hover:opacity-25 ${
            hasData && odaViolations.length === 0 ? 'bg-brand-ok' : !hasData ? 'bg-brand-secondary/35' : 'bg-brand-err'
          }`} />

          {/* Icona Stato */}
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 border transition-all duration-300 ${
            hasData && odaViolations.length === 0 
              ? 'bg-brand-ok/10 border-brand-ok/20 text-brand-ok' 
              : !hasData 
                ? 'bg-brand-elevated border-brand-border/50 text-brand-secondary/50' 
                : 'bg-brand-err/10 border-brand-err/20 text-brand-err'
          }`}>
            {hasData && odaViolations.length === 0 ? (
              <ShieldCheck className="w-6 h-6 animate-pulse" />
            ) : (
              <ShieldAlert className="w-6 h-6" />
            )}
          </div>

          {/* Testo Stato */}
          <div className="flex-1 min-w-0 z-10">
            <div className="text-xs font-black tracking-widest uppercase">
              {!hasData ? 'ATTESA FILE ORIGINALE' : odaViolations.length === 0 ? 'MEMORIA SICURA - NESSUN CONFLITTO ✓' : `${odaViolations.length} CONFLITTI DI MEMORIA TROVATI`}
            </div>
            <p className="text-xs text-brand-secondary/70 mt-1 leading-normal">
              {!hasData 
                ? 'Carica un binario originale centralina per avviare il monitor ODA.' 
                : odaViolations.length === 0 
                  ? 'Il compilatore ha scansionato gli offset. Le aree dei dati fisici sono isolate.'
                  : 'Rilevato incrocio dati tra tabelle adiacenti. Rischio corruzione.'}
            </p>
          </div>
        </div>

        {/* Registro segmenti centralina (Attivo dopo il caricamento dati) */}
        {hasData ? (
          <div className="bg-brand-surface border border-brand-border/80 rounded-xl overflow-hidden shadow-[0_12px_32px_rgba(0,0,0,0.35)]">
            
            {/* Contenitore orizzontale protettivo per schermi piccoli */}
            <div className="w-full overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <div className="min-w-[600px] divide-y divide-brand-border">
                
                {/* Header Tabella */}
                <div className="grid grid-cols-[1fr_140px_110px] gap-4 px-6 py-4 bg-brand-surface/70 text-[10px] font-bold text-brand-secondary/50 uppercase tracking-widest select-none">
                  <span>MAPPATURA IDENTIFICATA</span>
                  <span>DIMENSIONI</span>
                  <span className="text-right">STATO CANALE</span>
                </div>

                {/* Righe Tabella */}
                <div className="divide-y divide-brand-border/60">
                  {maps.map((m) => (
                    <div 
                      key={m.mapId} 
                      className="grid grid-cols-[1fr_140px_110px] gap-4 px-6 py-4 items-center transition-colors duration-150 hover:bg-brand-elevated/20"
                    >
                      {/* Nome Mappa */}
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-brand-accent-glow flex items-center justify-center text-brand-accent border border-brand-accent/5 shrink-0 shadow-[0_2px_8px_rgba(249,87,22,0.08)]">
                          <Layers size={13} />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-brand-primary truncate" title={m.label}>
                            {m.label}
                          </div>
                          <div className="font-mono text-[9px] text-brand-accent mt-0.5 font-bold tracking-wider uppercase">
                            {m.unit}
                          </div>
                        </div>
                      </div>

                      {/* Dimensioni geometriche della mappa */}
                      <span className="font-mono text-[10px] font-semibold text-brand-secondary/90 bg-brand-elevated/40 border border-brand-border/30 px-2 py-1 rounded w-fit select-none">
                        {m.rows} riga × {m.cols} col
                      </span>

                      {/* Stato del canale */}
                      <div className="text-right select-none">
                        <span className="text-[8px] font-black uppercase tracking-widest px-2.5 py-1 rounded border bg-brand-ok/10 border-brand-ok/25 text-brand-ok shadow-[0_2px_8px_rgba(16,185,129,0.03)]">
                          PROTEGGIBILE
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

              </div>
            </div>

          </div>
        ) : (
          /* Stato di Attesa (Placeholder decorativo se !hasData) */
          <div className="border border-dashed border-brand-border/60 rounded-xl p-12 flex flex-col items-center justify-center text-center bg-brand-surface/20 select-none">
            <div className="w-12 h-12 rounded-xl bg-brand-elevated flex items-center justify-center border border-brand-border mb-4 text-brand-secondary/40">
              <Layers size={18} className="animate-pulse" />
            </div>
            <h3 className="text-xs font-bold text-brand-primary tracking-wider uppercase">Nessuna mappatura rilevata</h3>
            <p className="text-xs text-brand-secondary/60 mt-1 max-w-sm leading-relaxed">
              Il registro delle celle esadecimali e lo stato dei singoli canali di memoria verranno caricati automaticamente all'analisi del binario originale.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}