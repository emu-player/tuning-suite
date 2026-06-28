'use client';
import { useState } from 'react';
import Sidebar       from '@/components/Sidebar';
import Toolbar       from '@/components/Toolbar';
import StatCards     from '@/components/StatCards';
import MapSelector   from '@/components/MapSelector';
import MapGrid       from '@/components/MapGrid';
import EventLog      from '@/components/EventLog';
import ChecksumPanel from '@/components/ChecksumPanel';
import OdaPanel      from '@/components/OdaPanel';

type Panel = 'maps' | 'checksum' | 'oda' | 'log';

export default function Dashboard() {
  const [panel, setPanel] = useState<Panel>('maps');

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-brand-base font-sans antialiased text-slate-200 selection:bg-brand-accent/30 selection:text-brand-accent">
      {/* Sidebar Laterale di Controllo */}
      <Sidebar active={panel} onNav={(id) => setPanel(id as Panel)} />

      {/* Sezione di Monitoraggio e Griglia Calibrazione */}
      <div className="flex-1 flex flex-col overflow-hidden bg-brand-base bg-oscilloscope">
        <Toolbar />
        <StatCards />

        {panel === 'maps' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <MapSelector />
            <MapGrid />
          </div>
        )}
        {panel === 'checksum' && <ChecksumPanel />}
        {panel === 'oda'      && <OdaPanel />}
        {panel === 'log'      && (
          <div className="flex-1 flex flex-col overflow-hidden bg-brand-surface border-t border-brand-border">
            <div className="px-6 py-4 border-b border-brand-border flex items-center justify-between bg-brand-surface/40 backdrop-blur-md">
              <span className="text-xs font-bold tracking-widest text-brand-cyan">EVENT DIAGNOSTIC CONSOLE STREAM</span>
              <span className="font-mono text-[9px] text-brand-cyan/70 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-brand-cyan animate-pulse"></span>
                TELEMETRY LIVE
              </span>
            </div>
            <EventLog />
          </div>
        )}
      </div>
    </div>
  );
}
