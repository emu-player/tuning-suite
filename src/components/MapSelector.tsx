'use client';
import { useSession } from '@/lib/store';

export default function MapSelector() {
  const { maps, activeMapId, setActiveMap, pendingDeltas } = useSession();

  if (maps.length === 0) return null;

  return (
    <div className="flex gap-2 px-6 py-3 border-b border-brand-border bg-brand-surface/40 backdrop-blur-md overflow-x-auto items-center">
      <span className="text-[10px] font-bold text-brand-secondary/60 tracking-wider mr-2 uppercase">MAP PACK INTEGRATO:</span>
      {maps.map((m) => {
        const isActive = activeMapId === m.mapId;
        return (
          <button
            key={m.mapId}
            onClick={() => setActiveMap(m.mapId)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-xs font-semibold cursor-pointer select-none transition-all duration-200 ${
              isActive 
                ? 'bg-brand-accent border-brand-accent text-white shadow-[0_0_12px_rgba(249,87,22,0.4)]' 
                : 'bg-brand-surface border-brand-border text-brand-secondary hover:border-brand-border-bright hover:text-brand-primary'
            }`}
          >
            <span>{m.label}</span>
            <span className={`font-mono text-[9px] px-1.5 py-0.5 rounded leading-none ${isActive ? 'bg-brand-base/40 text-white' : 'bg-brand-elevated text-brand-accent'}`}>
              {m.unit}
            </span>
          </button>
        );
      })}
    </div>
  );
}
