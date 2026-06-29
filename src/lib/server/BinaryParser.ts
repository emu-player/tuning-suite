import type { MapDefinition, RawDataType, ParsedCell } from '@/types/calibration';
import { Endianness } from '@/types/calibration';
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

type ReaderFn = (view: DataView, offset: number, le: boolean) => number;
type WriterFn = (view: DataView, offset: number, value: number, le: boolean) => void;

const READERS: Record<RawDataType, ReaderFn> = {
  float32: (v: DataView, o: number, le: boolean) => v.getFloat32(o, le),
  float64: (v: DataView, o: number, le: boolean) => v.getFloat64(o, le),
  uint8:   (v: DataView, o: number)              => v.getUint8(o),
  int8:    (v: DataView, o: number)              => v.getInt8(o),
  uint16:  (v: DataView, o: number, le: boolean) => v.getUint16(o, le),
  int16:   (v: DataView, o: number, le: boolean) => v.getInt16(o, le),
  uint32:  (v: DataView, o: number, le: boolean) => v.getUint32(o, le),
  int32:   (v: DataView, o: number, le: boolean) => v.getInt32(o, le),
};

const BASE_WRITERS: Record<RawDataType, WriterFn> = {
  float32: (v: DataView, o: number, val: number, le: boolean) => v.setFloat32(o, val, le),
  float64: (v: DataView, o: number, val: number, le: boolean) => v.setFloat64(o, val, le),
  uint8:   (v: DataView, o: number, val: number)              => v.setUint8(o, val),
  int8:    (v: DataView, o: number, val: number)              => v.setInt8(o, val),
  uint16:  (v: DataView, o: number, val: number, le: boolean) => v.setUint16(o, val, le),
  int16:   (v: DataView, o: number, val: number, le: boolean) => v.setInt16(o, val, le),
  uint32:  (v: DataView, o: number, val: number, le: boolean) => v.setUint32(o, val >>> 0, le),
  int32:   (v: DataView, o: number, val: number, le: boolean) => v.setInt32(o, val, le),
};

const CLAMPED_WRITERS = {} as Record<RawDataType, WriterFn>;
for (const key of Object.keys(BASE_WRITERS) as RawDataType[]) {
  const b = BOUNDS[key];
  const writer = BASE_WRITERS[key];
  CLAMPED_WRITERS[key] = (view, offset, value, le) => {
    const boundedVal = clamp(value, b.min, b.max);
    writer(view, offset, boundedVal, le);
  };
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return 0;
  return value < min ? min : (value > max ? max : value);
}

function byteSize(t: RawDataType): number {
  switch (t) {
    case 'uint8': case 'int8': return 1;
    case 'uint16': case 'int16': return 2;
    case 'uint32': case 'int32': case 'float32': return 4;
    case 'float64': return 8;
    default: return 4;
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
    if (cached !== undefined) return cached;

    let offset = def.offset;
    if (def.isPointer) {
      if (offset + 4 > this.buffer.byteLength || offset < 0) {
        throw new RangeError(`Pointer offset 0x${offset.toString(16)} for map "${def.id}" is outside binary bounds.`);
      }
      const le = def.endianness === Endianness.LittleEndian;
      offset = this.view.getUint32(offset, le);
      if (offset < 0 || offset > this.buffer.byteLength) {
        throw new RangeError(`Pointer at 0x${def.offset.toString(16)} resolved to out-of-bounds address: 0x${offset.toString(16)}.`);
      }
    }
    
    this.resolvedOffsets.set(def.id, offset);
    return offset;
  }

  parseMap(def: MapDefinition): ParsedCell[] {
    const stride = byteSize(def.dataType);
    const le = def.endianness === Endianness.LittleEndian;
    const baseOffset = this.resolveOffset(def);
    const rows = def.rows;
    const cols = def.cols;
    const totalCells = rows * cols;
    const byteLength = this.buffer.byteLength;

    if (baseOffset < 0 || baseOffset + totalCells * stride > byteLength) {
      throw new RangeError(`Map "${def.id}" layout overflows binary bounds.`);
    }

    const cells: ParsedCell[] = new Array(totalCells);
    const view = this.view;
    const swappedAxes = def.swappedAxes;

    const isSigned = def.dataType.startsWith('int');
    const hasBitmask = def.bitmask !== undefined && def.bitShift !== undefined;
    const bitmask = def.bitmask ?? 0;
    const bitShift = def.bitShift ?? 0;
    
    const maskVal = hasBitmask ? (bitmask >>> bitShift) : 0;
    const bitWidth = hasBitmask && maskVal > 0 ? (32 - Math.clz32(maskVal)) : 0;
    const signMask = 1 << (bitWidth - 1);

    const reader = READERS[def.dataType] || READERS['uint8'];

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const cellIndex = swappedAxes ? (col * rows + row) : (row * cols + col);
        const byteOffset = baseOffset + cellIndex * stride;
        let raw = reader(view, byteOffset, le);

        if (hasBitmask) {
          raw = (raw & bitmask) >>> bitShift;
          if (isSigned && (raw & signMask)) raw = raw | (~0 << bitWidth);
        }

        const physicalValue = CompuMethod.rawToPhysical(raw, def);
        cells[row * cols + col] = { col, row, physical: physicalValue };
      }
    }
    return cells;
  }

  writeCell(def: MapDefinition, col: number, row: number, newPhysical: number): void {
    const min = def.physMin ?? -Infinity;
    const max = def.physMax ?? Infinity;
    const clampedPhysical = clamp(newPhysical, min, max);

    const stride = byteSize(def.dataType);
    const le = def.endianness === Endianness.LittleEndian;
    const baseOffset = this.resolveOffset(def);

    const cellIndex = def.swappedAxes ? (col * def.rows + row) : (row * def.cols + col);
    const byteOffset = baseOffset + cellIndex * stride;

    if (byteOffset + stride > this.buffer.byteLength) {
      throw new RangeError(`Write offset 0x${byteOffset.toString(16)} overflows binary.`);
    }

    const newRaw = CompuMethod.physicalToRaw(clampedPhysical, def);
    const view = this.view;
    const writer = CLAMPED_WRITERS[def.dataType] || CLAMPED_WRITERS['uint8'];

    if (def.bitmask !== undefined && def.bitShift !== undefined) {
      const reader = READERS[def.dataType] || READERS['uint8'];
      const existing = reader(view, byteOffset, le);
      const maxMaskValue = def.bitmask >>> def.bitShift;
      const clampedRaw = newRaw & maxMaskValue;
      const finalValue = (existing & ~def.bitmask) | ((clampedRaw << def.bitShift) & def.bitmask);
      writer(view, byteOffset, finalValue, le);
    } else {
      writer(view, byteOffset, newRaw, le);
    }
  }
}
