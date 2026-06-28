'use client';
import { useState, useRef, useEffect, MouseEvent } from 'react';
import { useSession } from '@/lib/store';

export default function MapGrid() {
  const {
    maps,
    activeMapId,
    status,
    selectedKeys,
    pendingDeltas,
    toggleCell,
    setRangeSelection,
    clearSelection,
    applyMath,
    applyInterpolate,
    applyStage1EGR,
    applyHardcutLimit,
    commitPatch
  } = useSession();

  const [mathInput, setMathInput] = useState('');
  const [mathErr, setMathErr] = useState<string | null>(null);
  const [show3d, setShow3d] = useState(true);
  
  // Parametri di rotazione della visualizzazione 3D
  const [rotX, setRotX] = useState(-0.5);
  const [rotY, setRotY] = useState(0.6);
  const isDragging3d = useRef(false);
  const dragStart3d = useRef({ x: 0, y: 0 });

  const map = maps.find((m) => m.mapId === activeMapId);
  const dragStart = useRef<{ col: number; row: number } | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Forza l'aggiornamento del grafico 3D Canvas se cambia la mappa, la rotazione o i delta pendenti
  useEffect(() => {
    if (!map || !show3d || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    const cellMap = new Map(map.cells.map(c => [`${c.col},${c.row}`, c.physical]));
    const getVal = (col: number, row: number) => {
      const d = pendingDeltas.get(`${col},${row}`);
      return d ? d.newPhysical : (cellMap.get(`${col},${row}`) ?? 0);
    };

    const rows = map.rows;
    const cols = map.cols;

    // Trova min e max per mappare le altezze e i colori termici
    const rawValues: number[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        rawValues.push(getVal(c, r));
      }
    }
    const minVal = Math.min(...rawValues);
    const maxVal = Math.max(...rawValues);
    const range = maxVal - minVal || 1;

    // Proiezione isometrica con rotazione tridimensionale interattiva
    const drawGrid3D = () => {
      ctx.lineWidth = 1.2;
      const scaleX = (width * 0.45) / cols;
      const scaleY = (height * 0.45) / rows;
      const scaleZ = 80; // Fattore di amplificazione z-axis

      const cx = width / 2;
      const cy = height / 2 + 30;

      // Generazione e trasformazione dei vertici della mappa
      const vertices: { x: number; y: number; z: number; col: number; row: number; val: number }[][] = [];
      for (let r = 0; r < rows; r++) {
        const rowVertices = [];
        for (let c = 0; c < cols; c++) {
          const val = getVal(c, r);
          // Coord normalizzate (-1 a 1)
          const nx = (c - cols / 2) / (cols / 2);
          const ny = (r - rows / 2) / (rows / 2);
          const nz = (val - minVal) / range - 0.5; // normalizzato intorno a zero

          // Rotazione Y (sinistra-destra)
          let x1 = nx * Math.cos(rotY) - nz * Math.sin(rotY);
          let z1 = nx * Math.sin(rotY) + nz * Math.cos(rotY);

          // Rotazione X (alto-basso)
          let y1 = ny * Math.cos(rotX) - z1 * Math.sin(rotX);
          let z2 = ny * Math.sin(rotX) + z1 * Math.cos(rotX);

          // Moltiplicazione scala
          const px = cx + x1 * scaleX * cols * 0.8;
          const py = cy + y1 * scaleY * rows * 0.8 - (nz + 0.5) * scaleZ;

          rowVertices.push({ x: px, y: py, z: z2, col: c, row: r, val });
        }
        vertices.push(rowVertices);
      }

      // Rendering delle facce della superficie con sfumature termiche basate sull'altezza reale
      for (let r = 0; r < rows - 1; r++) {
        for (let c = 0; c < cols - 1; c++) {
          const v0 = vertices[r]?.[c];
          const v1 = vertices[r]?.[c + 1];
          const v2 = vertices[r + 1]?.[c + 1];
          const v3 = vertices[r + 1]?.[c];

          if (!v0 || !v1 || !v2 || !v3) continue;

          // Calcolo colore della faccia in base alla media dei valori di altezza
          const avgVal = (v0.val + v1.val + v2.val + v3.val) / 4;
          const t = (avgVal - minVal) / range;
          
          let faceColor = '';
          if (t < 0.25) faceColor = `rgba(30, 58, 138, ${0.4 + t})`;
          else if (t < 0.5) faceColor = `rgba(37, 99, 235, ${0.4 + (t - 0.25) * 2})`;
          else if (t < 0.75) faceColor = `rgba(234, 179, 8, ${0.4 + (t - 0.5) * 2})`;
          else faceColor = `rgba(220, 38, 38, ${0.5 + (t - 0.75) * 2})`;

          ctx.beginPath();
          ctx.moveTo(v0.x, v0.y);
          ctx.lineTo(v1.x, v1.y);
          ctx.lineTo(v2.x, v2.y);
          ctx.lineTo(v3.x, v3.y);
          ctx.closePath();
          ctx.fillStyle = faceColor;
          ctx.fill();

          // Contorno fil di ferro (wireframe)
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
          ctx.stroke();
        }
      }
    };

    drawGrid3D();
  }, [map, show3d, rotX, rotY, pendingDeltas]);

  if (status === 'idle') {
    return (
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 16,
        background: 'var(--bg-base)'
      }}>
        <div style={{ fontSize: 64, color: 'var(--accent)', textShadow: '0 0 15px var(--accent-glow)' }}>⚙</div>
        <div style={{ color: 'var(--text-secondary)', fontSize: 13, textAlign: 'center', lineHeight: 1.8 }}>
          Nessun binario caricato in memoria.<br/>
          <span style={{ color: 'var(--accent)', cursor: 'pointer', fontWeight: 600 }}>Carica un file originale (.bin)</span> per iniziare.
        </div>
      </div>
    );
  }

  if (status === 'parsing') {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, background: 'var(--bg-base)' }}>
        <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--accent)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          Elaborazione file in corso...
        </div>
        <div style={{ width: 250, height: 2, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ height: '100%', background: 'var(--accent)', borderRadius: 2, animation: 'scan 1.2s ease infinite' }} />
        </div>
        <style>{`@keyframes scan { 0%{width:0;margin-left:0} 50%{width:70%;margin-left:15%} 100%{width:0;margin-left:100%} }`}</style>
      </div>
    );
  }

  if (!map) return null;

  const colCount = map.cols;
  const rowCount = map.rows;

  const originalCells = new Map(map.cells.map(c => [`${c.col},${c.row}`, c.physical]));

  const getDisplayVal = (c: number, r: number) => {
    const delta = pendingDeltas.get(`${c},${r}`);
    return delta ? delta.newPhysical : (originalCells.get(`${c},${r}`) ?? 0);
  };

  const getDeltaValue = (c: number, r: number) => {
    const orig = originalCells.get(`${c},${r}`) ?? 0;
    const curr = getDisplayVal(c, r);
    return curr - orig;
  };

  function heatColor(v: number, min: number, max: number): string {
    const t = (v - min) / (max - min || 1);
    if (t < 0.25) return `rgba(26, 54, 93, 0.85)`; // Blu freddo
    if (t < 0.5)  return `rgba(37, 99, 235, 0.75)`; // Azzurro transitorio
    if (t < 0.7)  return `rgba(180, 110, 10, 0.75)`; // Giallo carico
    return `rgba(185, 28, 28, 0.85)`; // Rosso picco
  }

  const values = map.cells.map((c) => c.physical);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);

  // Gestione selezioni tabelle
  const onCellDown = (e: MouseEvent<HTMLDivElement>, col: number, row: number) => {
    e.preventDefault();
    dragStart.current = { col, row };
    toggleCell(col, row, e.shiftKey || e.ctrlKey || e.metaKey);
  };

  const onCellEnter = (col: number, row: number) => {
    if (!dragStart.current) return;
    setRangeSelection(dragStart.current.col, dragStart.current.row, col, row);
  };

  const executeMath = () => {
    const sym = mathInput.trim().substring(0, 1);
    const valStr = mathInput.trim().substring(1);
    const num = parseFloat(valStr);

    if (isNaN(num)) {
      setMathErr('Usa sintassi corretta: +10, -5, *1.08, =350');
      return;
    }
    setMathErr(null);
    if (sym === '+') applyMath({ kind: 'add', value: num });
    else if (sym === '-') applyMath({ kind: 'add', value: -num });
    else if (sym === '*') applyMath({ kind: 'multiply', value: num });
    else if (sym === '=') applyMath({ kind: 'set', value: num });
    setMathInput('');
  };

  // Gestione rotazione visualizzatore 3D via mouse dragging
  const handle3DMouseDown = (e: MouseEvent) => {
    isDragging3d.current = true;
    dragStart3d.current = { x: e.clientX, y: e.clientY };
  };

  const handle3DMouseMove = (e: MouseEvent) => {
    if (!isDragging3d.current) return;
    const dx = e.clientX - dragStart3d.current.x;
    const dy = e.clientY - dragStart3d.current.y;
    dragStart3d.current = { x: e.clientX, y: e.clientY };
    setRotY((prev) => prev + dx * 0.012);
    setRotX((prev) => Math.max(-1.4, Math.min(0.2, prev + dy * 0.012)));
  };

  const handle3DMouseUp = () => {
    isDragging3d.current = false;
  };

  // Larghezza di cella fissa e robusta per prevenire allargamenti imprevisti delle colonne
  const cellSize = 56;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg-base)' }}>
      {/* Barra Azioni Rapide Chiptuner */}
      <div className="px-6 py-3 bg-brand-surface border-b border-brand-border flex gap-4 items-center flex-wrap shrink-0">
        <span className="text-[10px] font-extrabold text-brand-secondary tracking-widest uppercase">TUNING ASSISTANT:</span>
        <button onClick={applyStage1EGR} className="px-3 py-1.5 bg-brand-accent-glow hover:bg-brand-accent/30 text-brand-accent border border-brand-accent/40 rounded-lg text-xs font-bold cursor-pointer transition-all duration-150">
          EGR Close (Software Off)
        </button>
        <button onClick={applyHardcutLimit} className="px-3 py-1.5 bg-brand-accent-glow hover:bg-brand-accent/30 text-brand-accent border border-brand-accent/40 rounded-lg text-xs font-bold cursor-pointer transition-all duration-150">
          Hardcut Popcorn + Stage 1
        </button>

        <div className="w-[1px] h-5 bg-brand-border" />

        {selectedKeys.size > 0 && (
          <div className="flex gap-2 items-center">
            <span className="text-xs text-brand-secondary font-semibold">Selezionati ({selectedKeys.size}):</span>
            <input
              value={mathInput}
              onChange={(e) => { setMathInput(e.target.value); setMathErr(null); }}
              placeholder="es. *1.08"
              className="bg-brand-elevated border border-brand-border-bright text-white rounded-lg px-2 py-1 w-20 text-xs outline-none font-mono focus:border-brand-accent"
              onKeyDown={(e) => { if (e.key === 'Enter') executeMath(); }}
            />
            <button onClick={executeMath} className="px-3 py-1 bg-brand-border-bright hover:bg-brand-hover text-white rounded-md text-xs cursor-pointer">Applica</button>
            <button onClick={applyInterpolate} className="px-3 py-1 bg-brand-accent hover:bg-brand-accent/90 text-white font-bold rounded-md text-xs cursor-pointer shadow-[0_0_8px_var(--color-brand-accent)]">Interpolazione 2D</button>
            {mathErr && <span className="text-brand-err text-[10px] font-bold">{mathErr}</span>}
          </div>
        )}

        <div className="flex-grow" />

        <button onClick={() => setShow3d(!show3d)} className="px-4 py-1.5 bg-brand-elevated border border-brand-border hover:bg-brand-hover text-brand-primary text-xs font-bold rounded-lg cursor-pointer">
          {show3d ? 'Nascondi Grafico 3D' : 'Mostra Grafico 3D'}
        </button>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Griglia Valori Professionale */}
        <div className="flex-1 overflow-auto p-6 relative">
          <div className="flex justify-between items-center mb-4 shrink-0">
            <div>
              <h3 className="text-sm font-bold text-white tracking-wide uppercase">{map.label}</h3>
              <p className="text-[10px] text-brand-secondary mt-0.5 font-semibold">
                Asse X: {map.xAxis?.label ?? 'Colonna'} ({map.xAxis?.unit}) | Asse Y: {map.yAxis?.label ?? 'Riga'} ({map.yAxis?.unit})
              </p>
            </div>
            {pendingDeltas.size > 0 && (
              <button onClick={commitPatch} className="px-4 py-2 bg-brand-accent text-white font-extrabold text-xs rounded-lg hover:bg-brand-accent/90 cursor-pointer shadow-[0_0_12px_rgba(249,87,22,0.4)] tracking-wide uppercase">
                Applica Modifiche & Checksum ({pendingDeltas.size})
              </button>
            )}
          </div>

          {/* Griglia di taratura a larghezza fissa per evitare distorsioni */}
          <div className="inline-block relative min-w-max pb-8" onMouseUp={() => { dragStart.current = null; }}>
            {/* Header Assi X (RPM o Pressione) */}
            <div className="flex" style={{ marginLeft: 64 }}>
              {Array.from({ length: colCount }, (_, c) => {
                const headerValue = map.xAxis?.values[c];
                return (
                  <div key={c} style={{
                    width: cellSize, fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)',
                    textAlign: 'center', paddingBottom: 6, borderBottom: '1px solid var(--border)', fontWeight: 700
                  }}>
                    {headerValue !== undefined ? headerValue : c}
                  </div>
                );
              })}
            </div>

            {/* Righe Tabella con Assi Y */}
            {Array.from({ length: rowCount }, (_, r) => {
              const yHeader = map.yAxis?.values[r];
              return (
                <div key={r} className="flex items-center">
                  {/* Header Asse Y */}
                  <div style={{
                    width: 58, paddingRight: 8, textAlign: 'right', fontSize: 9,
                    fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', fontWeight: 700, flexShrink: 0
                  }}>
                    {yHeader !== undefined ? yHeader : r}
                  </div>

                  {/* Celle Dati */}
                  {Array.from({ length: colCount }, (_, c) => {
                    const key = `${c},${r}`;
                    const val = getDisplayVal(c, r);
                    const delta = getDeltaValue(c, r);
                    const isSelected = selectedKeys.has(key);

                    return (
                      <div
                        key={c}
                        onMouseDown={(e) => onCellDown(e, c, r)}
                        onMouseEnter={() => onCellEnter(c, r)}
                        style={{
                          width: cellSize, height: 26, background: isSelected ? 'var(--accent)' : heatColor(val, minVal, maxVal),
                          border: isSelected ? '1.5px solid #fff' : '1px solid rgba(0,0,0,0.25)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          cursor: 'crosshair', position: 'relative', transition: 'background 0.05s', flexShrink: 0
                        }}
                      >
                        <span style={{
                          fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: isSelected ? 800 : 600,
                          color: '#ffffff', textShadow: '0 1px 2px rgba(0,0,0,0.85)'
                        }}>
                          {val.toFixed(1)}
                        </span>
                        {delta !== 0 && (
                          <div style={{
                            position: 'absolute', bottom: 1, right: 2, fontSize: 7, fontWeight: 800,
                            color: delta > 0 ? '#4ade80' : '#f87171', textShadow: '0 1px 1px rgba(0,0,0,0.9)'
                          }}>
                            {delta > 0 ? `+${delta.toFixed(0)}` : delta.toFixed(0)}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>

          <div className="mt-4 text-[10px] text-brand-secondary/80 font-semibold font-mono">
            * ESC per annullare la selezione. Clicca e trascina per selezionare intervalli bidimensionali.
          </div>
        </div>

        {/* Visualizzazione 3D ed Hex Dump laterali */}
        {show3d && (
          <div className="w-[380px] shrink-0 border-l border-brand-border bg-brand-surface flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b border-brand-border text-xs font-bold text-white uppercase tracking-wider bg-brand-surface/40">
              ANALISI GEO-MAPPA 3D (Trascina per ruotare)
            </div>
            <div className="flex-1 relative bg-[#030507] flex justify-center items-center overflow-hidden">
              <canvas
                ref={canvasRef}
                width={360}
                height={320}
                onMouseDown={handle3DMouseDown}
                onMouseMove={handle3DMouseMove}
                onMouseUp={handle3DMouseUp}
                onMouseLeave={handle3DMouseUp}
                style={{ cursor: isDragging3d.current ? 'grabbing' : 'grab' }}
              />
            </div>

            {/* Ispezione Esadecimale in tempo reale */}
            <div className="h-[180px] border-t border-brand-border flex flex-col bg-[#05070a]">
              <div className="px-4 py-2 border-b border-brand-border text-[9px] font-extrabold text-brand-secondary tracking-widest uppercase">
                RAW MEMORY HEX DUMP
              </div>
              <div className="flex-1 p-4 overflow-y-auto font-mono text-[10px] text-brand-secondary/80 leading-relaxed">
                {Array.from({ length: Math.min(6, Math.ceil(map.cells.length / 8)) }, (_, rowIdx) => {
                  const chunkCells = map.cells.slice(rowIdx * 8, (rowIdx + 1) * 8);
                  const hexVals = chunkCells.map(c => {
                    const val = getDisplayVal(c.col, c.row);
                    return Math.min(65535, Math.max(0, Math.round(val))).toString(16).padStart(4, '0').toUpperCase();
                  }).join(' ');
                  const asciiVals = chunkCells.map(c => {
                    const val = getDisplayVal(c.col, c.row);
                    const charCode = Math.round(val) % 128;
                    return charCode >= 32 && charCode < 127 ? String.fromCharCode(charCode) : '.';
                  }).join('');

                  return (
                    <div key={rowIdx} className="flex justify-between font-mono">
                      <span className="text-brand-accent">{(rowIdx * 16).toString(16).padStart(6, '0').toUpperCase()}</span>
                      <span className="text-[#e2e8f0]">{hexVals}</span>
                      <span className="text-brand-muted">| {asciiVals} |</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
