'use client';

import { useSession } from '@/lib/store';

export default function MapSelector() {
  const { maps, activeMapId, setActiveMap, pendingDeltas } = useSession();

  if (!maps || maps.length === 0) return null;

  return (
    <nav 
      aria-label="Selettore mappe integrato"
      className="relative w-full border-b border-brand-border bg-brand-surface/40 backdrop-blur-md select-none"
    >
      {/* Indicatori sfumati premium per lo scorrimento orizzontale su schermi ridotti */}
      <div className="absolute left-0 top-0 bottom-0 w-6 bg-gradient-to-r from-brand-surface/60 to-transparent pointer-events-none z-10" />
      <div className="absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-brand-surface/60 to-transparent pointer-events-none z-10" />

      <div 
        role="tablist"
        className="flex items-center gap-2.5 px-6 py-3.5 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden scroll-smooth snap-x"
      >
        {/* Etichetta di Sezione con Icona Identificativa */}
        <div className="flex items-center gap-2 mr-3 shrink-0">
          <svg 
            className="w-3.5 h-3.5 text-brand-secondary/40" 
            fill="none" 
            viewBox="0 0 24 24" 
            stroke="currentColor"
            strokeWidth={2.5}
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
          </svg>
          <span className="text-[10px] font-bold text-brand-secondary/50 tracking-wider uppercase">
            MAP PACK INTEGRATO:
          </span>
        </div>

        {/* Lista dinamica delle Mappe */}
        {maps.map((m) => {
          const isActive = activeMapId === m.mapId;
          
          // Verifica sicura delle modifiche pendenti (array-based o key-value map)
          const hasPending = !!(
            pendingDeltas && (
              Array.isArray(pendingDeltas) 
                ? pendingDeltas.some((d: any) => d?.mapId === m.mapId || d?.map === m.mapId) 
                : typeof pendingDeltas === 'object' 
                  ? (pendingDeltas[m.mapId] || Object.keys(pendingDeltas).includes(m.mapId))
                  : false
            )
          );

          return (
            <button
              key={m.mapId}
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveMap(m.mapId)}
              className={`
                flex items-center gap-2.5 px-4 py-2 rounded-lg border text-xs font-semibold 
                cursor-pointer transition-all duration-200 ease-out shrink-0 outline-none snap-align-none
                active:scale-[0.97] 
                focus-visible:ring-2 focus-visible:ring-brand-accent/50 focus-visible:ring-offset-2 focus-visible:ring-offset-brand-surface
                ${
                  isActive 
                    ? 'bg-gradient-to-r from-brand-accent to-brand-accent/90 border-brand-accent text-white shadow-[0_4px_12px_rgba(249,87,22,0.35)] font-bold' 
                    : 'bg-brand-surface border-brand-border text-brand-secondary hover:border-brand-border-bright hover:text-brand-primary hover:bg-brand-surface/80 hover:shadow-sm hover:-translate-y-[0.5px]'
                }
              `}
            >
              {/* Indicatore visivo per le modifiche pendenti (es. celle modificate non salvate) */}
              {hasPending && (
                <span className="relative flex h-2 w-2 shrink-0" title="Modifiche pendenti">
                  <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isActive ? 'bg-white' : 'bg-brand-accent'}`}></span>
                  <span className={`relative inline-flex rounded-full h-2 w-2 ${isActive ? 'bg-white' : 'bg-brand-accent'}`}></span>
                </span>
              )}

              {/* Label della mappa con troncamento intelligente per schermi piccoli */}
              <span className="truncate max-w-[130px] sm:max-w-[200px] md:max-w-none">
                {m.label}
              </span>

              {/* Badge dell'unità di misura (es. hPa, Nm, km/h) */}
              <span 
                className={`
                  font-mono text-[9px] px-1.5 py-0.5 rounded leading-none font-bold tracking-wider shrink-0 transition-colors duration-200
                  ${
                    isActive 
                      ? 'bg-white/20 text-white backdrop-blur-sm' 
                      : 'bg-brand-elevated text-brand-accent border border-brand-accent/5'
                  }
                `}
              >
                {m.unit}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}