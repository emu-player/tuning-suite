'use client';
import { useEffect, useRef } from 'react';
import { useSession } from '@/lib/store';

export default function EventLog() {
  const { log } = useSession();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [log]);

  function getLineColor(line: string): string {
    if (line.includes('[SYSTEM]')) return 'text-brand-secondary/70';
    if (line.includes('[LOAD]'))   return 'text-brand-cyan';
    if (line.includes('[PARSE]'))  return 'text-brand-ok font-semibold';
    if (line.includes('[CHECKSUM]')) return 'text-brand-ok';
    if (line.includes('[PATCH]') || line.includes('[EDIT]')) return 'text-brand-warn';
    if (line.includes('[TUNING-STAGE1]')) return 'text-brand-accent font-black tracking-wide';
    if (line.includes('[EXPORT]')) return 'text-brand-accent font-semibold';
    if (line.includes('[ERRORE]'))  return 'text-brand-err font-black';
    return 'text-brand-secondary';
  }

  return (
    <div ref={ref} className="flex-1 overflow-y-auto p-6 bg-[#030507] border border-brand-border/40 font-mono text-[11px] leading-relaxed shadow-inner">
      <div className="flex flex-col gap-1.5 max-w-6xl mx-auto">
        {log.map((line, i) => (
          <div key={i} className={`flex gap-4 items-start ${getLineColor(line)}`}>
            <span className="text-brand-secondary/30 select-none text-[9px] w-8 text-right font-light">
              {String(i).padStart(3, '0')}
            </span>
            <span className="flex-1 whitespace-pre-wrap">{line}</span>
          </div>
        ))}
        <div style={{ height: 8 }} />
      </div>
    </div>
  );
}
