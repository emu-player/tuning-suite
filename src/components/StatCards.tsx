'use client';
import { useSession } from '@/lib/store';

export default function StatCards() {
  const { maps, status, ecuFamily, fileSize, odaViolations, checksumOk, pendingDeltas } = useSession();

  const totalCells  = maps.reduce((a, m) => a + m.cells.length, 0);
  const modifiedCells = pendingDeltas.size;

  const cards = [
    { label: 'PROCOLLO ATTIVO', value: ecuFamily ?? '—', sub: 'Detected protocol', accent: !!ecuFamily, color: 'text-brand-accent' },
    { label: 'MAPPE CARICATE', value: maps.length || '—', sub: `${totalCells} celle totali`, color: 'text-brand-primary' },
    { label: 'MODIFICHE PENDENTI', value: modifiedCells || '—', sub: `${modifiedCells} byte modificati`, accent: modifiedCells > 0, color: modifiedCells > 0 ? 'text-brand-accent' : 'text-brand-secondary' },
    { label: 'RILEVATORE ODA', value: odaViolations.length || (status === 'ready' ? 'COMPLIANT' : '—'), sub: 'Nessuna collisione', ok: status === 'ready' && odaViolations.length === 0, color: odaViolations.length > 0 ? 'text-brand-err' : 'text-brand-ok' },
    { label: 'DIAGNOSTICA CHECKSUM', value: checksumOk === null ? '—' : checksumOk ? 'PASS' : 'FAIL', sub: 'Additive 16-bit compl.', ok: checksumOk === true, err: checksumOk === false, color: checksumOk ? 'text-brand-ok' : 'text-brand-err' },
    { label: 'DIMENSIONE BINARIO', value: fileSize ? `${(fileSize/1024).toFixed(0)} kB` : '—', sub: 'Raw dump centralina', color: 'text-brand-cyan' },
  ];

  return (
    <div className="grid grid-cols-6 gap-3 px-6 py-4 border-b border-brand-border bg-brand-surface/20">
      {cards.map((c, i) => (
        <div key={i} className="bg-brand-surface/75 border border-brand-border rounded-xl p-4 flex flex-col justify-between shadow-[0_4px_12px_rgba(0,0,0,0.4)] relative overflow-hidden group hover:border-brand-border-bright transition-all duration-300">
          {/* Neon Top Highlight Glow */}
          {c.accent && (
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-brand-accent shadow-[0_1px_10px_var(--color-brand-accent)]" />
          )}
          {c.ok && (
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-brand-ok shadow-[0_1px_10px_var(--color-brand-ok)]" />
          )}

          <div className="flex flex-col gap-1">
            <span className="text-[9px] font-bold tracking-widest text-brand-secondary/60 leading-none group-hover:text-brand-secondary/80 transition-colors uppercase">{c.label}</span>
            <span className={`text-xl font-black font-mono tracking-tight leading-tight mt-1 ${c.color}`}>
              {c.value}
            </span>
          </div>
          <span className="text-[10px] text-brand-secondary/50 font-mono mt-1 font-semibold leading-none">{c.sub}</span>
        </div>
      ))}
    </div>
  );
}
