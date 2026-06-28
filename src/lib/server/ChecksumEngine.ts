import type { ChecksumBlockDefinition } from '@/types/calibration';
import { Endianness } from '@/types/calibration';

function reflect8(val: number): number {
  let res = 0;
  for (let i = 0; i < 8; i++) {
    if ((val & (1 << i)) !== 0) {
      res |= (1 << (7 - i));
    }
  }
  return res;
}

function reflect32(val: number): number {
  let res = 0;
  for (let i = 0; i < 32; i++) {
    if ((val & (1 << i)) !== 0) {
      res |= (1 << (31 - i));
    }
  }
  return res >>> 0;
}

/**
 * Calcola il valore di checksum CRC-32 con polinomi parametrici e riflessioni.
 */
export function calculateCustomCrc32(
  view: DataView,
  start: number,
  end: number,
  poly: number = 0x04C11DB7,
  initXor: number = 0xFFFFFFFF,
  finalXor: number = 0xFFFFFFFF,
  refIn: boolean = true,
  refOut: boolean = true
): number {
  let crc = initXor;
  for (let i = start; i < end; i++) {
    let byte = view.getUint8(i);
    if (refIn) {
      byte = reflect8(byte);
    }
    crc = crc ^ (byte << 24);
    for (let bit = 0; bit < 8; bit++) {
      if ((crc & 0x80000000) !== 0) {
        crc = ((crc << 1) ^ poly) >>> 0;
      } else {
        crc = (crc << 1) >>> 0;
      }
    }
  }
  if (refOut) {
    crc = reflect32(crc);
  }
  return (crc ^ finalXor) >>> 0;
}

/**
 * Gestore dei checksum di sicurezza e del patching crittografico avanzato.
 */
export class ChecksumEngine {
  private readonly blocks: Map<string, ChecksumBlockDefinition>;

  constructor(defs: ChecksumBlockDefinition[]) {
    this.blocks = new Map(defs.map(d => [d.id, d]));
  }

  /**
   * Scansione euristica e patching del sistema di protezione crittografica TPROT.
   * Identifica la sequenza di sblocco della firma RSA a 2048/4096 bit all'avvio e la bypassa.
   */
  public applyTprotBypass(buffer: ArrayBuffer): { patched: boolean; offset: number } {
    const u8 = new Uint8Array(buffer);
    
    // Pattern di istruzioni Assembly rappresentative per sblocco firma Bootloader TriCore Aurix
    const targetPattern = [0x3C, 0xD4, 0x07, 0x00, 0x1F, 0x80, 0x00, 0x10];
    const patchPattern  = [0x3C, 0xD4, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00];

    let foundOffset = -1;
    for (let i = 0; i <= u8.length - targetPattern.length; i++) {
      let match = true;
      for (let j = 0; j < targetPattern.length; j++) {
        const val = u8[i + j];
        const target = targetPattern[j];
        if (val === undefined || target === undefined || val !== target) {
          match = false;
          break;
        }
      }
      if (match) {
        foundOffset = i;
        break;
      }
    }

    if (foundOffset !== -1) {
      for (let j = 0; j < patchPattern.length; j++) {
        const patchVal = patchPattern[j];
        if (patchVal !== undefined) {
          u8[foundOffset + j] = patchVal;
        }
      }
      return { patched: true, offset: foundOffset };
    }

    return { patched: false, offset: -1 };
  }

  /**
   * Applica ricorsivamente e in modo fail-safe i calcoli dei blocchi dati, gestendo le dipendenze multilivello.
   */
  public applyBlocks(buffer: ArrayBuffer, blockIds: string[]): void {
    const view = new DataView(buffer);
    const resolvedIds = this.resolveCalculationOrder(blockIds);

    for (const id of resolvedIds) {
      const block = this.blocks.get(id);
      if (!block) continue;

      let checksum = 0;

      if (block.strategy === 'additive16twos') {
        let sum = 0;
        for (let i = block.regionStart; i < block.regionEnd; i++) {
          sum = (sum + view.getUint8(i)) & 0xFFFF;
        }
        checksum = ((~sum + 1) & 0xFFFF);
      } 
      else if (block.strategy === 'crc32_custom') {
        checksum = calculateCustomCrc32(
          view,
          block.regionStart,
          block.regionEnd,
          block.polynomial ?? 0x04C11DB7,
          block.initXor ?? 0xFFFFFFFF,
          block.finalXor ?? 0xFFFFFFFF,
          block.refIn ?? true,
          block.refOut ?? true
        );
      }

      // Aggiornamento automatico della tabella descrittori nel blocco genitore prima del calcolo globale
      if (block.parentBlockId && block.descriptorOffset !== undefined) {
        const parent = this.blocks.get(block.parentBlockId);
        if (parent) {
          const storePos = parent.regionStart + block.descriptorOffset;
          const le = block.storeEndianness === Endianness.LittleEndian;
          if (block.storeDataType === 'uint16') {
            view.setUint16(storePos, checksum & 0xffff, le);
          } else {
            view.setUint32(storePos, checksum >>> 0, le);
          }
        }
      }

      // Scrittura del checksum all'offset reale
      const le = block.storeEndianness === Endianness.LittleEndian;
      if (block.storeDataType === 'uint16') {
        view.setUint16(block.storeOffset, checksum & 0xffff, le);
      } else {
        view.setUint32(block.storeOffset, checksum >>> 0, le);
      }

      // Fail-safe Readback Verification
      const stored = block.storeDataType === 'uint16'
        ? view.getUint16(block.storeOffset, le)
        : view.getUint32(block.storeOffset, le);

      if (stored !== checksum) {
        throw new Error(
          `CHECKSUM INTEGRITY FAILURE: block "${id}" expected 0x${checksum.toString(16)} got 0x${stored.toString(16)}. Write operation aborted.`
        );
      }
    }
  }

  private resolveCalculationOrder(blockIds: string[]): string[] {
    const list: string[] = [];
    const visited = new Set<string>();

    const visit = (id: string) => {
      if (visited.has(id)) return;
      visited.add(id);

      for (const [otherId, otherBlock] of this.blocks.entries()) {
        if (otherBlock.parentBlockId === id) {
          visit(otherId);
        }
      }
      list.push(id);
    };

    for (const id of blockIds) {
      visit(id);
    }

    return list.reverse();
  }
}
