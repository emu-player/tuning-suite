'use client';

import { useSession } from '@/lib/store';
import type { SessionStatus } from '@/types/calibration';
import { Gauge, ShieldAlert, FileSliders, Terminal, Settings2 } from 'lucide-react';

const NAV = [
  { id: 'maps',      icon: FileSliders, label: 'Map Editor Pro', desc: 'Taratura 2D & 3D' },
  { id: 'checksum',  icon: ShieldAlert, label: 'Checksum Engine', desc: 'Verifica Algoritmi' },
  { id: 'oda',       icon: Settings2,   label: 'ODA Overlaps', desc: 'Guardia Collisioni' },
  { id: 'log',       icon: Terminal,    label: 'Diagnostic Log', desc: 'Console Eventi' },
];

interface Props { active: string; onNav: (id: string) => void; }

export default function Sidebar({ active, onNav }: Props) {
  const { status, ecuFamily, fileName, fileSize } = useSession();

  const statusColors: Record<SessionStatus, { text: string; bg: string; border: string; glow: string }> = {
    ready:   { text: 'text-brand-ok', bg: 'bg-brand-ok/10', border: 'border-brand-ok/30', glow: 'shadow-[0_0_10px_rgba(16,185,129,0.3)]' },
    parsing: { text: 'text-brand-warn', bg: 'bg-brand-warn/10', border: 'border-brand-warn/30', glow: 'shadow-[0_0_10px_rgba(245,158,11,0.3)]' },
    error:   { text: 'text-brand-err', bg: 'bg-brand-err/10', border: 'border-brand-err/30', glow: 'shadow-[0_0_10px_rgba(239,68,68,0.3)]' },
    writing: { text: 'text-brand-accent', bg: 'bg-brand-accent/10', border: 'border-brand-accent/30', glow: 'shadow-[0_0_10px_rgba(249,87,22,0.35)]' },
    idle:    { text: 'text-brand-border-bright', bg: 'bg-brand-elevated', border: 'border-brand-border', glow: '' }
  };

  const currentStatus = statusColors[status];

  return (
    <aside 
      className="w-64 flex-shrink-0 bg-brand-surface border-r border-brand-border flex flex-col h-full bg-carbon relative z-30 select-none"
      aria-label="Navigazione principale suite"
    >
      {/* Intestazione Brand / WinOLS Grade */}
      <div className="p-6 border-b border-brand-border bg-brand-base/40 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-brand-accent rounded-lg flex items-center justify-center text-white shadow-[0_0_15px_var(--color-brand-accent)] transition-all duration-300">
            <Gauge size={20} strokeWidth={2.5} />
          </div>
          <div>
            <span className="font-sans font-black text-sm tracking-widest text-[#f0f6fc] block">TUNING SUITE</span>
            <div className="font-mono text-[9px] text-brand-accent font-semibold tracking-wider">CALIBRATION ENGINE</div>
          </div>
        </div>
      </div>

      {/* Modulo di Diagnostica Stato Centralina (ECU Status) */}
      <div className="px-4 py-4 border-b border-brand-border bg-brand-base/10">
        <div className="bg-brand-elevated/60 backdrop-blur-sm rounded-xl p-3.5 border border-brand-border-bright/80 flex flex-col gap-2.5 shadow-[inset_0_1px_2px_rgba(255,255,255,0.02)]">
          <div className="flex justify-between items-center gap-2">
            <span className="text-[9px] text-brand-secondary/60 font-black tracking-widest uppercase">OBD ECU PROTOCOL</span>
            {/* Badge Stato Dinamico e Coerente */}
            <span className={`text-[8px] font-mono font-black px-2 py-0.5 rounded border tracking-wider transition-colors duration-300 ${currentStatus.bg} ${currentStatus.border} ${currentStatus.text}`}>
              {status.toUpperCase()}
            </span>
          </div>

          <div className={`text-xs font-bold font-mono tracking-wide ${ecuFamily ? 'text-brand-primary' : 'text-brand-secondary/40'}`}>
            {ecuFamily ? `${ecuFamily} CORE` : 'Centralina Assente'}
          </div>

          {fileName && (
            <div className="font-mono text-[9px] text-brand-cyan truncate" title={fileName}>
              {fileName} ({(fileSize ? fileSize/1024 : 0).toFixed(0)}kB)
            </div>
          )}

          {/* Barra LED Diagnostica */}
          <div className="w-full h-1.5 bg-brand-base rounded-full overflow-hidden border border-brand-border-bright mt-1 relative">
            <div 
              className={`h-full rounded-full transition-all duration-700 ${currentStatus.glow} ${
                status === 'idle' 
                  ? 'bg-brand-border-bright w-1/12' 
                  : status === 'parsing' 
                    ? 'bg-brand-warn w-6/12' 
                    : status === 'writing' 
                      ? 'bg-brand-accent w-9/12 animate-pulse' 
                      : 'bg-brand-ok w-full'
              }`} 
            />
          </div>
        </div>
      </div>

      {/* Navigazione Pro */}
      <nav className="flex-1 py-4 px-3 flex flex-col gap-1.5 overflow-y-auto scrollbar-none">
        {NAV.map((item) => {
          const Icon = item.icon;
          const isActive = active === item.id;
          return (
            <button
              key={item.id}
              role="tab"
              aria-selected={isActive}
              onClick={() => onNav(item.id)}
              className={`group flex items-center gap-4 px-4 py-3 rounded-lg border text-left cursor-pointer transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40 ${
                isActive 
                  ? 'bg-brand-accent-glow border-brand-accent/40 text-brand-accent shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)] font-bold' 
                  : 'bg-transparent border-transparent text-brand-secondary hover:bg-brand-elevated/40 hover:text-[#f0f6fc]'
              }`}
            >
              {/* Contenitore Icona */}
              <div className={`transition-transform duration-200 group-hover:scale-110 ${isActive ? 'text-brand-accent' : 'text-brand-secondary group-hover:text-brand-accent'}`}>
                <Icon size={18} strokeWidth={isActive ? 2.5 : 2} />
              </div>
              
              {/* Etichette */}
              <div className="flex-1 min-w-0">
                <div className={`text-xs truncate ${isActive ? 'font-bold' : 'font-medium'}`}>{item.label}</div>
                <div className="text-[9px] text-brand-secondary/60 leading-tight group-hover:text-brand-secondary/80 truncate">{item.desc}</div>
              </div>

              {/* Indicatore Attivo Laterale */}
              {isActive && (
                <div className="w-1 h-3 rounded-full bg-brand-accent shadow-[0_0_8px_var(--color-brand-accent)] shrink-0" />
              )}
            </button>
          );
        })}
      </nav>

      {/* Footer Tecnico */}
      <div className="p-4 border-t border-brand-border bg-brand-base/40 text-[9px] font-mono text-brand-secondary/60 flex flex-col gap-1.5">
        <div className="flex justify-between">
          <span>SW REGISTRY</span> 
          <span className="text-brand-accent font-bold">V2.1-PRO</span>
        </div>
        <div className="flex justify-between">
          <span>CHECKSUM ADDITIVE</span> 
          <span className="text-brand-cyan font-bold">ACTIVE</span>
        </div>

        {/* Avviso Uso Officina Motor Sport Grade */}
        <div className="mt-2 text-center text-[8px] text-brand-err bg-brand-err/5 border border-brand-err/20 rounded-lg py-2 px-1 font-bold tracking-widest uppercase relative overflow-hidden">
          {/* Pattern geometrico di sicurezza diagonale */}
          <div className="absolute inset-0 opacity-[0.03] bg-[repeating-linear-gradient(45deg,transparent,transparent_8px,#ef4444_8px,#ef4444_16px)] pointer-events-none" />
          <span className="relative z-10 animate-pulse flex items-center justify-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-brand-err shrink-0" />
            ATTENZIONE: USO OFFICINA
          </span>
        </div>
      </div>
    </aside>
  );
}