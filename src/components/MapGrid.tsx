'use client';

import { useState, useRef, useEffect, MouseEvent } from 'react';
import { useSession } from '@/lib/store';
import { Percent, ArrowUpRight, CheckSquare, RotateCcw } from 'lucide-react';

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
    selectAll,
    revertSelected,
    applyMath,
    applyInterpolate,
    applyStage1EGR,
    applyHardcutLimit,
    commitPatch
  } = useSession();

  const [mathInput, setMathInput] = useState('');
  const [mathErr, setMathErr] = useState<string | null>(null);
  const [show3d, setShow3d] = useState(true);
  
  // Stato per il Context Menu di grado AAA
  const [contextMenu, setContextMenu] = useState<{ visible: boolean; x: number; y: number } | null>(null);
  
  const rotXRef = useRef(-0.5);
  const rotYRef = useRef(0.6);
  const isDragging3d = useRef(false);
  const isHovered3d = useRef(false);
  const dragStart3d = useRef({ x: 0, y: 0 });
  const targetRotationSpeed = useRef(0.0035);
  const currentRotationSpeed = useRef(0.0035);

  const map = maps.find((m) => m.mapId === activeMapId);
  const dragStart = useRef<{ col: number; row: number } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        clearSelection();
        setContextMenu(null);
      }
    };
    const handleClick = () => setContextMenu(null);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('click', handleClick);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('click', handleClick);
    };
  }, [clearSelection]);

  useEffect(() => {
    if (!map || !show3d || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;

    const renderLoop = () => {
      const isInteracting = isHovered3d.current || isDragging3d.current;
      const targetSpeed = isInteracting ? 0 : targetRotationSpeed.current;
      currentRotationSpeed.current += (targetSpeed - currentRotationSpeed.current) * 0.08;

      if (!isDragging3d.current) rotYRef.current += currentRotationSpeed.current;

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
      const rawValues: number[] = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) rawValues.push(getVal(c, r));
      }
      const minVal = Math.min(...rawValues);
      const maxVal = Math.max(...rawValues);
      const range = maxVal - minVal || 1;

      ctx.lineWidth = 1.2;
      const scaleX = (width * 0.45) / cols;
      const scaleY = (height * 0.45) / rows;
      const scaleZ = 80;
      const cx = width / 2;
      const cy = height / 2 + 30;
      const currentRotY = rotYRef.current;
      const currentRotX = rotXRef.current;

      const vertices: { x: number; y: number; z: number; col: number; row: number; val: number }[][] = [];
      for (let r = 0; r < rows; r++) {
        const rowVertices = [];
        for (let c = 0; c < cols; c++) {
          const val = getVal(c, r);
          const nx = (c - cols / 2) / (cols / 2);
          const ny = (r - rows / 2) / (rows / 2);
          const nz = (val - minVal) / range - 0.5;

          let x1 = nx * Math.cos(currentRotY) - nz * Math.sin(currentRotY);
          let z1 = nx * Math.sin(currentRotY) + nz * Math.cos(currentRotY);
          let y1 = ny * Math.cos(currentRotX) - z1 * Math.sin(currentRotX);
          let z2 = ny * Math.sin(currentRotX) + z1 * Math.cos(currentRotX);

          const px = cx + x1 * scaleX * cols * 0.8;
          const py = cy + y1 * scaleY * rows * 0.8 - (nz + 0.5) * scaleZ;
          rowVertices.push({ x: px, y: py, z: z2, col: c, row: r, val });
        }
        vertices.push(rowVertices);
      }

      for (let r = 0; r < rows - 1; r++) {
        for (let c = 0; c < cols - 1; c++) {
          const v0 = vertices[r]?.[c], v1 = vertices[r]?.[c + 1];
          const v2 = vertices[r + 1]?.[c + 1], v3 = vertices[r + 1]?.[c];
          if (!v0 || !v1 || !v2 || !v3) continue;

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
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
          ctx.stroke();
        }
      }
      animationFrameId = requestAnimationFrame(renderLoop);
    };

    renderLoop();
    return () => cancelAnimationFrame(animationFrameId);
  }, [map, show3d, pendingDeltas]);

  if (status === 'idle') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-5 p-8 bg-brand-base min-h-[400px] select-none text-center">
        <div className="w-16 h-16 rounded-2xl bg-brand-surface border border-brand-border flex items-center justify-center shadow-lg animate-bounce duration-1000">
          <span className="text-3xl text-brand-accent drop-shadow-[0_0_15px_rgba(249,87,22,0.3)]">⚙</span>
        </div>
        <div className="space-y-1">
          <h3 className="text-xs font-bold text-brand-primary tracking-wider uppercase">Nessuna Mappa Caricata</h3>
          <p className="text-xs text-brand-secondary/70 leading-relaxed max-w-sm">
            Nessun binario caricato in memoria. <span className="text-brand-accent font-bold hover:underline cursor-pointer">Carica un file originale (.bin)</span> per iniziare.
          </p>
        </div>
      </div>
    );
  }

  if (status === 'parsing') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8 bg-brand-base select-none">
        <div className="text-[10px] font-mono font-black text-brand-accent tracking-[0.2em] uppercase animate-pulse">
          Elaborazione file in corso...
        </div>
        <div className="w-64 h-1 bg-brand-elevated rounded-full overflow-hidden border border-brand-border/40 relative">
          <div className="h-full bg-brand-accent rounded-full absolute left-0" style={{ width: '40%', animation: 'scan-infinite 1.4s ease-in-out infinite' }} />
        </div>
        <style>{`@keyframes scan-infinite { 0% { left: -40%; } 100% { left: 100%; } }`}</style>
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
    if (t < 0.25) return `rgba(26, 54, 93, 0.85)`;
    if (t < 0.5)  return `rgba(37, 99, 235, 0.75)`;
    if (t < 0.7)  return `rgba(180, 110, 10, 0.75)`;
    return `rgba(185, 28, 28, 0.85)`;
  }

  const values = map.cells.map((c) => c.physical);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);

  const onCellDown = (e: MouseEvent<HTMLDivElement>, col: number, row: number) => {
    if (e.button === 2) return; // Ignora il right-click per la logica di drag nativa
    e.preventDefault();
    dragStart.current = { col, row };
    toggleCell(col, row, e.shiftKey || e.ctrlKey || e.metaKey);
  };

  const onCellEnter = (col: number, row: number) => {
    if (!dragStart.current) return;
    setRangeSelection(dragStart.current.col, dragStart.current.row, col, row);
  };

  const handleCellContextMenu = (e: MouseEvent<HTMLDivElement>, col: number, row: number) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Se la cella cliccata non è nei selezionati, seleziona in esclusiva quella
    const key = `${col},${row}`;
    if (!selectedKeys.has(key)) {
      toggleCell(col, row, false);
    }
    
    setContextMenu({ visible: true, x: e.clientX, y: e.clientY });
  };

  const executeMath = () => {
    const sym = mathInput.trim().substring(0, 1);
    const valStr = mathInput.trim().substring(1);
    const num = parseFloat(valStr);

    if (isNaN(num)) {
      setMathErr('Usa sintassi: +10, -5, *1.08, =350');
      return;
    }
    setMathErr(null);
    if (sym === '+') applyMath({ kind: 'add', value: num });
    else if (sym === '-') applyMath({ kind: 'add', value: -num });
    else if (sym === '*') applyMath({ kind: 'multiply', value: num });
    else if (sym === '=') applyMath({ kind: 'set', value: num });
    setMathInput('');
  };

  const handle3DMouseDown = (e: MouseEvent<HTMLCanvasElement>) => {
    isDragging3d.current = true;
    dragStart3d.current = { x: e.clientX, y: e.clientY };
    if (canvasRef.current) canvasRef.current.style.cursor = 'grabbing';
  };
  const handle3DMouseMove = (e: MouseEvent<HTMLCanvasElement>) => {
    if (!isDragging3d.current) return;
    const dx = e.clientX - dragStart3d.current.x;
    const dy = e.clientY - dragStart3d.current.y;
    dragStart3d.current = { x: e.clientX, y: e.clientY };
    rotYRef.current += dx * 0.012;
    rotXRef.current = Math.max(-1.4, Math.min(0.2, rotXRef.current + dy * 0.012));
  };
  const handle3DMouseUp = () => {
    isDragging3d.current = false;
    if (canvasRef.current) canvasRef.current.style.cursor = isHovered3d.current ? 'grab' : 'default';
  };

  const cellSize = 56;

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-brand-base">
      
      {/* Context Menu (Injected in Body / Absolute Overlay) */}
      {contextMenu?.visible && (
        <div
          className="fixed z-[100] w-64 bg-brand-elevated border border-brand-border/80 rounded-xl shadow-[0_16px_40px_rgba(0,0,0,0.7)] py-1.5 overflow-hidden backdrop-blur-xl animate-in fade-in zoom-in-95 duration-100 select-none"
          style={{
            top: Math.min(contextMenu.y, typeof window !== 'undefined' ? window.innerHeight - 300 : 0),
            left: Math.min(contextMenu.x, typeof window !== 'undefined' ? window.innerWidth - 260 : 0)
          }}
          onContextMenu={(e) => e.preventDefault()}
          onClick={(e) => e.stopPropagation()}
        >
           <div className="px-3.5 py-2 border-b border-brand-border/60 flex items-center justify-between">
              <span className="text-[9px] font-black tracking-widest text-brand-secondary/60 uppercase">
                TUNING RAPIDO
              </span>
              <span className="text-[10px] font-bold text-brand-accent bg-brand-accent-glow px-1.5 py-0.5 rounded border border-brand-accent/20">
                {selectedKeys.size > 0 ? `${selectedKeys.size} Celle` : '---'}
              </span>
           </div>

           <div className="p-1">
             <button onClick={() => { applyMath({kind: 'multiply', value: 1.05}); setContextMenu(null); }} className="w-full text-left px-3 py-2 rounded-lg hover:bg-brand-surface text-[11px] font-semibold text-brand-primary flex items-center gap-3 transition-colors group">
                <Percent className="w-3.5 h-3.5 text-brand-accent group-hover:scale-110 transition-transform" /> Aumenta +5% (x1.05)
             </button>
             <button onClick={() => { applyMath({kind: 'multiply', value: 1.10}); setContextMenu(null); }} className="w-full text-left px-3 py-2 rounded-lg hover:bg-brand-surface text-[11px] font-semibold text-brand-primary flex items-center gap-3 transition-colors group">
                <Percent className="w-3.5 h-3.5 text-brand-accent group-hover:scale-110 transition-transform" /> Aumenta +10% (x1.10)
             </button>
             <button onClick={() => { applyMath({kind: 'multiply', value: 0.95}); setContextMenu(null); }} className="w-full text-left px-3 py-2 rounded-lg hover:bg-brand-surface text-[11px] font-semibold text-brand-primary flex items-center gap-3 transition-colors group">
                <Percent className="w-3.5 h-3.5 text-brand-cyan group-hover:scale-110 transition-transform" /> Riduci -5% (x0.95)
             </button>
           </div>

           <div className="h-[1px] bg-brand-border/60 mx-2" />

           <div className="p-1">
             <button
               onClick={() => { applyInterpolate(); setContextMenu(null); }}
               disabled={selectedKeys.size < 4}
               className="w-full text-left px-3 py-2 rounded-lg hover:bg-brand-surface disabled:hover:bg-transparent disabled:opacity-30 text-[11px] font-semibold text-brand-primary flex items-center gap-3 transition-colors group"
             >
                <ArrowUpRight className="w-3.5 h-3.5 text-brand-ok group-hover:-translate-y-0.5 group-hover:translate-x-0.5 transition-transform" /> Interpolazione 2D {selectedKeys.size < 4 ? '(Min 4)' : ''}
             </button>
           </div>

           <div className="h-[1px] bg-brand-border/60 mx-2" />

           <div className="p-1">
             <button onClick={() => { selectAll(); setContextMenu(null); }} className="w-full text-left px-3 py-2 rounded-lg hover:bg-brand-surface text-[11px] font-semibold text-brand-primary flex items-center gap-3 transition-colors group">
                <CheckSquare className="w-3.5 h-3.5 text-brand-secondary/80 group-hover:text-white transition-colors" /> Seleziona Mappa Intera
             </button>
             <button onClick={() => { revertSelected(); setContextMenu(null); }} className="w-full text-left px-3 py-2 rounded-lg hover:bg-brand-err/10 text-[11px] font-bold text-brand-err flex items-center gap-3 transition-colors group">
                <RotateCcw className="w-3.5 h-3.5 text-brand-err group-hover:-rotate-45 transition-transform" /> Annulla Modifiche (Restore)
             </button>
           </div>
        </div>
      )}

      {/* Toolbar Azioni Chiptuner */}
      <div className="px-6 py-3 bg-brand-surface border-b border-brand-border flex gap-4 items-center flex-wrap shrink-0 select-none">
        <span className="text-[10px] font-black text-brand-secondary/60 tracking-wider uppercase">TUNING ASSISTANT:</span>
        <button 
          onClick={applyStage1EGR} 
          className="px-3.5 py-1.5 bg-brand-accent-glow hover:bg-brand-accent/25 text-brand-accent border border-brand-accent/40 rounded-lg text-xs font-bold cursor-pointer transition-all duration-150 active:scale-[0.98]"
        >
          EGR Close (Software Off)
        </button>
        <button 
          onClick={applyHardcutLimit} 
          className="px-3.5 py-1.5 bg-brand-accent-glow hover:bg-brand-accent/25 text-brand-accent border border-brand-accent/40 rounded-lg text-xs font-bold cursor-pointer transition-all duration-150 active:scale-[0.98]"
        >
          Hardcut Popcorn + Stage 1
        </button>

        <div className="w-[1px] h-5 bg-brand-border" />

        {selectedKeys.size > 0 && (
          <div className="flex gap-2.5 items-center bg-brand-elevated/40 px-3 py-1 rounded-lg border border-brand-border/60">
            <span className="text-xs text-brand-secondary font-bold">Selezionati ({selectedKeys.size}):</span>
            <input
              value={mathInput}
              onChange={(e) => { setMathInput(e.target.value); setMathErr(null); }}
              placeholder="es. *1.08"
              className="bg-brand-elevated border border-brand-border text-white rounded-lg px-2.5 py-1 w-20 text-xs outline-none font-mono focus:border-brand-accent transition-colors"
              onKeyDown={(e) => { if (e.key === 'Enter') executeMath(); }}
            />
            <button 
              onClick={executeMath} 
              className="px-3 py-1 bg-brand-border-bright hover:bg-brand-border-bright/80 text-white rounded-md text-xs font-semibold cursor-pointer active:scale-95"
            >
              Applica
            </button>
            <button 
              onClick={applyInterpolate} 
              className="px-3 py-1 bg-brand-accent hover:bg-brand-accent/95 text-white font-bold rounded-md text-xs cursor-pointer shadow-[0_2px_8px_rgba(249,87,22,0.3)] active:scale-95"
            >
              Interpolazione 2D
            </button>
            {mathErr && (
              <span className="text-brand-err text-[10px] font-bold tracking-wide animate-pulse">{mathErr}</span>
            )}
          </div>
        )}

        <div className="flex-grow" />

        <button 
          onClick={() => setShow3d(!show3d)} 
          className="px-4 py-1.5 bg-brand-elevated border border-brand-border hover:bg-brand-elevated-hover text-brand-primary text-xs font-bold rounded-lg cursor-pointer transition-colors active:scale-95"
        >
          {show3d ? 'Nascondi Grafico 3D' : 'Mostra Grafico 3D'}
        </button>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 overflow-auto p-6 relative" onScroll={() => setContextMenu(null)}>
          <div className="flex justify-between items-start mb-5 shrink-0 select-none">
            <div>
              <h3 className="text-sm font-bold text-white tracking-wide uppercase">{map.label}</h3>
              <p className="text-[10px] text-brand-secondary mt-0.5 font-semibold">
                Asse X: {map.xAxis?.label ?? 'Colonna'} ({map.xAxis?.unit}) | Asse Y: {map.yAxis?.label ?? 'Riga'} ({map.yAxis?.unit})
              </p>
            </div>
            {pendingDeltas.size > 0 && (
              <button 
                onClick={commitPatch} 
                className="px-4.5 py-2 bg-brand-accent text-white font-black text-xs rounded-lg hover:bg-brand-accent/90 cursor-pointer shadow-[0_4px_14px_rgba(249,87,22,0.4)] tracking-wide uppercase active:scale-[0.98] transition-all"
              >
                Applica Modifiche & Checksum ({pendingDeltas.size})
              </button>
            )}
          </div>

          <div className="inline-block relative min-w-max pb-8" onMouseUp={() => { dragStart.current = null; }}>
            <div className="flex select-none" style={{ marginLeft: 64 }}>
              {Array.from({ length: colCount }, (_, c) => {
                const headerValue = map.xAxis?.values[c];
                return (
                  <div key={c} style={{ width: cellSize }} className="text-[9px] font-mono font-bold text-brand-secondary/60 text-center pb-1.5 border-b border-brand-border/60">
                    {headerValue !== undefined ? headerValue : c}
                  </div>
                );
              })}
            </div>

            {Array.from({ length: rowCount }, (_, r) => {
              const yHeader = map.yAxis?.values[r];
              return (
                <div key={r} className="flex items-center">
                  <div style={{ width: 58 }} className="pr-2.5 text-right text-[9px] font-mono font-bold text-brand-secondary/60 shrink-0 select-none">
                    {yHeader !== undefined ? yHeader : r}
                  </div>
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
                        onContextMenu={(e) => handleCellContextMenu(e, c, r)}
                        style={{
                          width: cellSize, 
                          height: 26, 
                          background: isSelected ? 'var(--accent)' : heatColor(val, minVal, maxVal),
                          border: isSelected ? '1.5px solid #ffffff' : '1px solid rgba(0,0,0,0.18)',
                        }}
                        className="flex items-center justify-center cursor-crosshair relative transition-all duration-75 shrink-0 hover:brightness-125"
                      >
                        <span style={{ textShadow: '0 1px 2px rgba(0,0,0,0.85)' }} className={`font-mono text-[9px] text-white ${isSelected ? 'font-extrabold' : 'font-semibold'}`}>
                          {val.toFixed(1)}
                        </span>
                        {delta !== 0 && (
                          <div style={{ textShadow: '0 1px 1px rgba(0,0,0,0.9)' }} className={`absolute bottom-0.5 right-1.5 text-[7px] font-black tracking-wide ${delta > 0 ? 'text-green-400' : 'text-red-400'}`}>
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
          <div className="mt-4 text-[10px] text-brand-secondary/60 font-semibold font-mono select-none">
            * ESC per annullare. Clic Destro sulle celle per il menu rapido (Interpolazione, Incrementi % e Restore).
          </div>
        </div>

        {show3d && (
          <div className="w-[380px] shrink-0 border-l border-brand-border bg-brand-surface flex flex-col overflow-hidden select-none">
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
                onMouseEnter={() => { isHovered3d.current = true; }}
                onMouseLeave={() => { isHovered3d.current = false; handle3DMouseUp(); }}
                className="transition-transform duration-75 cursor-grab"
              />
            </div>
            <div className="h-[180px] border-t border-brand-border flex flex-col bg-[#05070a]">
              <div className="px-4 py-2 border-b border-brand-border text-[9px] font-black text-brand-secondary/50 tracking-widest uppercase">
                RAW MEMORY HEX DUMP
              </div>
              <div className="flex-1 p-4 overflow-y-auto font-mono text-[10px] text-brand-secondary/80 leading-relaxed scrollbar-none">
                {Array.from({ length: Math.min(6, Math.ceil(map.cells.length / 8)) }, (_, rowIdx) => {
                  const chunkCells = map.cells.slice(rowIdx * 8, (rowIdx + 1) * 8);
                  const hexVals = chunkCells.map(c => Math.min(65535, Math.max(0, Math.round(getDisplayVal(c.col, c.row)))).toString(16).padStart(4, '0').toUpperCase()).join(' ');
                  const asciiVals = chunkCells.map(c => {
                    const charCode = Math.round(getDisplayVal(c.col, c.row)) % 128;
                    return charCode >= 32 && charCode < 127 ? String.fromCharCode(charCode) : '.';
                  }).join('');
                  return (
                    <div key={rowIdx} className="flex justify-between font-mono font-medium tracking-wide">
                      <span className="text-brand-accent/80 font-bold">{(rowIdx * 16).toString(16).padStart(6, '0').toUpperCase()}</span>
                      <span className="text-[#e2e8f0]">{hexVals}</span>
                      <span className="text-brand-muted opacity-60">| {asciiVals} |</span>
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
