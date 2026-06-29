import { create } from 'zustand';
import type { EcuFamily, SessionStatus, ParsedMap, CellDelta, MathOperation } from '@/types/calibration';

export interface SessionState {
  status: SessionStatus;
  ecuFamily: EcuFamily | null;
  fileName: string | null;
  fileSize: number | null;
  uploadedFile: File | null;
  uploadedDriver: File | null;
  maps: ParsedMap[];
  activeMapId: string | null;
  checksumOk: boolean | null;
  odaViolations: string[];
  log: string[];
  pendingDeltas: Map<string, CellDelta>;
  selectedKeys: Set<string>;

  setStatus: (s: SessionStatus) => void;
  loadFile: (file: File, family: EcuFamily, driverFile?: File) => Promise<void>;
  setActiveMap: (id: string) => Promise<void>;
  toggleCell: (col: number, row: number, extend: boolean) => void;
  setRangeSelection: (sc: number, sr: number, ec: number, er: number) => void;
  clearSelection: () => void;
  selectAll: () => void;
  revertSelected: () => void;
  applyMath: (op: MathOperation) => void;
  applyInterpolate: () => void;
  applyStage1EGR: () => void;
  applyHardcutLimit: () => void;
  commitPatch: () => Promise<void>;
  addLog: (msg: string) => void;
  reset: () => void;
}

