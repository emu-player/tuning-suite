import type { MapDefinition, RawDataType, ParsedCell } from '@/types/calibration';
import { Endianness } from '@/types/calibration';
import { CompuMethod } from './CompuMethod';

// ============================================================================
// STRUTTURE DATI OTTIMIZZATE & COSTANTI FISICHE
// ============================================================================

const BOUNDS: Record<RawDataType, { min: number; max: number }> = {
  float32: { min: -3.4028234663852886e38, max: 3.4028234663852886e38 },
  float64: { min: -Number.MAX_VALUE,      max: Number.MAX_VALUE },
  uint8:   { min: 0,                      max: 255 },
  int8:    { min: -128,                   max: 127 },
  uint16:  { min: 0,                      max: 65535 },
  int16:   { min: -32768,                 max: 32767 },
  uint32:  { min: 0,                      max: 4294967295 },
  int32:   { min: -2147483648,            max: 2147483647 },
};

function getStride(t: RawDataType): number {
  switch (t) {
    case 'uint8': case 'int8': return 1;
    case 'uint16': case 'int16': return 2;
    case 'uint32': case 'int32': case 'float32': return 4;
    case 'float64': return 8;
    default: return 4;
  }
}

// ============================================================================
// CONTESTO PRE-COMPILATO (Per azzerare il Branching nei Loop)
// ============================================================================

interface MapContext {
  baseOffset: number;
  stride: number;
  totalCells: number;
  physMin: number;
  physMax: number;
  readRaw: (offset: number) => number;
  writeRaw: (offset: number, val: number) => void;
}

export class BinaryParser {
  private readonly buffer: ArrayBuffer;
  private readonly view: DataView;
  private readonly byteLength: number;
  
  // Cache Veloce per i Contesti di Mappa (Evita ricalcoli su letture/scritture multiple)
  private readonly contextCache = new Map<string, MapContext>();

  constructor(buffer: ArrayBuffer) {
    this.buffer = buffer;
    this.view = new DataView(buffer);
    this.byteLength = buffer.byteLength;
  }

  /**
   * Generatore di Contesto JIT:
   * Risolve puntatori, calcola limiti, e prepara funzioni di I/O "curried"
   * senza condizionali interni, garantendo la Monomorphic Inline Caching in V8.
   */
  private getContext(def: MapDefinition): MapContext {
    let ctx = this.contextCache.get(def.id);
    if (ctx) return ctx;

    // 1. Risoluzione Puntatori
    let baseOffset = def.offset;
    const le = def.endianness === Endianness.LittleEndian;
    
    if (def.isPointer) {
      if (baseOffset + 4 > this.byteLength || baseOffset < 0) {
        throw new RangeError(`Pointer offset 0x${baseOffset.toString(16)} out of bounds.`);
      }
      baseOffset = this.view.getUint32(baseOffset, le);
      if (baseOffset < 0 || baseOffset > this.byteLength) {
        throw new RangeError(`Resolved pointer 0x${baseOffset.toString(16)} out of bounds.`);
      }
    }

    const stride = getStride(def.dataType);
    const totalCells = def.rows * def.cols;

    if (baseOffset < 0 || baseOffset + totalCells * stride > this.byteLength) {
      throw new RangeError(`Map "${def.id}" layout overflows binary bounds.`);
    }

    // 2. Fusione dei Limiti (Clamping Matematico Unificato)
    const typeBounds = BOUNDS[def.dataType];
    const physMin = def.physMin !== undefined ? Math.max(def.physMin, typeBounds.min) : typeBounds.min;
    const physMax = def.physMax !== undefined ? Math.min(def.physMax, typeBounds.max) : typeBounds.max;

    // 3. Costruzione Funzioni Native DataView (High-Speed Accessors)
    const v = this.view;
    let baseRead: (o: number) => number;
    let baseWrite: (o: number, val: number) => void;

    switch (def.dataType) {
      case 'float32': baseRead = (o) => v.getFloat32(o, le); baseWrite = (o, val) => v.setFloat32(o, val, le); break;
      case 'float64': baseRead = (o) => v.getFloat64(o, le); baseWrite = (o, val) => v.setFloat64(o, val, le); break;
      case 'uint8':   baseRead = (o) => v.getUint8(o);       baseWrite = (o, val) => v.setUint8(o, val);       break;
      case 'int8':    baseRead = (o) => v.getInt8(o);        baseWrite = (o, val) => v.setInt8(o, val);        break;
      case 'uint16':  baseRead = (o) => v.getUint16(o, le);  baseWrite = (o, val) => v.setUint16(o, val, le);  break;
      case 'int16':   baseRead = (o) => v.getInt16(o, le);   baseWrite = (o, val) => v.setInt16(o, val, le);   break;
      case 'uint32':  baseRead = (o) => v.getUint32(o, le);  baseWrite = (o, val) => v.setUint32(o, val >>> 0, le); break;
      case 'int32':   baseRead = (o) => v.getInt32(o, le);   baseWrite = (o, val) => v.setInt32(o, val, le);   break;
      default:        baseRead = (o) => v.getUint8(o);       baseWrite = (o, val) => v.setUint8(o, val);
    }

    // 4. Wrapping per Logica Bitmask & Segno (Decoratore Pattern)
    let finalRead = baseRead;
    let finalWrite = baseWrite;

    if (def.bitmask !== undefined && def.bitShift !== undefined) {
      const bitmask = def.bitmask;
      const bitShift = def.bitShift;
      const isSigned = def.dataType.startsWith('int');
      const maskVal = bitmask >>> bitShift;
      const bitWidth = maskVal > 0 ? (32 - Math.clz32(maskVal)) : 0;
      const signMask = 1 << (bitWidth - 1);

      // Lettura decorata (Shift & Sign Extension)
      finalRead = (o: number) => {
        let raw = baseRead(o);
        raw = (raw & bitmask) >>> bitShift;
        if (isSigned && (raw & signMask)) raw = raw | (~0 << bitWidth);
        return raw;
      };

      // Scrittura decorata (Read-Modify-Write atomico simulato)
      finalWrite = (o: number, val: number) => {
        const existing = baseRead(o);
        const clampedRaw = val & maskVal;
        const finalValue = (existing & ~bitmask) | ((clampedRaw << bitShift) & bitmask);
        baseWrite(o, finalValue);
      };
    } else {
      // Clamping Nativo per tipi standard
      finalWrite = (o: number, val: number) => {
        const safeVal = Number.isNaN(val) ? 0 : (val < typeBounds.min ? typeBounds.min : (val > typeBounds.max ? typeBounds.max : val));
        baseWrite(o, safeVal);
      };
    }

    ctx = { baseOffset, stride, totalCells, physMin, physMax, readRaw: finalRead, writeRaw: finalWrite };
    this.contextCache.set(def.id, ctx);
    return ctx;
  }

