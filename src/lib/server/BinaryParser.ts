import type { MapDefinition, RawDataType, ParsedCell } from '@/types/calibration';
import { CompuMethod } from './CompuMethod';

const BOUNDS: Record<RawDataType, { min: number; max: number }> = {
  float32: { min: -3.4028234663852886e38, max: 3.4028234663852886e38 },
  uint8:   { min: 0,           max: 255         },
  int8:    { min: -128,        max: 127         },
  uint16:  { min: 0,           max: 65535       },
  int16:   { min: -32768,      max: 32767       },
  uint32:  { min: 0,           max: 4294967295  },
  int32:   { min: -2147483648, max: 2147483647  },
};

function byteSize(t: RawDataType): number {
  switch (t) {
    case 'uint8': case 'int8':   return 1;
    case 'uint16': case 'int16': return 2;
    default:                     return 4;
  }
}

function readScalar(view: DataView, offset: number, t: RawDataType, le: boolean): number {
  switch (t) {
    case 'float32': return view.getFloat32(offset, le);
    case 'uint8':   return view.getUint8(offset);
    case 'int8':    return view.getInt8(offset);
    case 'uint16':  return view.getUint16(offset, le);
    case 'int16':   return view.getInt16(offset, le);
    case 'uint32':  return view.getUint32(offset, le);
    case 'int32':   return view.getInt32(offset, le);
  }
}

function writeScalar(view: DataView, offset: number, value: number, t: RawDataType, le: boolean): void {
  const b = BOUNDS[t];
  const boundedVal = Math.min(b.max, Math.max(b.min, value));
  
  switch (t) {
    case 'float32': view.setFloat32(offset, boundedVal, le); break;
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

  constructor(buffer: ArrayBuffer) {
    this.buffer = buffer;
    this.view = new DataView(buffer);
  }

  private resolveOffset(def: MapDefinition): number {
    let offset = def.offset;
    if (def.isPointer && offset + 4 <= this.buffer.byteLength) {
      offset = this.view.getUint32(offset, true);
    }
    return offset;
  }

  parseMap(def: MapDefinition): ParsedCell[] {
    const stride = byteSize(def.dataType);
    const le = def.endianness === 0;
    const cells: ParsedCell[] = [];
    const baseOffset = this.resolveOffset(def);

    for (let row = 0; row < def.rows; row++) {
      for (let col = 0; col < def.cols; col++) {
        const cellIndex = def.swappedAxes 
          ? (col * def.rows + row) 
          : (row * def.cols + col);

        const byteOffset = baseOffset + cellIndex * stride;
        if (byteOffset + stride > this.buffer.byteLength) {
          throw new RangeError(`Map "${def.id}" cell [${row},${col}] overflows binary.`);
        }

        let raw = readScalar(this.view, byteOffset, def.dataType, le);
        if (def.bitmask !== undefined && def.bitShift !== undefined) {
          raw = (raw & def.bitmask) >>> def.bitShift;
        }

        // Conversione RAW -> Physical delegata a CompuMethod
        const physicalValue = CompuMethod.rawToPhysical(raw, def);
        cells.push({ col, row, physical: physicalValue });
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

    if (def.bitmask !== undefined && def.bitShift !== undefined) {
      const existing = readScalar(this.view, byteOffset, def.dataType, le);
      writeScalar(this.view, byteOffset, (existing & ~def.bitmask) | ((newRaw << def.bitShift) & def.bitmask), def.dataType, le);
    } else {
      writeScalar(this.view, byteOffset, newRaw, def.dataType, le);
    }
  }

  cloneBuffer(): ArrayBuffer { return this.buffer.slice(0); }
  getBuffer(): ArrayBuffer  { return this.buffer; }
}
