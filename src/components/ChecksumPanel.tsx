'use client';

import { useSession } from '@/lib/store';
import { ShieldCheck, ShieldAlert, Cpu } from 'lucide-react';

const ALGOS = [
  { id: 'add16', name: 'Additive 16-bit Two\'s Complement', families: 'EDC15, EDC16, Continental SID803', status: 'active', desc: 'Calcola la somma complessa invertita a 16 bit dei registri fisici.' },
  { id: 'xor8',  name: 'XOR 8-bit Rolling Matrix',          families: 'Siemens/Continental SID807, SID208', status: 'idle', desc: 'Controllo a scorrimento dinamico ciclico sul vettore iniezione.' },
  { id: 'crc32', name: 'CRC-32 (ISO 3309) Polynomial',       families: 'Bosch MD1, MG1, MED17, EDC17',       status: 'idle', desc: 'Algoritmo polinomiale ad alta fedeltà con chiave d\'accesso centralizzata.' },
  { id: 'bosch', name: 'Bosch EDC17 RSA Proprietary',        families: 'Tricore MPC55xx Signature Block',    status: 'idle', desc: 'Controllo firma crittografata con chiave RSA a 1024 bit.' },
];

export default function ChecksumPanel() {
  const { checksumOk, status } = useSession();

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-8 bg-brand-base select-none scroll-smooth">
      <div className="max-w-4xl mx-auto flex flex-col gap-6">
        
        {/* Intestazione del Modulo */}
        <div className="flex flex-col gap-1.5 border-b border-brand-border/60 pb-6">
          <div className="flex items-center gap-2">
            <span className="flex h-1.5 w-1.5 rounded-full bg-brand-accent animate-pulse shrink-0" />
            <h2 className="text-xl font-black text-brand-primary tracking-wider uppercase">
              CHECKSUM VALIDATION ENGINE
            </h2>
          </div>
          <p className="text-xs text-brand-secondary/80 leading-relaxed max-w-3xl">
            Ogni processo di patch inibisce la scrittura se il checksum non supera il fail-safe readback interno.
            Il sistema ricalcola i valori reali e previene il blocco software (brick) della centralina.
          </p>
        </div>

        {/* Diagnostic Status Box (Rilevamento in Tempo Reale) */}
        {checksumOk !== null && (
          <div className={`relative border rounded-xl p-5 flex flex-col sm:flex-row sm:items-center gap-5 backdrop-blur-md transition-all duration-300 overflow-hidden group ${
            checksumOk 
              ? 'bg-brand-ok/5 border-brand-ok/25 text-brand-ok shadow-[0_4px_20px_rgba(16,185,129,0.03)]' 
              : 'bg-brand-err/5 border-brand-err/25 text-brand-err shadow-[0_4px_20px_rgba(239,68,68,0.03)]'
          }`}>
            {/* Sfumatura decorativa posteriore */}
            <div className={`absolute -right-12 -top-12 w-28 h-28 rounded-full filter blur-3xl opacity-15 transition-opacity duration-300 group-hover:opacity-25 ${
              checksumOk ? 'bg-brand-ok' : 'bg-brand-err'
            }`} />

            {/* Icona Diagnostic */}
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 border transition-all duration-300 ${
              checksumOk ? 'bg-brand-ok/10 border-brand-ok/20' : 'bg-brand-err/10 border-brand-err/20'
            }`}>
              {checksumOk ? <ShieldCheck className="w-6 h-6 animate-pulse" /> : <ShieldAlert className="w-6 h-6" />}
            </div>

            {/* Testo Diagnostic */}
            <div className="flex-1 min-w-0 z-10">
              <div className="text-xs font-black tracking-widest uppercase">
                {checksumOk ? 'COERENZA DATI CONFERMATA ✓' : 'CHECKSUM ROTTO ✗'}
              </div>
              <p className="text-xs text-brand-secondary/70 mt-1 leading-normal">
                {checksumOk 
                  ? 'Il binario è stato correttamente firmato ed è sicuro per la scrittura su linea CAN/K-Line.' 
                  : 'Rilevato disallineamento nei blocchi dati. Modifica respinta.'}
              </p>
            </div>
          </div>
        )}

        {/* Tabella degli Algoritmi Centralina */}
        <div className="bg-brand-surface border border-brand-border/80 rounded-xl overflow-hidden shadow-[0_12px_32px_rgba(0,0,0,0.35)]">
          <div className="w-full overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="min-w-[620px] divide-y divide-brand-border">
              
              {/* Header Tabella */}
              <div className="grid grid-cols-[1fr_200px_110px] gap-4 px-6 py-4 bg-brand-surface/70 text-[10px] font-bold text-brand-secondary/50 uppercase tracking-widest select-none">
                <span>ALGORITMO ATTIVO</span>
                <span>FAMIGLIE COMPATIBILI</span>
                <span className="text-right">STATO</span>
              </div>

              {/* Righe Tabella */}
              <div className="divide-y divide-brand-border/60">
                {ALGOS.map((a) => {
                  const isRunning = a.status === 'active' && status === 'ready';
                  return (
                    <div 
                      key={a.id} 
                      className={`grid grid-cols-[1fr_200px_110px] gap-4 px-6 py-4 items-center transition-colors duration-150 ${
                        isRunning ? 'bg-brand-ok/[0.02] hover:bg-brand-ok/[0.04]' : 'hover:bg-brand-elevated/20'
                      }`}
                    >
                      {/* Dettagli Algoritmo */}
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-brand-primary flex items-center gap-2">
                          <Cpu 
                            size={14} 
                            className={`shrink-0 transition-colors duration-200 ${
                              isRunning ? 'text-brand-accent' : 'text-brand-secondary/40'
                            }`} 
                          />
                          <span className="truncate">{a.name}</span>
                        </div>
                        <div className="text-[10px] text-brand-secondary/60 mt-1 leading-relaxed">{a.desc}</div>
                      </div>

                      {/* Famiglie di Supporto */}
                      <span className="text-[10px] font-mono font-bold text-brand-secondary/80 truncate">
                        {a.families}
                      </span>

                      {/* Badge di Stato Dinamico */}
                      <div className="text-right select-none shrink-0">
                        <span className={`text-[8px] font-black uppercase tracking-widest px-2.5 py-1 rounded border transition-all ${
                          isRunning
                            ? 'bg-brand-ok/10 border-brand-ok/30 text-brand-ok shadow-[0_2px_8px_rgba(16,185,129,0.1)] animate-pulse'
                            : 'bg-brand-base border-brand-border/80 text-brand-secondary/40'
                        }`}>
                          {isRunning ? '● RUNNING' : '○ STANDBY'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

            </div>
          </div>
        </div>

        {/* Matematica di Controllo Centralina (Syntax Highlighting Pro) */}
        <div className="bg-brand-surface border border-brand-border/80 rounded-xl p-5 shadow-[0_12px_32px_rgba(0,0,0,0.35)]">
          <div className="text-[10px] font-black text-brand-secondary/50 uppercase tracking-widest mb-3 select-none">
            MATEMATICA DI CONTROLLO CENTRALINA
          </div>
          <div className="relative rounded-lg overflow-hidden border border-brand-border/80 bg-[#05070a] shadow-inner">
            <pre className="font-mono text-xs text-[#e2e8f0] p-4 overflow-x-auto leading-relaxed scrollbar-none">
              <code>
                <span className="text-emerald-500/80 font-semibold">// EDC15-EDC16 16-bit Additive Algorithm</span>{'\n'}
                <span className="text-purple-400 font-semibold">let</span> sum = <span className="text-cyan-400 font-medium">0</span>;{'\n'}
                <span className="text-purple-400 font-semibold">for</span> (<span className="text-purple-400 font-semibold">let</span> offset = regionStart; offset &lt; regionEnd; offset++) {'{\n'}
                <span className="text-brand-secondary/50">    </span>sum = (sum + binary[offset]) &amp; <span className="text-cyan-400 font-medium">0xFFFF</span>;{'\n'}
                {'}\n'}
                <span className="text-purple-400 font-semibold">let</span> finalChecksum = ((~sum + <span className="text-cyan-400 font-medium">1</span>) &amp; <span className="text-cyan-400 font-medium">0xFFFF</span>);{'\n'}
                <span className="text-blue-400 font-semibold">writeUint16At</span>(storeOffset, finalChecksum);
              </code>
            </pre>
          </div>
        </div>

      </div>
    </div>
  );
}