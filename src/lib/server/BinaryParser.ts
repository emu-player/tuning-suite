import type { MapDefinition, RawDataType, ParsedCell } from '@/types/calibration';
import { CompuMethod } from './CompuMethod';

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

/**
 * Utility di clamping sicura che gestisce anche eventuali valori NaN (Not-a-Number).
 */
function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) {
    return 0;
  }
  return value < min ? min : (value > max ? max : value);
}

function byteSize(t: RawDataType): number {
  switch (t) {
    case 'uint8':
    case 'int8':
      return 1;
    case 'uint16':
    case 'int16':
      return 2;
    case 'uint32':
    case 'int32':
    case 'float32':
      return 4;
    case 'float64':
      return 8;
    default:
      return 4;
  }
}

function readScalar(view: DataView, offset: number, t: RawDataType, le: boolean): number {
  switch (t) {
    case 'float32': return view.getFloat32(offset, le);
    case 'float64': return view.getFloat64(offset, le);
    case 'uint8':   return view.getUint8(offset);
    case 'int8':    return view.getInt8(offset);
    case 'uint16':  return view.getUint16(offset, le);
    case 'int16':   return view.getInt16(offset, le);
    case 'uint32':  return view.getUint32(offset, le);
    case 'int32':   return view.getInt32(offset, le);
    default:        return view.getUint8(offset);
  }
}

function writeScalar(view: DataView, offset: number, value: number, t: RawDataType, le: boolean): void {
  const b = BOUNDS[t] || BOUNDS['uint8'];
  const boundedVal = clamp(value, b.min, b.max);
  
  switch (t) {
    case 'float32': view.setFloat32(offset, boundedVal, le); break;
    case 'float64': view.setFloat64(offset, boundedVal, le); break;
    case 'uint8':   view.setUint8(offset, boundedVal);       break;
    case 'int8':    view.setInt8(offset, boundedVal);         break;
    case 'uint16':  view.setUint16(offset, boundedVal, le);   break;
    case 'int16':   view.setInt16(offset, boundedVal, le);    break;
    case 'uint32':  view.setUint32(offset, boundedVal >>> 0, le); break;
    case 'int32':   view.setInt32(offset, boundedVal, le);    break;
  }
}

export class BinaryParser {
  private readonly buffer: ArrayBuffer;
  private readonly view: DataView;
  private readonly resolvedOffsets = new Map<string, number>();

  constructor(buffer: ArrayBuffer) {
    this.buffer = buffer;
    this.view = new DataView(buffer);
  }

  private resolveOffset(def: MapDefinition): number {
    const cached = this.resolvedOffsets.get(def.id);
    if (cached !== undefined) {
      return cached;
    }

    let offset = def.offset;
    if (def.isPointer && offset + 4 <= this.buffer.byteLength) {
      offset = this.view.getUint32(offset, true);
    }
    
    this.resolvedOffsets.set(def.id, offset);
    return offset;
  }

  parseMap(def: MapDefinition): ParsedCell[] {
    const stride = byteSize(def.dataType);
    const le = def.endianness === 0;
    const baseOffset = this.resolveOffset(def);
    const rows = def.rows;
    const cols = def.cols;
    const totalCells = rows * cols;
    const byteLength = this.buffer.byteLength;

    // Hoisting del controllo di sicurezza: previene l'overhead di controlli ripetuti nel ciclo caldo
    if (baseOffset < 0 || baseOffset + totalCells * stride > byteLength) {
      throw new RangeError(
        `Map "${def.id}" layout overflows binary bounds. Offset: 0x${baseOffset.toString(16)}, size: ${totalCells * stride} bytes, file size: ${byteLength} bytes.`
      );
    }

    // Pre-allocazione dell'array con dimensione nota per ottimizzare le performance sul motore JS [1]
    const cells: ParsedCell[] = new Array(totalCells);
    const view = this.view;
    const swappedAxes = def.swappedAxes;

    // Estrazione dei parametri per le operazioni sui bit all'esterno dei cicli
    const isSigned = def.dataType.startsWith('int');
    const hasBitmask = def.bitmask !== undefined && def.bitShift !== undefined;
    const bitmask = def.bitmask ?? 0;
    const bitShift = def.bitShift ?? 0;
    
    // Calcolo preventivo per la sign extension dei campi con maschera di bit
    const maskVal = hasBitmask ? (bitmask >>> bitShift) : 0;
    const bitWidth = hasBitmask && maskVal > 0 ? (32 - Math.clz32(maskVal)) : 0;
    const signMask = 1 << (bitWidth - 1);

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const cellIndex = swappedAxes 
          ? (col * rows + row) 
          : (row * cols + col);

        const byteOffset = baseOffset + cellIndex * stride;
        let raw = readScalar(view, byteOffset, def.dataType, le);

        if (hasBitmask) {
          raw = (raw & bitmask) >>> bitShift;
          // Estensione del segno per campi di bit firmati (es. sensori di temperatura o offset negativi)
          if (isSigned && (raw & signMask)) {
            raw = raw | (~0 << bitWidth);
          }
        }

        // Conversione RAW -> Physical delegata a CompuMethod
        const physicalValue = CompuMethod.rawToPhysical(raw, def);
        cells[row * cols + col] = { col, row, physical: physicalValue };
      }
    }
    return cells;
  }

  writeCell(def: MapDefinition, col: number, row: number, newPhysical: number): void {
    const stride = byteSize(def.dataType);
    const le = def.endianness === 0;
    const baseOffset = this.resolveOffset(def);

    const cellIndex = def.swappedAxes 
      ? (col * def.rows + row) 
      : (row * def.cols + col);

    const byteOffset = baseOffset + cellIndex * stride;
    if (byteOffset + stride > this.buffer.byteLength) {
      throw new RangeError(`Write offset 0x${byteOffset.toString(16)} overflows binary.`);
    }

    // Conversione Physical -> RAW delegata a CompuMethod
    const newRaw = CompuMethod.physicalToRaw(newPhysical, def);
    const view = this.view;

    if (def.bitmask !== undefined && def.bitShift !== undefined) {
      const existing = readScalar(view, byteOffset, def.dataType, le);
      
      // Protezione: limita il valore grezzo alla larghezza massima della maschera di bit
      // per impedire che la scrittura corrompa i bit adiacenti nella parola dati.
      const maxMaskValue = def.bitmask >>> def.bitShift;
      const clampedRaw = newRaw & maxMaskValue;

      const finalValue = (existing & ~def.bitmask) | ((clampedRaw << def.bitShift) & def.bitmask);
      writeScalar(view, byteOffset, finalValue, def.dataType, le);
    } else {
      writeScalar(view, byteOffset, newRaw, def.dataType, le);
    }
  }

  cloneBuffer(): ArrayBuffer { 
    return this.buffer.slice(0); 
  }
  
  getBuffer(): ArrayBuffer { 
    return this.buffer; 
  }
}