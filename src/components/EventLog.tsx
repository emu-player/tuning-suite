'use client';

import { useEffect, useRef, useState } from 'react';
import { useSession } from '@/lib/store';

export default function EventLog() {
  const { log } = useSession();
  const ref = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState('');

  // Applica il filtro in tempo reale
  const filteredLog = log.filter((line) => 
    line.toLowerCase().includes(filter.toLowerCase())
  );

  // Auto-scorrimento automatico reattivo al flusso dei dati e al filtro
  useEffect(() => {
    if (ref.current) {
      ref.current.scrollTop = ref.current.scrollHeight;
    }
  }, [filteredLog]);

  function getLineColor(line: string): string {
    if (line.includes('[SYSTEM]')) return 'text-brand-secondary/70';
    if (line.includes('[LOAD]'))   return 'text-brand-cyan';
    if (line.includes('[PARSE]'))  return 'text-brand-ok font-semibold';
    if (line.includes('[CHECKSUM]')) return 'text-brand-ok';
    if (line.includes('[PATCH]') || line.includes('[EDIT]')) return 'text-brand-warn';
    if (line.includes('[TUNING-STAGE1]')) return 'text-brand-accent font-black tracking-wide';
    if (line.includes('[EXPORT]')) return 'text-brand-accent font-semibold';
    if (line.includes('[ERRORE]'))  return 'text-brand-err font-black';
    return 'text-brand-secondary/80';
  }

  return (
    <div className="flex-1 flex flex-col bg-brand-base p-6 overflow-hidden select-none">
      
      {/* Console Terminal Wrapper */}
      <div 
        className="max-w-6xl w-full mx-auto flex-1 flex flex-col bg-[#030507] border border-brand-border/60 rounded-xl shadow-[0_16px_40px_rgba(0,0,0,0.5)] overflow-hidden relative"
        aria-label="Registro eventi centralina"
      >
        
        {/* Terminal Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-brand-surface/80 border-b border-brand-border/40 shrink-0">
          <div className="flex items-center gap-2">
            {/* Indicatori finestra terminale */}
            <span className="w-2.5 h-2.5 rounded-full bg-red-500/80" />
            <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/80" />
            <span className="w-2.5 h-2.5 rounded-full bg-green-500/80" />
            <span className="text-[9px] font-mono font-bold text-brand-secondary/40 tracking-widest ml-2.5 uppercase select-none">
              ECU STREAM LOGGER
            </span>
          </div>

          <div className="flex items-center gap-3.5">
            {/* Filtro di ricerca locale */}
            <div className="relative">
              <input
                type="text"
                placeholder="Filtra log..."
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="bg-brand-elevated/40 border border-brand-border text-[#f0f6fc] rounded-lg px-2.5 py-1 text-[10px] w-40 outline-none font-mono focus:border-brand-accent/60 transition-colors placeholder:text-brand-secondary/40"
              />
            </div>

            {/* Micro Led Streaming */}
            <div className="flex items-center gap-1.5 bg-brand-ok/5 border border-brand-ok/20 px-2.5 py-1 rounded-lg">
              <span className="relative flex h-1.5 w-1.5 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-ok opacity-75"></span>
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-brand-ok"></span>
              </span>
              <span className="text-[8px] font-mono text-brand-ok font-black tracking-widest uppercase">
                STREAMING
              </span>
            </div>
          </div>
        </div>

        {/* Terminal Core Body */}
        <div 
          ref={ref} 
          className="flex-1 overflow-y-auto p-5 font-mono text-[11px] leading-relaxed shadow-inner space-y-1 scroll-smooth"
        >
          {filteredLog.length > 0 ? (
            filteredLog.map((line, i) => (
              <div 
                key={i} 
                className={`group flex gap-4 items-start py-0.5 px-2 rounded hover:bg-white/[0.02] transition-colors ${getLineColor(line)}`}
              >
                {/* Indice numerico della linea di log */}
                <span className="text-brand-secondary/30 select-none text-[9px] w-8 text-right font-medium tracking-wider font-mono shrink-0 group-hover:text-brand-secondary/50 transition-colors">
                  {String(i).padStart(3, '0')}
                </span>
                
                {/* Contenuto stringa log */}
                <span className="flex-1 whitespace-pre-wrap selection:bg-brand-accent/20">
                  {line}
                </span>
              </div>
            ))
          ) : log.length > 0 ? (
            /* Nessun elemento trovato durante la ricerca */
            <div className="h-full flex flex-col items-center justify-center text-center p-8">
              <span className="text-brand-secondary/40 font-mono text-xs">
                Nessun log corrisponde al filtro corrente.
              </span>
            </div>
          ) : (
            /* Stato vuoto originale */
            <div className="h-full flex flex-col items-center justify-center text-center p-8">
              <span className="text-brand-secondary/30 font-mono text-[9px] uppercase tracking-widest animate-pulse">
                -- Terminale Inattivo --
              </span>
            </div>
          )}
          <div className="h-2" />
        </div>

      </div>
    </div>
  );
}