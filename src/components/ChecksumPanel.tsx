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
    <div className="flex-1 overflow-y-auto p-8 bg-brand-base">
      <div className="max-w-4xl mx-auto flex flex-col gap-6">
        <div>
          <h2 className="text-xl font-black text-brand-primary tracking-wider">CHECKSUM VALIDATION ENGINE</h2>
          <p className="text-xs text-brand-secondary/80 mt-1 leading-relaxed">
            Ogni processo di patch inibisce la scrittura se il checksum non supera il fail-safe readback interno.
            Il sistema ricalcola i valori reali e previene il blocco software (brick) della centralina.
          </p>
        </div>

        {/* Diagnostic Status Box */}
        {checksumOk !== null && (
          <div className={`border rounded-xl p-5 flex items-center gap-5 backdrop-blur-md transition-all duration-300 ${
            checksumOk 
              ? 'bg-brand-ok/10 border-brand-ok/30 text-brand-ok' 
              : 'bg-brand-err/10 border-brand-err/30 text-brand-err'
          }`}>
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${checksumOk ? 'bg-brand-ok/20' : 'bg-brand-err/20'}`}>
              {checksumOk ? <ShieldCheck size={28} /> : <ShieldAlert size={28} />}
            </div>
            <div>
              <div className="text-sm font-black tracking-wider uppercase">
                {checksumOk ? 'COERENZA DATI CONFIRMATA ✓' : 'CHECKSUM ROTTO ✗'}
              </div>
              <p className="text-xs text-brand-secondary/80 mt-0.5">
                {checksumOk 
                  ? 'Il binario è stato correttamente firmato ed è sicuro per la scrittura su linea CAN/K-Line.' 
                  : 'Rilevato disallineamento nei blocchi dati. Modifica respinta.'}
              </p>
            </div>
          </div>
        )}

        {/* Tabella Algoritmi Centralina */}
        <div className="bg-brand-surface border border-brand-border rounded-xl overflow-hidden shadow-[0_8px_24px_rgba(0,0,0,0.5)]">
          <div className="grid grid-cols-[1fr_200px_100px] gap-4 px-6 py-4 bg-brand-surface/60 border-b border-brand-border text-[10px] font-bold text-brand-secondary/50 uppercase tracking-widest">
            <span>ALGORITMO ATTIVO</span>
            <span>FAMIGLIE COMPATIBILI</span>
            <span className="text-right">STATO</span>
          </div>

          <div className="divide-y divide-brand-border">
            {ALGOS.map((a) => (
              <div key={a.id} className="grid grid-cols-[1fr_200px_100px] gap-4 px-6 py-4 items-center">
                <div>
                  <div className="text-xs font-bold text-brand-primary flex items-center gap-2">
                    <Cpu size={14} className={a.status === 'active' ? 'text-brand-accent' : 'text-brand-secondary/40'} />
                    {a.name}
                  </div>
                  <div className="text-[10px] text-brand-secondary/60 mt-1 leading-relaxed">{a.desc}</div>
                </div>
                <span className="text-[10px] font-mono font-semibold text-brand-secondary">{a.families}</span>
                <div className="text-right">
                  <span className={`text-[8px] font-black uppercase tracking-widest px-2 py-1 rounded border ${
                    a.status === 'active' && status === 'ready'
                      ? 'bg-brand-ok/10 border-brand-ok/30 text-brand-ok shadow-[0_0_8px_rgba(16,185,129,0.2)] animate-pulse'
                      : 'bg-brand-base border-brand-border text-brand-secondary/40'
                  }`}>
                    {a.status === 'active' && status === 'ready' ? '● RUNNING' : '○ STANDBY'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Debug Logico */}
        <div className="bg-brand-surface border border-brand-border rounded-xl p-5 shadow-[0_8px_24px_rgba(0,0,0,0.5)]">
          <div className="text-[10px] font-bold text-brand-secondary/50 uppercase tracking-widest mb-3">MATEMATICA DI CONTROLLO CENTRALINA</div>
          <pre className="font-mono text-xs text-brand-cyan bg-brand-base/80 p-4 rounded-lg border border-brand-border overflow-x-auto leading-relaxed shadow-inner">{
`// EDC15-EDC16 16-bit Additive Algorithm
let sum = 0;
for (let offset = regionStart; offset < regionEnd; offset++) {
    sum = (sum + binary[offset]) & 0xFFFF;
}
let finalChecksum = ((~sum + 1) & 0xFFFF);
writeUint16At(storeOffset, finalChecksum);`
          }</pre>
        </div>
      </div>
    </div>
  );
}