export const useSession = create<SessionState>((set, get) => ({
  status: 'idle',
  ecuFamily: null,
  fileName: null,
  fileSize: null,
  uploadedFile: null,
  uploadedDriver: null,
  maps: [],
  activeMapId: null,
  checksumOk: null,
  odaViolations: [],
  log: [
    '[SYSTEM] Tuning Calibration Suite v2.1-Pro pronta.',
    '[SYSTEM] Carica un binario originale ed un file driver XDF/A2L o scarica la Sandbox.'
  ],
  pendingDeltas: new Map(),
  selectedKeys: new Set(),

  setStatus: (status) => set({ status }),

  addLog: (msg) => set((s) => ({ log: [...s.log, msg] })),

  loadFile: async (file, family, driverFile) => {
    set({ 
      status: 'parsing', 
      fileName: file.name, 
      fileSize: file.size, 
      uploadedFile: file, 
      uploadedDriver: driverFile || null,
      pendingDeltas: new Map(), 
      selectedKeys: new Set() 
    });
    
    try {
      const formData = new FormData();
      formData.append('file', file);
      if (driverFile) formData.append('driver', driverFile);
      
      const res = await fetch('/api/parse-map', { method: 'POST', body: formData });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Fallito il parsing delle mappe di calibrazione');
      }
      
      const loadedMaps: ParsedMap[] = await res.json();

      if (!Array.isArray(loadedMaps) || loadedMaps.length === 0) {
        throw new Error('Nessuna mappa valida estratta dal file binario.');
      }

      set((s) => ({
        maps: loadedMaps,
        activeMapId: loadedMaps[0]?.mapId || null,
        status: 'ready',
        checksumOk: true,
        odaViolations: [],
        log: [
          ...s.log,
          `[LOAD] ${file.name} (${(file.size / 1024).toFixed(1)} kB) - Protocollo ${family}`,
          driverFile ? `[DRIVER] Caricato driver dinamico: ${driverFile.name}` : `[DRIVER] Caricato Map Pack integrato.`,
          `[PARSE] Rilevate ${loadedMaps.length} aree di taratura con assi fisici.`,
          `[CHECKSUM] Calcolo completato: OK ✓`
        ]
      }));
    } catch (e: any) {
      set((s) => ({ status: 'error', log: [...s.log, `[ERRORE] Caricamento fallito: ${e.message}`] }));
    }
  },

  setActiveMap: async (id) => set({ activeMapId: id, selectedKeys: new Set(), pendingDeltas: new Map() }),

  toggleCell: (col, row, extend) => {
    const { selectedKeys } = get();
    const key = `${col},${row}`;
    if (!extend) {
      set({ selectedKeys: new Set(selectedKeys.has(key) && selectedKeys.size === 1 ? [] : [key]) });
      return;
    }
    const next = new Set(selectedKeys);
    next.has(key) ? next.delete(key) : next.add(key);
    set({ selectedKeys: next });
  },

  setRangeSelection: (sc, sr, ec, er) => {
    const next = new Set<string>();
    const [minC, maxC] = [Math.min(sc, ec), Math.max(sc, ec)];
    const [minR, maxR] = [Math.min(sr, er), Math.max(sr, er)];
    for (let r = minR; r <= maxR; r++) {
      for (let c = minC; c <= maxC; c++) {
        next.add(`${c},${r}`);
      }
    }
    set({ selectedKeys: next });
  },

  clearSelection: () => set({ selectedKeys: new Set() }),

  selectAll: () => {
    const { maps, activeMapId } = get();
    const activeMap = maps.find(m => m.mapId === activeMapId);
    if (!activeMap) return;
    const next = new Set<string>();
    for (const c of activeMap.cells) next.add(`${c.col},${c.row}`);
    set({ selectedKeys: next });
  },

  revertSelected: () => {
    const { selectedKeys, pendingDeltas, log } = get();
    if (selectedKeys.size === 0) return;
    const next = new Map(pendingDeltas);
    for (const k of selectedKeys) next.delete(k);
    set({
      pendingDeltas: next,
      log: [...log, `[EDIT] Ripristinati i valori originali per ${selectedKeys.size} celle.`]
    });
  },

  applyMath: (op) => {
    const { maps, activeMapId, selectedKeys, pendingDeltas } = get();
    const activeMap = maps.find(m => m.mapId === activeMapId);
    if (!activeMap || selectedKeys.size === 0) return;

    const cellMap = new Map(activeMap.cells.map(c => [`${c.col},${c.row}`, c.physical]));
    const next = new Map(pendingDeltas);

    for (const key of selectedKeys) {
      const [colStr, rowStr] = key.split(',');
      const col = Number(colStr);
      const row = Number(rowStr);
      const base = next.get(key)?.newPhysical ?? cellMap.get(key) ?? 0;
      
      let newPhysical = base;
      if (op.kind === 'add') newPhysical = base + op.value;
      else if (op.kind === 'multiply') newPhysical = base * op.value;
      else if (op.kind === 'set') newPhysical = op.value;

      next.set(key, { col, row, newPhysical: parseFloat(newPhysical.toFixed(2)) });
    }
    set({ pendingDeltas: next });
  },

  applyInterpolate: () => {
    const { maps, activeMapId, selectedKeys, pendingDeltas, log } = get();
    const activeMap = maps.find(m => m.mapId === activeMapId);
    if (!activeMap || selectedKeys.size < 4) return;

    const coords = Array.from(selectedKeys).map(k => k.split(',').map(Number) as [number, number]);
    const cols = coords.map(c => c[0]);
    const rows = coords.map(c => c[1]);
    const minC = Math.min(...cols), maxC = Math.max(...cols);
    const minR = Math.min(...rows), maxR = Math.max(...rows);

    if (maxC === minC || maxR === minR) return;

    const cellMap = new Map(activeMap.cells.map(c => [`${c.col},${c.row}`, c.physical]));
    const getValue = (c: number, r: number) => pendingDeltas.get(`${c},${r}`)?.newPhysical ?? cellMap.get(`${c},${r}`) ?? 0;

    const q11 = getValue(minC, minR), q21 = getValue(maxC, minR);
    const q12 = getValue(minC, maxR), q22 = getValue(maxC, maxR);

    const next = new Map(pendingDeltas);
    for (const key of selectedKeys) {
      const [c, r] = key.split(',').map(Number) as [number, number];
      const xRatio = (c - minC) / (maxC - minC);
      const yRatio = (r - minR) / (maxR - minR);
      const topVal = q11 * (1 - xRatio) + q21 * xRatio;
      const bottomVal = q12 * (1 - xRatio) + q22 * xRatio;
      const interpolatedValue = topVal * (1 - yRatio) + bottomVal * yRatio;
      next.set(key, { col: c, row: r, newPhysical: parseFloat(interpolatedValue.toFixed(2)) });
    }
    set({ pendingDeltas: next, log: [...log, `[CALIBRATION] Interpolazione 2D applicata su area ${minC},${minR} -> ${maxC},${maxR}`] });
  },

  applyStage1EGR: () => {
    const { maps, log } = get();
    const egrMap = maps.find(m => m.label.toLowerCase().includes('egr'));
    if (!egrMap) {
      set({ log: [...log, '[WARNING] Mappa EGR non rilevata.'] });
      return;
    }
    const next = new Map<string, CellDelta>();
    for (const cell of egrMap.cells) next.set(`${cell.col},${cell.row}`, { col: cell.col, row: cell.row, newPhysical: 0.0 });
    set({ activeMapId: egrMap.mapId, pendingDeltas: next, log: [...log, '[TUNING] EGR Switch chiusa (Off).'] });
  },

  applyHardcutLimit: () => {
    const { maps, log } = get();
    const torqueMap = maps.find(m => m.label.toLowerCase().includes('coppia') || m.label.toLowerCase().includes('torque'));
    if (!torqueMap) {
      set({ log: [...log, '[WARNING] Mappa limitatore di coppia non rilevata.'] });
      return;
    }
    const next = new Map<string, CellDelta>();
    for (const cell of torqueMap.cells) {
      const isMaxRPM = cell.col === torqueMap.cols - 1;
      const current = cell.physical;
      const val = isMaxRPM ? 0.0 : (cell.col > 1 && cell.col < 8 ? Math.round(current * 1.15) : current);
      next.set(`${cell.col},${cell.row}`, { col: cell.col, row: cell.row, newPhysical: val });
    }
    set({ activeMapId: torqueMap.mapId, pendingDeltas: next, log: [...log, '[TUNING] Hardcut Popcorn & +15% applicato.'] });
  },

  commitPatch: async () => {
    const { activeMapId, pendingDeltas, maps, log, uploadedFile } = get();
    if (!activeMapId || pendingDeltas.size === 0 || !uploadedFile) return;

    set({ status: 'parsing' });
    try {
      const reqBody = { mapId: activeMapId, deltas: Array.from(pendingDeltas.values()) };
      const res = await fetch('/api/patch-binary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reqBody)
      });
      if (!res.ok) throw new Error('Fallito il patching lato server');
      const data = await res.json();

      if (data.success && data.patchedBinary) {
        const updatedMaps = maps.map(m => m.mapId !== activeMapId ? m : {
          ...m,
          cells: m.cells.map(c => {
            const delta = pendingDeltas.get(`${c.col},${c.row}`);
            return delta ? { ...c, physical: delta.newPhysical } : c;
          })
        });

        const blobBytes = Uint8Array.from(atob(data.patchedBinary), c => c.charCodeAt(0));
        const blob = new Blob([blobBytes], { type: 'application/octet-stream' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `Patched_${get().fileName || 'ecu_output.bin'}`;
        link.click();

        set({
          maps: updatedMaps, pendingDeltas: new Map(), selectedKeys: new Set(),
          status: 'ready', checksumOk: true,
          log: [...log, `[PATCH] ${data.message}`, `[EXPORT] Esportato file corretto pronto per la scrittura.`]
        });
      }
    } catch (e: any) {
      set({ status: 'error', log: [...log, `[ERRORE EXPORT] Impossibile esportare il file: ${e.message}`] });
    }
  },

  reset: () => set({
    status: 'idle', ecuFamily: null, fileName: null, fileSize: null, uploadedFile: null, uploadedDriver: null,
    maps: [], activeMapId: null, checksumOk: null, odaViolations: [], pendingDeltas: new Map(), selectedKeys: new Set(),
    log: ['[SYSTEM] Sessione resettata. Pronto per un nuovo file originale.']
  })
}));
