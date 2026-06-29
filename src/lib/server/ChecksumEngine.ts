import type { ChecksumBlockDefinition } from '@/types/calibration';
import { Endianness } from '@/types/calibration';

export interface TprotSignature {
  ecuFamily: string;
  targetPattern: number[];
  patchPattern: number[];
  description: string;
}

const REFLECT_8_TABLE = new Uint8Array(256);
for (let i = 0; i < 256; i++) {
  let res = 0;
  for (let j = 0; j < 8; j++) {
    if ((i & (1 << j)) !== 0) res |= (1 << (7 - j));
  }
  REFLECT_8_TABLE[i] = res;
}

const crcTables = new Map<number, Uint32Array>();
function getCrcTable(poly: number): Uint32Array {
  let table = crcTables.get(poly);
  if (!table) {
    table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let crc = i << 24;
      for (let j = 0; j < 8; j++) {
        if ((crc & 0x80000000) !== 0) crc = ((crc << 1) ^ poly) >>> 0;
        else crc = (crc << 1) >>> 0;
      }
      table[i] = crc;
    }
    crcTables.set(poly, table);
  }
  return table;
}

export function reflect32(val: number): number {
  let x = val;
  x = (((x & 0xaaaaaaaa) >>> 1) | ((x & 0x55555555) << 1)) >>> 0;
  x = (((x & 0xcccccccc) >>> 2) | ((x & 0x33333333) << 2)) >>> 0;
  x = (((x & 0xf0f0f0f0) >>> 4) | ((x & 0x0f0f0f0f) << 4)) >>> 0;
  x = (((x & 0xff00ff00) >>> 8) | ((x & 0x00ff00ff) << 8)) >>> 0;
  return ((x >>> 16) | (x << 16)) >>> 0;
}

export function calculateCustomCrc32(
  view: DataView, start: number, end: number,
  poly: number = 0x04C11DB7, initXor: number = 0xFFFFFFFF, finalXor: number = 0xFFFFFFFF,
  refIn: boolean = true, refOut: boolean = true
): number {
  const u8 = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  let crc = initXor;
  const table = getCrcTable(poly);
  for (let i = start; i < end; i++) {
    let byte = u8[i]!;
    if (refIn) byte = REFLECT_8_TABLE[byte]!;
    const temp = ((crc >>> 24) ^ byte) & 0xff;
    crc = (table[temp]! ^ (crc << 8)) >>> 0;
  }
  if (refOut) crc = reflect32(crc);
  return (crc ^ finalXor) >>> 0;
}

export class ChecksumEngine {
  private readonly blocks: Map<string, ChecksumBlockDefinition>;

  constructor(defs: ChecksumBlockDefinition[]) {
    this.blocks = new Map(defs.map(d => [d.id, d]));
  }

  public applyBlocks(buffer: ArrayBuffer, blockIds: string[]): void {
    const view = new DataView(buffer);
    const u8 = new Uint8Array(buffer);
    // Risolutore Topologico: Garantisce che i blocchi figli vengano calcolati prima dei genitori
    const resolvedIds = this.resolveCalculationOrder(blockIds);

    for (const id of resolvedIds) {
      const block = this.blocks.get(id);
      if (!block) continue;

      let checksum = 0;

      if (block.strategy === 'additive16twos') {
        let sum = 0;
        for (let i = block.regionStart; i < block.regionEnd; i++) sum = (sum + u8[i]!) & 0xFFFF;
        checksum = ((~sum + 1) & 0xFFFF);
      } else if (block.strategy === 'crc32_custom') {
        checksum = calculateCustomCrc32(view, block.regionStart, block.regionEnd, block.polynomial, block.initXor, block.finalXor, block.refIn, block.refOut);
      }

      if (block.parentBlockId && block.descriptorOffset !== undefined) {
        const parent = this.blocks.get(block.parentBlockId);
        if (parent) {
          const storePos = parent.regionStart + block.descriptorOffset;
          const le = block.storeEndianness === Endianness.LittleEndian;
          if (block.storeDataType === 'uint16') view.setUint16(storePos, checksum & 0xffff, le);
          else view.setUint32(storePos, checksum >>> 0, le);
        }
      }

      const le = block.storeEndianness === Endianness.LittleEndian;
      if (block.storeDataType === 'uint16') view.setUint16(block.storeOffset, checksum & 0xffff, le);
      else view.setUint32(block.storeOffset, checksum >>> 0, le);

      // Verificatore Stringente Fail-Safe
      const stored = block.storeDataType === 'uint16' ? view.getUint16(block.storeOffset, le) : view.getUint32(block.storeOffset, le);
      if (stored !== checksum) {
        throw new Error(
          `FATAL: Verificatore Readback Checksum fallito per blocco "${id}". Atteso: 0x${checksum.toString(16)}, Scritto: 0x${stored.toString(16)}. Scrittura interrotta per prevenire corruzione.`
        );
      }
    }
  }

  private resolveCalculationOrder(blockIds: string[]): string[] {
    const list: string[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (id: string) => {
      if (visiting.has(id)) throw new Error(`Rilevata dipendenza ciclica irreversibile nel motore checksum per blocco: "${id}"`);
      if (visited.has(id)) return;
      visiting.add(id);

      for (const [otherId, otherBlock] of this.blocks.entries()) {
        if (otherBlock.parentBlockId === id) visit(otherId);
      }
      visiting.delete(id);
      visited.add(id);
      list.push(id);
    };

    for (const id of blockIds) visit(id);
    return list.reverse();
  }
}