  // ============================================================================
  // PUBBLICHE: ESECUZIONE BRANCHLESS (O(N) Puro)
  // ============================================================================

  public parseMap(def: MapDefinition): ParsedCell[] {
    const ctx = this.getContext(def);
    const { cols, rows, swappedAxes } = def;
    const { baseOffset, stride, totalCells, readRaw } = ctx;

    // Pre-allocazione esatta array (Zero resizes)
    const cells = new Array<ParsedCell>(totalCells);
    let idx = 0;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        // Calcolo indice e offset puro
        const cellIndex = swappedAxes ? (c * rows + r) : (r * cols + c);
        const byteOffset = baseOffset + cellIndex * stride;
        
        // Esecuzione tramite funzioni monomorfiche JITtate
        const raw = readRaw(byteOffset);
        const physical = CompuMethod.rawToPhysical(raw, def);
        
        cells[idx++] = { col: c, row: r, physical };
      }
    }

    return cells;
  }

  public writeCell(def: MapDefinition, col: number, row: number, newPhysical: number): void {
    const ctx = this.getContext(def);
    
    // Clamping Matematico Ultra-Veloce
    let clampedPhys = newPhysical;
    if (Number.isNaN(clampedPhys)) clampedPhys = 0;
    if (clampedPhys < ctx.physMin) clampedPhys = ctx.physMin;
    else if (clampedPhys > ctx.physMax) clampedPhys = ctx.physMax;

    // Conversione inversa e calcolo Offset
    const newRaw = CompuMethod.physicalToRaw(clampedPhys, def);
    const cellIndex = def.swappedAxes ? (col * def.rows + row) : (row * def.cols + col);
    const byteOffset = ctx.baseOffset + cellIndex * ctx.stride;

    // Boundary Check Estremo di Sicurezza
    if (byteOffset + ctx.stride > this.byteLength) {
      throw new RangeError(`Write boundary violation at 0x${byteOffset.toString(16)}`);
    }

    // Scrittura Pura Branchless
    ctx.writeRaw(byteOffset, newRaw);
  }
}
