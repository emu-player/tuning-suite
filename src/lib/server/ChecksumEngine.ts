import type { ChecksumBlockDefinition } from '@/types/calibration';
import { Endianness } from '@/types/calibration';

/**
 * Tabella statica pre-calcolata per la riflessione rapida a 8-bit.
 */
const REFLECT_8_TABLE = new Uint8Array(256);
for (let i = 0; i < 256; i++) {
  let res = 0;
  for (let j = 0; j < 8; j++) {
    if ((i & (1 << j)) !== 0) {
      res |= (1 << (7 - j));
    }
  }
  REFLECT_8_TABLE[i] = res;
}

/**
 * Cache globale delle tabelle di lookup CRC indicizzate per polinomio.
 */
const crcTables = new Map<number, Uint32Array>();

/**
 * Genera o recupera dalla cache la tabella di lookup per il calcolo CRC a 32 bit.
 */
function getCrcTable(poly: number): Uint32Array {
  let table = crcTables.get(poly);
  if (!table) {
    table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let crc = i << 24;
      for (let j = 0; j < 8; j++) {
        if ((crc & 0x80000000) !== 0) {
          crc = ((crc << 1) ^ poly) >>> 0;
        } else {
          crc = (crc << 1) >>> 0;
        }
      }
      table[i] = crc;
    }
    crcTables.set(poly, table);
  }
  return table;
}

/**
 * Esegue la riflessione speculare a 8 bit in tempo costante O(1).
 */
export function reflect8(val: number): number {
  return REFLECT_8_TABLE[val & 0xff]!;
}

/**
 * Esegue la riflessione speculare a 32 bit senza l'ausilio di cicli iterativi.
 */
export function reflect32(val: number): number {
  let x = val;
  x = (((x & 0xaaaaaaaa) >>> 1) | ((x & 0x55555555) << 1)) >>> 0;
  x = (((x & 0xcccccccc) >>> 2) | ((x & 0x33333333) << 2)) >>> 0;
  x = (((x & 0xf0f0f0f0) >>> 4) | ((x & 0x0f0f0f0f) << 4)) >>> 0;
  x = (((x & 0xff00ff00) >>> 8) | ((x & 0x00ff00ff) << 8)) >>> 0;
  return ((x >>> 16) | (x << 16)) >>> 0;
}

/**
 * Calcola il valore di checksum CRC-32 con polinomi parametrici e riflessioni ad alte prestazioni.
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
  const u8 = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  let crc = initXor;
  const table = getCrcTable(poly);

  for (let i = start; i < end; i++) {
    let byte = u8[i]!;
    if (refIn) {
      byte = REFLECT_8_TABLE[byte]!;
    }
    const temp = ((crc >>> 24) ^ byte) & 0xff;
    crc = (table[temp]! ^ (crc << 8)) >>> 0;
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
   * Scansione ottimizzata tramite algoritmo Boyer-Moore-Horspool e patching del sistema TPROT.
   */
  public applyTprotBypass(buffer: ArrayBuffer): { patched: boolean; offset: number } {
    const u8 = new Uint8Array(buffer);
    
    const targetPattern = [0x3C, 0xD4, 0x07, 0x00, 0x1F, 0x80, 0x00, 0x10];
    const patchPattern  = [0x3C, 0xD4, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00];

    const len = u8.length;
    const patLen = targetPattern.length;
    if (len < patLen) {
      return { patched: false, offset: -1 };
    }

    // Inizializzazione della tabella degli spostamenti BMH (Bad Character Shift)
    const shiftTable = new Int32Array(256);
    for (let i = 0; i < 256; i++) {
      shiftTable[i] = patLen;
    }
    for (let i = 0; i < patLen - 1; i++) {
      shiftTable[targetPattern[i]!] = patLen - 1 - i;
    }

    let foundOffset = -1;
    let skip = 0;

    // Ricerca rapida con salti multipli nel buffer binario [1]
    while (len - skip >= patLen) {
      let match = true;
      for (let i = patLen - 1; i >= 0; i--) {
        if (u8[skip + i] !== targetPattern[i]) {
          match = false;
          break;
        }
      }
      if (match) {
        foundOffset = skip;
        break;
      }
      skip += shiftTable[u8[skip + patLen - 1]!]!;
    }

    if (foundOffset !== -1) {
      u8.set(patchPattern, foundOffset);
      return { patched: true, offset: foundOffset };
    }

    return { patched: false, offset: -1 };
  }

  /**
   * Applica ricorsivamente e in modo fail-safe i calcoli dei blocchi dati, gestendo le dipendenze multilivello.
   */
  public applyBlocks(buffer: ArrayBuffer, blockIds: string[]): void {
    const view = new DataView(buffer);
    const u8 = new Uint8Array(buffer);
    const resolvedIds = this.resolveCalculationOrder(blockIds);

    for (const id of resolvedIds) {
      const block = this.blocks.get(id);
      if (!block) continue;

      let checksum = 0;

      if (block.strategy === 'additive16twos') {
        let sum = 0;
        const start = block.regionStart;
        const end = block.regionEnd;
        
        // Ottimizzazione: accesso diretto all'array tipizzato ad alte prestazioni
        for (let i = start; i < end; i++) {
          sum = (sum + u8[i]!) & 0xFFFF;
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

  /**
   * Risolve l'ordine di calcolo applicando l'ordinamento topologico ed evitando riferimenti circolari.
   */
  private resolveCalculationOrder(blockIds: string[]): string[] {
    const list: string[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (id: string) => {
      if (visiting.has(id)) {
        throw new Error(`Circular dependency detected in ChecksumEngine at block: "${id}"`);
      }
      if (visited.has(id)) return;

      visiting.add(id);

      for (const [otherId, otherBlock] of this.blocks.entries()) {
        if (otherBlock.parentBlockId === id) {
          visit(otherId);
        }
      }

      visiting.delete(id);
      visited.add(id);
      list.push(id);
    };

    for (const id of blockIds) {
      visit(id);
    }

    return list.reverse();
  }
}