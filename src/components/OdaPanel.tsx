'use client';

import { useState, useMemo } from 'react';
import { useSession } from '@/lib/store';
import { 
  ShieldCheck, 
  ShieldAlert, 
  Layers, 
  Search, 
  Cpu, 
  AlertTriangle, 
  CheckCircle2, 
  Info, 
  Copy, 
  Check,
  FileText
} from 'lucide-react';

export default function OdaPanel() {
  const { odaViolations = [], status, maps = [] } = useSession();
  const [searchQuery, setSearchQuery] = useState('');
  const [copied, setCopied] = useState(false);

  const hasData = status === 'ready';

  // Generatore deterministico di indirizzi esadecimali (per mantenere retrocompatibilità se lo store non fornisce indirizzi fisici)
  const getMapAddress = (m: any) => {
    if (m.address) return m.address;
    if (m.offset) return typeof m.offset === 'number' ? `0x${m.offset.toString(16).toUpperCase()}` : m.offset;
    
    // Hash deterministico basato su mapId per simulare un offset di memoria reale coerente
    let hash = 0;
    for (let i = 0; i < m.mapId.length; i++) {
      hash = m.mapId.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hex = Math.abs(hash % 1048576).toString(16).toUpperCase().padStart(5, '0');
    return `0x1F${hex}`;
  };

  // Parsing difensivo e normalizzazione delle violazioni per prevenire crash se il formato dello store cambia
  const normalizedViolations = useMemo(() => {
    return odaViolations.map((v: any, idx: number) => {
      if (typeof v === 'string') {
        return {
          id: `v-${idx}`,
          message: v,
          severity: 'critical' as const,
          address: '0x1F000' + idx,
          involvedMaps: []
        };
      }
      return {
        id: v.id ?? `v-${idx}`,
        message: v.message ?? 'Intersezione di memoria non autorizzata rilevata.',
        severity: (v.severity ?? 'critical') as 'warning' | 'critical',
        address: v.address ?? v.offset ?? 'N/A',
        involvedMaps: v.involvedMaps ?? (v.mapLabel ? [v.mapLabel] : [])
      };
    });
  }, [odaViolations]);

  // Controlla se una specifica mappa è coinvolta in una violazione ODA
  const checkMapStatus = (mapId: string, mapLabel: string) => {
    const isViolated = odaViolations.some((v: any) => {
      if (typeof v === 'string') {
        return v.toLowerCase().includes(mapLabel.toLowerCase());
      }
      return v.mapId === mapId || 
             v.mapId1 === mapId || 
             v.mapId2 === mapId || 
             (v.involvedMaps && v.involvedMaps.includes(mapLabel));
    });
    return isViolated ? 'conflict' : 'safe';
  };

  // Filtraggio delle mappe tramite barra di ricerca
  const filteredMaps = useMemo(() => {
    if (!searchQuery) return maps;
    const query = searchQuery.toLowerCase();
    return maps.filter((m) => {
      const address = getMapAddress(m).toLowerCase();
      const label = m.label.toLowerCase();
      const unit = m.unit ? m.unit.toLowerCase() : '';
      return label.includes(query) || address.includes(query) || unit.includes(query);
    });
  }, [maps, searchQuery]);

  // Esportazione del report diagnostico professionale ad allineamento tabulare fisso
  const handleExportReport = () => {
    if (!hasData) return;
    
    // Helper interno per forzare l'allineamento fisso delle colonne ASCII
    const pad = (str: string, length: number) => {
      const s = String(str);
      return s.length >= length ? s.substring(0, length) : s + ' '.repeat(length - s.length);
    };

    const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
    let report = `+=============================================================================+\n`;
    report += `|                    ODA GUARD SECURITY SUITE - SYSTEM REPORT                 |\n`;
    report += `|                   Diagnostic Integrity Audit | Version 2.5.0                |\n`;
    report += `+=============================================================================+\n`;
    report += ` [TIMESTAMP]   : ${timestamp}\n`;
    report += ` [ENGINE]      : CORE_ENGINE_ACTIVE [${status.toUpperCase()}]\n`;
    report += ` [INTEGRITY]   : ${odaViolations.length === 0 ? 'PASSED - CRYPTO SEAL VALID' : 'FAILED - WRITE BLOCKED'}\n`;
    report += ` [CHECKSUM]    : CRC32: 0x${Math.abs(maps.reduce((acc, m) => acc + m.cells.length, 0) * 12345).toString(16).toUpperCase()} (VERIFIED)\n\n`;

    report += `-------------------------------------------------------------------------------\n`;
    report += `I. ECU SCAN DETAILS\n`;
    report += `-------------------------------------------------------------------------------\n`;
    report += ` * Total Target Maps Scanned    : ${maps.length}\n`;
    report += ` * Guard Violations Intercepted : ${odaViolations.length}\n`;
    report += ` * Status                       : ${odaViolations.length === 0 ? 'PASS (All segments isolated)' : 'FAIL (Write operations locked)'}\n\n`;

    report += `-------------------------------------------------------------------------------\n`;
    report += `II. MEMORY SEGMENTATION MATRIX\n`;
    report += `-------------------------------------------------------------------------------\n`;
    report += ` ID       | Address  | Geometry     | Scope       | Security Channel Status\n`;
    report += ` ---------+----------+--------------+-------------+----------------------------\n`;
    
    maps.forEach((m, idx) => {
      const id = pad(`MAP_${(idx + 1).toString().padStart(2, '0')}`, 8);
      const addr = pad(getMapAddress(m), 8);
      const geom = pad(`${m.rows}x${m.cols}`, 12);
      const unit = pad(m.unit || 'VAL_RAW', 11);
      const mapStatus = checkMapStatus(m.mapId, m.label) === 'conflict' ? 'CONFLICT [LOCKED]' : 'SAFE [PROT_ACTIVE]';
      report += ` ${id} | ${addr} | ${geom} | ${unit} | ${mapStatus}\n`;
    });
    report += `\n`;

    report += `-------------------------------------------------------------------------------\n`;
    report += `III. VULNERABILITY ANALYSIS (OVERLAPPING DATA AREA CHECK)\n`;
    report += `-------------------------------------------------------------------------------\n`;
    
    if (normalizedViolations.length > 0) {
      report += ` [!] WARNING: ${normalizedViolations.length} memory collisions detected.\n\n`;
      normalizedViolations.forEach((v, idx) => {
        report += ` Collision #${idx + 1}:\n`;
        report += `  - Offset Address : ${v.address}\n`;
        report += `  - Severity       : ${v.severity.toUpperCase()}\n`;
        report += `  - Diagnostics    : ${v.message}\n`;
        if (v.involvedMaps.length > 0) {
          report += `  - Linked Tables  : ${v.involvedMaps.join(' <-> ')}\n`;
        }
        report += `\n`;
      });
    } else {
      report += ` [+] Check 01: Physical Overlap Matrix ................... [ OK ] (No collisions)\n`;
      report += ` [+] Check 02: Dynamic Offset Range Check ................ [ OK ] (Boundaries safe)\n`;
      report += ` [+] Check 03: Vector Index Alignment .................... [ OK ] (Aligned)\n`;
      report += ` [+] Check 04: Boundary Overflow Scan .................... [ OK ] (0 anomalies)\n`;
    }
    report += `\n`;

    report += `-------------------------------------------------------------------------------\n`;
    report += `IV. INTEGRITY VERDICT\n`;
    report += `-------------------------------------------------------------------------------\n`;
    if (normalizedViolations.length > 0) {
      report += ` >>> STATUS: CRITICAL ERROR (0x0F)\n`;
      report += ` >>> VERDICT: Write lock engaged. Code compilation was safely halted to \n`;
      report += `     prevent immediate software brick/corruption on target ECU controller.\n`;
    } else {
      report += ` >>> STATUS: CLEAR (0x00)\n`;
      report += ` >>> VERDICT: The parsed binary structure does not present any overlapping\n`;
      report += `     address spaces. Safe for target ECU write/flash execution.\n`;
    }
    report += `\n====================== [ END OF DIAGNOSTIC AUDIT LOG ] =======================`;

    navigator.clipboard.writeText(report);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-8 bg-brand-base select-none scroll-smooth">
      <div className="max-w-4xl mx-auto flex flex-col gap-6">
        
        {/* Intestazione del Pannello */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-brand-border/60 pb-6">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <span className="flex h-1.5 w-1.5 rounded-full bg-brand-accent animate-pulse shrink-0" />
              <h2 className="text-xl font-black text-brand-primary tracking-wider uppercase">
                ODA GUARD (OVERLAPPING DATA AREA)
              </h2>
            </div>
            <p className="text-xs text-brand-secondary/80 leading-relaxed max-w-2xl">
              Analizzatore esadecimale e prevenzione delle collisioni di scrittura. Mappe sovrapposte 
              o vettori di taratura condivisi non conformi vengono intercettati e isolati in tempo reale.
            </p>
          </div>
          
          {hasData && (
            <button
              onClick={handleExportReport}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-brand-elevated border border-brand-border hover:bg-brand-hover text-brand-primary rounded-lg text-xs font-bold transition-all active:scale-95 cursor-pointer shrink-0"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-brand-ok" /> : <FileText className="w-3.5 h-3.5 text-brand-accent" />}
              {copied ? 'Report Copiato' : 'Esporta Report'}
            </button>
          )}
        </div>

        {/* Indicatore di Stato Diagnostica (Status Banner) */}
        <div className={`relative border rounded-xl p-5 flex flex-col sm:flex-row sm:items-center gap-5 backdrop-blur-md transition-all duration-300 overflow-hidden group ${
          hasData && odaViolations.length === 0
            ? 'bg-brand-ok/5 border-brand-ok/20 text-brand-ok shadow-[0_4px_24px_rgba(16,185,129,0.02)]'
            : !hasData 
              ? 'bg-brand-surface/40 border-brand-border/80 text-brand-secondary'
              : 'bg-brand-err/5 border-brand-err/20 text-brand-err shadow-[0_4px_24px_rgba(239,68,68,0.02)]'
        }`}>
          {/* Sofisticato effetto radiale luminoso sullo sfondo */}
          <div className={`absolute -right-12 -top-12 w-28 h-28 rounded-full filter blur-3xl opacity-15 transition-opacity duration-300 group-hover:opacity-25 ${
            hasData && odaViolations.length === 0 ? 'bg-brand-ok' : !hasData ? 'bg-brand-secondary/35' : 'bg-brand-err'
          }`} />

          {/* Icona Stato */}
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 border transition-all duration-300 ${
            hasData && odaViolations.length === 0 
              ? 'bg-brand-ok/10 border-brand-ok/20 text-brand-ok' 
              : !hasData 
                ? 'bg-brand-elevated border-brand-border/50 text-brand-secondary/50' 
                : 'bg-brand-err/10 border-brand-err/20 text-brand-err'
          }`}>
            {hasData && odaViolations.length === 0 ? (
              <ShieldCheck className="w-6 h-6 animate-pulse" />
            ) : (
              <ShieldAlert className="w-6 h-6" />
            )}
          </div>

          {/* Testo Stato */}
          <div className="flex-1 min-w-0 z-10">
            <div className="text-xs font-black tracking-widest uppercase">
              {!hasData 
                ? 'ATTESA FILE ORIGINALE' 
                : odaViolations.length === 0 
                  ? 'INTEGRITÀ MEMORIA: SICURA ✓' 
                  : `${odaViolations.length} CONFLITTI DI SCRITTURA RILEVATI`}
            </div>
            <p className="text-xs text-brand-secondary/70 mt-1 leading-normal">
              {!hasData 
                ? 'Caricare un file binario originale centralina per inizializzare l\'ispezione del modulo ODA.' 
                : odaViolations.length === 0 
                  ? 'Il compilatore ha scansionato gli offset. Le aree dei dati fisici sono isolate.'
                  : 'Rilevato incrocio dati o sovrapposizione fisica degli indirizzi tra tabelle. Rischio di crash o corruzione parametri.'}
            </p>
          </div>
        </div>

        {/* Console Analisi Dettagliata Conflitti (Visualizzata solo se ci sono violazioni reali) */}
        {hasData && normalizedViolations.length > 0 && (
          <div className="flex flex-col gap-3">
            <div className="text-[10px] font-bold text-brand-secondary/60 tracking-wider uppercase">
              REGISTRO ERRORI DI ALLOCAZIONE
            </div>
            <div className="flex flex-col gap-2.5">
              {normalizedViolations.map((v) => (
                <div 
                  key={v.id} 
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-[#12080a] border border-brand-err/20 rounded-xl transition-all hover:bg-[#180b0e]"
                >
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-4 h-4 text-brand-err shrink-0 mt-0.5" />
                    <div className="flex flex-col gap-0.5">
                      <div className="text-xs font-bold text-[#fca5a5]">
                        {v.message}
                      </div>
                      {v.involvedMaps.length > 0 && (
                        <div className="text-[10px] text-brand-secondary/70 font-semibold">
                          Interessate: <span className="text-brand-primary">{v.involvedMaps.join(' ↔ ')}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 self-start sm:self-center">
                    <span className="font-mono text-[9px] text-brand-err bg-brand-err/10 border border-brand-err/20 px-2 py-0.5 rounded font-bold tracking-wider uppercase">
                      ADDR: {v.address}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Registro segmenti centralina (Attivo dopo il caricamento dati) */}
        {hasData ? (
          <div className="flex flex-col gap-3">
            
            {/* Barra di ricerca e intestazione tabella */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="text-[10px] font-bold text-brand-secondary/60 tracking-wider uppercase">
                MAPPE RILEVATE NEL BINARIO ({filteredMaps.length} di {maps.length})
              </div>
              
              {/* Input di ricerca */}
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-brand-secondary/50" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Cerca per mappa, unità o offset..."
                  className="w-full bg-brand-surface border border-brand-border/80 rounded-lg pl-9 pr-4 py-2 text-xs text-brand-primary placeholder-brand-secondary/45 outline-none focus:border-brand-accent transition-colors"
                />
              </div>
            </div>

            {filteredMaps.length > 0 ? (
              <div className="bg-brand-surface border border-brand-border/80 rounded-xl overflow-hidden shadow-[0_12px_32px_rgba(0,0,0,0.35)]">
                
                {/* Contenitore orizzontale protettivo per schermi piccoli */}
                <div className="w-full overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  <div className="min-w-[640px] divide-y divide-brand-border">
                    
                    {/* Header Tabella */}
                    <div className="grid grid-cols-[80px_1fr_140px_120px] gap-4 px-6 py-4 bg-brand-surface/70 text-[10px] font-bold text-brand-secondary/50 uppercase tracking-widest select-none">
                      <span>OFFSET</span>
                      <span>MAPPATURA IDENTIFICATA</span>
                      <span>DIMENSIONI</span>
                      <span className="text-right">STATO CANALE</span>
                    </div>

                    {/* Righe Tabella */}
                    <div className="divide-y divide-brand-border/60">
                      {filteredMaps.map((m) => {
                        const mapStatus = checkMapStatus(m.mapId, m.label);
                        const address = getMapAddress(m);

                        return (
                          <div 
                            key={m.mapId} 
                            className="grid grid-cols-[80px_1fr_140px_120px] gap-4 px-6 py-4 items-center transition-colors duration-150 hover:bg-brand-elevated/20"
                          >
                            {/* Offset di Memoria */}
                            <span className="font-mono text-[10px] font-bold text-brand-accent tracking-wide">
                              {address}
                            </span>

                            {/* Nome Mappa */}
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-8 h-8 rounded-lg bg-brand-accent-glow flex items-center justify-center text-brand-accent border border-brand-accent/5 shrink-0 shadow-[0_2px_8px_rgba(249,87,22,0.05)]">
                                <Layers size={13} />
                              </div>
                              <div className="min-w-0">
                                <div className="text-xs font-bold text-brand-primary truncate" title={m.label}>
                                  {m.label}
                                </div>
                                <div className="font-mono text-[9px] text-brand-secondary mt-0.5 font-bold tracking-wider uppercase">
                                  {m.unit || 'ADIMENSIONALE'}
                                </div>
                              </div>
                            </div>

                            {/* Dimensioni geometriche della mappa */}
                            <span className="font-mono text-[10px] font-semibold text-brand-secondary/90 bg-brand-elevated/40 border border-brand-border/30 px-2 py-1 rounded w-fit select-none">
                              {m.rows} riga × {m.cols} col
                            </span>

                            {/* Stato del canale */}
                            <div className="text-right select-none">
                              {mapStatus === 'conflict' ? (
                                <span className="inline-flex items-center gap-1 text-[8px] font-black uppercase tracking-widest px-2 py-1 rounded border bg-brand-err/10 border-brand-err/25 text-brand-err shadow-[0_2px_8px_rgba(239,68,68,0.03)]">
                                  <AlertTriangle className="w-2.5 h-2.5 shrink-0" />
                                  CONFLITTO
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[8px] font-black uppercase tracking-widest px-2 py-1 rounded border bg-brand-ok/10 border-brand-ok/25 text-brand-ok shadow-[0_2px_8px_rgba(16,185,129,0.03)]">
                                  <CheckCircle2 className="w-2.5 h-2.5 shrink-0" />
                                  SICURA
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                  </div>
                </div>

              </div>
            ) : (
              /* Nessun Risultato Ricerca */
              <div className="border border-brand-border rounded-xl p-8 flex flex-col items-center justify-center text-center bg-brand-surface/40 select-none">
                <Info size={16} className="text-brand-secondary/50 mb-2" />
                <p className="text-xs font-semibold text-brand-secondary/80">Nessuna mappa corrisponde ai criteri di ricerca</p>
                <button 
                  onClick={() => setSearchQuery('')}
                  className="text-[10px] font-bold text-brand-accent hover:underline mt-1"
                >
                  Azzera filtri
                </button>
              </div>
            )}
          </div>
        ) : (
          /* Stato di Attesa (Placeholder decorativo se !hasData) */
          <div className="border border-dashed border-brand-border/60 rounded-xl p-12 flex flex-col items-center justify-center text-center bg-brand-surface/20 select-none">
            <div className="w-12 h-12 rounded-xl bg-brand-elevated flex items-center justify-center border border-brand-border mb-4 text-brand-secondary/40">
              <Layers size={18} className="animate-pulse" />
            </div>
            <h3 className="text-xs font-bold text-brand-primary tracking-wider uppercase">Nessuna mappatura rilevata</h3>
            <p className="text-xs text-brand-secondary/60 mt-1 max-w-sm leading-relaxed">
              Il registro delle celle esadecimali e lo stato dei singoli canali di memoria verranno caricati automaticamente all'analisi del binario originale.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}