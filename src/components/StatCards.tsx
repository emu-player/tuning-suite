'use client';

import { useSession } from '@/lib/store';
import { Cpu, Layers, Edit3, ShieldAlert, BadgeCheck, Database } from 'lucide-react';

export default function StatCards() {
  const { maps, status, ecuFamily, fileSize, odaViolations, checksumOk, pendingDeltas } = useSession();

  // Calcoli protetti contro stati non definiti all'avvio
  const totalCells = (maps || []).reduce((a, m) => a + (m?.cells?.length || 0), 0);
  const modifiedCells = pendingDeltas?.size || 0;

  const cards = [
    { 
      label: 'PROTOCOLLO ATTIVO', 
      value: ecuFamily ?? '—', 
      sub: 'Detected protocol', 
      accent: !!ecuFamily, 
      color: 'text-brand-accent',
      icon: Cpu 
    },
    { 
      label: 'MAPPE CARICATE', 
      value: maps?.length || '—', 
      sub: `${totalCells} celle totali`, 
      color: 'text-brand-primary',
      icon: Layers 
    },
    { 
      label: 'MODIFICHE PENDENTI', 
      value: modifiedCells || '—', 
      sub: `${modifiedCells} byte modificati`, 
      accent: modifiedCells > 0, 
      color: modifiedCells > 0 ? 'text-brand-accent' : 'text-brand-secondary',
      icon: Edit3 
    },
    { 
      label: 'RILEVATORE ODA', 
      value: odaViolations?.length || (status === 'ready' ? 'COMPLIANT' : '—'), 
      sub: 'Nessuna collisione', 
      ok: status === 'ready' && odaViolations?.length === 0, 
      err: status === 'ready' && odaViolations?.length > 0,
      color: odaViolations?.length > 0 ? 'text-brand-err' : 'text-brand-ok',
      icon: ShieldAlert 
    },
    { 
      label: 'DIAGNOSTICA CHECKSUM', 
      value: checksumOk === null ? '—' : checksumOk ? 'PASS' : 'FAIL', 
      sub: 'Additive 16-bit compl.', 
      ok: checksumOk === true, 
      err: checksumOk === false, 
      color: checksumOk ? 'text-brand-ok' : 'text-brand-err',
      icon: BadgeCheck 
    },
    { 
      label: 'DIMENSIONE BINARIO', 
      value: fileSize ? `${(fileSize / 1024).toFixed(0)} kB` : '—', 
      sub: 'Raw dump centralina', 
      color: 'text-brand-cyan',
      icon: Database 
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5 px-6 py-4 border-b border-brand-border bg-brand-surface/20 select-none">
      {cards.map((c, i) => {
        const Icon = c.icon;
        return (
          <div 
            key={i} 
            className="bg-brand-surface/75 border border-brand-border rounded-xl p-4 flex flex-col justify-between shadow-[0_4px_12px_rgba(0,0,0,0.4)] relative overflow-hidden group hover:border-brand-border-bright hover:-translate-y-[1px] hover:shadow-[0_6px_16px_rgba(0,0,0,0.5)] transition-all duration-300 ease-out"
          >
            {/* Barre di evidenza Neon Superiori per gli Stati Critici */}
            {c.accent && (
              <div className="absolute top-0 left-0 right-0 h-[2px] bg-brand-accent shadow-[0_2px_10px_var(--color-brand-accent)]" />
            )}
            {c.ok && (
              <div className="absolute top-0 left-0 right-0 h-[2px] bg-brand-ok shadow-[0_2px_10px_var(--color-brand-ok)]" />
            )}
            {c.err && (
              <div className="absolute top-0 left-0 right-0 h-[2px] bg-brand-err shadow-[0_2px_10px_var(--color-brand-err)] animate-pulse" />
            )}

            {/* Layout Interno della Scheda */}
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between items-start gap-2">
                <span className="text-[9px] font-bold tracking-widest text-brand-secondary/60 leading-none group-hover:text-brand-secondary/80 transition-colors uppercase truncate">
                  {c.label}
                </span>
                {/* Micro-Icona Vettoriale */}
                <Icon className="w-3.5 h-3.5 text-brand-secondary/25 group-hover:text-brand-secondary/50 transition-colors shrink-0" aria-hidden="true" />
              </div>

              {/* Valore Principale Monospazio */}
              <span className={`text-xl font-black font-mono tracking-tight leading-none mt-1 transition-colors ${c.color}`}>
                {c.value}
              </span>
            </div>

            {/* Subtext descrittivo */}
            <span className="text-[10px] text-brand-secondary/50 font-mono mt-3.5 font-semibold leading-none truncate">
              {c.sub}
            </span>
          </div>
        );
      })}
    </div>
  );
}