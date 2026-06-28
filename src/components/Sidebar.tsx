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
    <aside className="w-64 flex-shrink-0 bg-brand-surface border-r border-brand-border flex flex-col h-full bg-carbon relative z-30">
      {/* Intestazione Brand / WinOLS Grade */}
      <div className="p-6 border-b border-brand-border bg-brand-base/40 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-brand-accent rounded-lg flex items-center justify-center text-white shadow-[0_0_15px_var(--color-brand-accent)]">
            <Gauge size={20} strokeWidth={2.5} />
          </div>
          <div>
            <span className="font-sans font-black text-sm tracking-widest text-[#f0f6fc]">TUNING SUITE</span>
            <div className="font-mono text-[9px] text-brand-accent font-semibold tracking-wider">CALIBRATION ENGINE</div>
          </div>
        </div>
      </div>

      {/* Modulo di Diagnostica Stato Centralina (ECU Status) */}
      <div style={{ padding: '16px 14px', borderBottom: '1px solid var(--border)' }}>
        <div style={{
          background: 'var(--bg-elevated)', borderRadius: 10, padding: '12px 14px',
          border: '1px solid var(--border-bright)', display: 'flex', flexDirection: 'column', gap: 8,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 9, color: 'var(--text-secondary)', fontWeight: 700, letterSpacing: '0.06em' }}>OBD ECU PROTOCOL</span>
            <span style={{
              fontSize: 8, fontFamily: 'var(--font-mono)', fontWeight: 800, padding: '2px 6px',
              borderRadius: 4, background: status === 'ready' ? 'rgba(16,185,129,0.1)' : 'rgba(249,87,22,0.1)',
              color: status === 'ready' ? 'var(--ok)' : 'var(--warn)', border: `1px solid ${status === 'ready' ? 'rgba(16,185,129,0.2)' : 'rgba(249,87,22,0.2)'}`
            }}>{status.toUpperCase()}</span>
          </div>

          <div style={{ fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-mono)', color: ecuFamily ? 'var(--text-primary)' : 'var(--text-muted)' }}>
            {ecuFamily ? `${ecuFamily} CORE` : 'Centralina Assente'}
          </div>

          {fileName && (
            <div className="font-mono text-[9px] text-brand-cyan truncate" title={fileName}>
              {fileName} ({(fileSize ? fileSize/1024 : 0).toFixed(0)}kB)
            </div>
          )}

          {/* Barra LED Diagnostica */}
          <div className="w-full h-1.5 bg-brand-base rounded-full overflow-hidden border border-brand-border-bright mt-1">
            <div className={`h-full rounded-full transition-all duration-700 ${currentStatus.glow} ${
              status === 'idle' ? 'bg-brand-border-bright w-1/12' : status === 'parsing' ? 'bg-brand-warn w-6/12' : status === 'writing' ? 'bg-brand-accent w-9/12 animate-pulse' : 'bg-brand-ok w-full'
            }`} />
          </div>
        </div>
      </div>

      {/* Navigazione Meticolosa */}
      <nav className="flex-1 py-4 px-3 flex flex-col gap-1.5 overflow-y-auto">
        {NAV.map((item) => {
          const Icon = item.icon;
          const isActive = active === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNav(item.id)}
              className={`group flex items-center gap-4 px-4 py-3 rounded-lg border text-left cursor-pointer transition-all duration-200 ${
                isActive 
                  ? 'bg-brand-accent-glow border-brand-accent/40 text-brand-accent shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)]' 
                  : 'bg-transparent border-transparent text-brand-secondary hover:bg-brand-elevated/40 hover:text-[#f0f6fc]'
              }`}
            >
              <div className={`transition-transform duration-200 group-hover:scale-110 ${isActive ? 'text-brand-accent' : 'text-brand-secondary group-hover:text-brand-accent'}`}>
                <Icon size={18} strokeWidth={isActive ? 2.5 : 2} />
              </div>
              <div className="flex-1">
                <div className={`text-xs ${isActive ? 'font-bold' : 'font-medium'}`}>{item.label}</div>
                <div className="text-[9px] text-brand-secondary/60 leading-tight group-hover:text-brand-secondary/80">{item.desc}</div>
              </div>
              {isActive && (
                <div className="w-1 h-3 rounded-full bg-brand-accent shadow-[0_0_8px_var(--color-brand-accent)]" />
              )}
            </button>
          );
        })}
      </nav>

      {/* Footer Tecnico */}
      <div className="p-4 border-t border-brand-border bg-brand-base/40 text-[9px] font-mono text-brand-secondary/60 flex flex-col gap-1.5">
        <div className="flex justify-between"><span>SW REGISTRY</span> <span className="text-brand-accent font-bold">V2.1-PRO</span></div>
        <div className="flex justify-between"><span>CHECKSUM ADDITIVE</span> <span className="text-brand-cyan">ACTIVE</span></div>
        <div className="mt-2 text-center text-brand-err bg-brand-err/10 border border-brand-err/20 rounded p-1.5 font-bold tracking-wider animate-pulse">
          ⚠️ ATTENZIONE: USO OFFICINA
        </div>
      </div>
    </aside>
  );
}
