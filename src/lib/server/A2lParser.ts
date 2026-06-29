import type { MapDefinition, RawDataType, AxisDefinition } from '@/types/calibration';
import { Endianness } from '@/types/calibration';

// ============================================================================
// STRUTTURE DATI OTTIMIZZATE (Zero-AST)
// ============================================================================

interface CompuMethodMeta {
  name: string;
  factor: number;
  offset: number;
  unit: string;
}

interface RecordLayoutMeta {
  name: string;
  dataType: RawDataType;
}

interface AxisPtsMeta {
  name: string;
  address: number;
  recordLayout: string;
  conversion: string;
  size: number;
}

interface CharacteristicMeta {
  name: string;
  type: string;
  address: number;
  recordLayout: string;
  conversion: string;
  xAxisRef?: string;
  yAxisRef?: string;
  xMatrixSize?: number;
  yMatrixSize?: number;
}

// ============================================================================
// LEXER AD ALTE PRESTAZIONI (Gestione Memoria O(1))
// ============================================================================

class A2lLexer {
  private readonly content: string;
  private readonly length: number;
  private pos: number = 0;

  constructor(content: string) {
    this.content = content;
    this.length = content.length;
  }

  /**
   * Estrae il prossimo token saltando spazi e commenti complessi (C-style e C++-style).
   * Evita allocazioni intermedie lavorando sui charCode.
   */
  public next(): string | null {
    const len = this.length;
    const content = this.content;

    while (this.pos < len) {
      const charCode = content.charCodeAt(this.pos);

      // Salta Whitespaces
      if (charCode <= 32) {
        this.pos++;
        continue;
      }

      // Gestione Commenti (/* ... */ e // ...)
      if (charCode === 47 /* '/' */) {
        if (this.pos + 1 < len) {
          const nextCode = content.charCodeAt(this.pos + 1);
          if (nextCode === 47 /* '/' */) {
            this.pos += 2;
            while (this.pos < len && content.charCodeAt(this.pos) !== 10 && content.charCodeAt(this.pos) !== 13) {
              this.pos++;
            }
            continue;
          } else if (nextCode === 42 /* '*' */) {
            this.pos += 2;
            while (this.pos < len) {
              if (content.charCodeAt(this.pos) === 42 && this.pos + 1 < len && content.charCodeAt(this.pos + 1) === 47) {
                this.pos += 2;
                break;
              }
              this.pos++;
            }
            continue;
          }
        }
      }

      // Gestione Stringhe ("...") -> Ritorna il contenuto senza le virgolette per efficienza
      if (charCode === 34 /* '"' */) {
        this.pos++; // Salta "
        const start = this.pos;
        while (this.pos < len) {
          if (content.charCodeAt(this.pos) === 34) {
            if (content.charCodeAt(this.pos - 1) === 92 /* '\' */) {
              this.pos++;
              continue;
            }
            break;
          }
          this.pos++;
        }
        const str = content.substring(start, this.pos);
        this.pos++; // Salta "
        return str;
      }

      // Gestione Token Standard
      const start = this.pos;
      while (this.pos < len) {
        const c = content.charCodeAt(this.pos);
        if (c <= 32 || c === 34) break;
        if (c === 47 && this.pos + 1 < len) {
          const nc = content.charCodeAt(this.pos + 1);
          if (nc === 47 || nc === 42) break;
        }
        this.pos++;
      }
      return content.substring(start, this.pos);
    }
    return null;
  }

  /**
   * Salta velocemente un intero blocco ricorsivo (es. IF_DATA) per risparmiare cicli CPU.
   */
  public skipBlock(blockName: string): void {
    let depth = 1;
    let token: string | null;
    while ((token = this.next()) !== null) {
      if (token === '/begin') depth++;
      else if (token === '/end') {
        const endName = this.next();
        if (endName === blockName) {
          depth--;
          if (depth === 0) return;
        }
      }
    }
  }
}

// ============================================================================
// CORE ENGINE: ONE-PASS RECURSIVE DESCENT PARSER
// ============================================================================

export class A2lParser {
  /**
   * Parser Entry-point.
   * Analizza l'A2L e mappa istantaneamente le strutture fisiche sul binario.
   */
  public static async parse(a2lContent: string, binary: ArrayBuffer): Promise<MapDefinition[]> {
    const lexer = new A2lLexer(a2lContent);
    
    const compuMethods = new Map<string, CompuMethodMeta>();
    const recordLayouts = new Map<string, RecordLayoutMeta>();
    const axisPts = new Map<string, AxisPtsMeta>();
    const characteristics: CharacteristicMeta[] = [];
    
    // Architettura Endianness Dinamica (Di base LittleEndian per Tricore/Bosch)
    let globalEndianness = Endianness.LittleEndian;

    let token: string | null;
    let iterCount = 0;

    // FASE 1: Scansione ed Estrazione One-Pass
    while ((token = lexer.next()) !== null) {
      
      // Cooperative Multitasking per Node.js Event Loop (Previene il crash su file da 150MB+)
      if (++iterCount % 15000 === 0) {
        await new Promise(r => setTimeout(r, 0));
      }

      if (token === '/begin') {
        const blockType = lexer.next();
        const blockName = lexer.next();

        if (!blockType || !blockName) continue;

        switch (blockType) {
          case 'COMPU_METHOD':
            this.parseCompuMethod(lexer, blockName, compuMethods);
            break;
          case 'RECORD_LAYOUT':
            this.parseRecordLayout(lexer, blockName, recordLayouts);
            break;
          case 'AXIS_PTS':
            this.parseAxisPts(lexer, blockName, axisPts);
            break;
          case 'CHARACTERISTIC':
            this.parseCharacteristic(lexer, blockName, characteristics);
            break;
          case 'MOD_COMMON':
            // Rilevamento Architettura Endianness Hardware
            let mcToken: string | null;
            while ((mcToken = lexer.next()) !== null) {
              if (mcToken === '/end') { lexer.next(); break; }
              if (mcToken === 'BYTE_ORDER') {
                const order = lexer.next();
                if (order === 'MSB_FIRST') globalEndianness = Endianness.BigEndian;
              }
            }
            break;
          default:
            lexer.skipBlock(blockType);
            break;
        }
      }
    }

    // FASE 2: Sintesi e Risoluzione Map Definitions
    const definitions: MapDefinition[] = [];
    const view = new DataView(binary);

    for (const char of characteristics) {
      const def = this.synthesizeMapDefinition(char, compuMethods, recordLayouts, axisPts, view, binary.byteLength, globalEndianness);
      if (def) definitions.push(def);
    }

    return definitions;
  }

  // --- Sub-Parsers (Lexical Extractors) ---

  private static parseCompuMethod(lexer: A2lLexer, name: string, map: Map<string, CompuMethodMeta>) {
    let type = lexer.next() ?? 'IDENTICAL';
    let format = lexer.next();
    let unit = lexer.next() ?? 'RAW';
    
    let factor = 1.0;
    let offset = 0.0;

    let token: string | null;
    while ((token = lexer.next()) !== null) {
      if (token === '/end') { lexer.next(); break; }
      
      if (token === 'COEFFS_LINEAR' || token === 'COEFFS') {
        const aStr = lexer.next();
        const bStr = lexer.next();
        if (aStr) {
          const a = parseFloat(aStr);
          if (!isNaN(a)) factor = a;
        }
        if (bStr) {
          const b = parseFloat(bStr);
          if (!isNaN(b)) offset = b;
        }
      }
    }

    map.set(name, { name, factor, offset, unit });
  }

  private static parseRecordLayout(lexer: A2lLexer, name: string, map: Map<string, RecordLayoutMeta>) {
    let dataType: RawDataType = 'uint16'; // Fallback di sicurezza

    let token: string | null;
    while ((token = lexer.next()) !== null) {
      if (token === '/end') { lexer.next(); break; }
      
      if (token === 'FNC_VALUES') {
        lexer.next(); // Salta arg1
        const dtStr = lexer.next();
        if (dtStr) {
          const ts = dtStr.toUpperCase();
          if (ts.includes('8') || ts.includes('BYTE')) dataType = ts.startsWith('S') ? 'int8' : 'uint8';
          else if (ts.includes('32') || ts.includes('LONG')) dataType = ts.startsWith('S') ? 'int32' : 'uint32';
          else if (ts.includes('FLOAT32')) dataType = 'float32';
          else if (ts.includes('FLOAT64')) dataType = 'float64';
          else if (ts.includes('16') || ts.includes('WORD')) dataType = ts.startsWith('S') ? 'int16' : 'uint16';
        }
      }
    }
    map.set(name, { name, dataType });
  }

  private static parseAxisPts(lexer: A2lLexer, name: string, map: Map<string, AxisPtsMeta>) {
    const addressStr = lexer.next() ?? '0';
    lexer.next(); // input_quantity
    const recordLayout = lexer.next() ?? 'DEFAULT';
    lexer.next(); // maxDiff
    const conversion = lexer.next() ?? 'IDENTICAL';
    const sizeStr = lexer.next() ?? '1';

    const address = this.parseAddress(addressStr);
    const size = parseInt(sizeStr, 10) || 1;

    let token: string | null;
    while ((token = lexer.next()) !== null) {
      if (token === '/end') { lexer.next(); break; }
    }

    map.set(name, { name, address, recordLayout, conversion, size });
  }

  private static parseCharacteristic(lexer: A2lLexer, name: string, list: CharacteristicMeta[]) {
    const type = lexer.next() ?? 'VALUE';
    const addressStr = lexer.next() ?? '0';
    const recordLayout = lexer.next() ?? 'DEFAULT';
    lexer.next(); // maxDiff
    const conversion = lexer.next() ?? 'IDENTICAL';
    lexer.next(); // min
    lexer.next(); // max

    const meta: CharacteristicMeta = {
      name,
      type,
      address: this.parseAddress(addressStr),
      recordLayout,
      conversion
    };

    let token: string | null;
    let axisCounter = 0;

    while ((token = lexer.next()) !== null) {
      if (token === '/begin') {
        const blockType = lexer.next();
        if (blockType === 'AXIS_DESCR') {
          axisCounter++;
          lexer.next(); // attr
          lexer.next(); // input_quantity
          const axisConv = lexer.next();
          const axisSizeStr = lexer.next();
          const axisSize = parseInt(axisSizeStr ?? '1', 10) || 1;
          
          if (axisCounter === 1) meta.xMatrixSize = axisSize;
          else if (axisCounter === 2) meta.yMatrixSize = axisSize;

          let axisToken: string | null;
          while ((axisToken = lexer.next()) !== null) {
            if (axisToken === '/end') {
              const eb = lexer.next();
              if (eb === 'AXIS_DESCR') break;
            }
            if (axisToken === 'AXIS_PTS_REF') {
              const ref = lexer.next();
              if (ref) {
                if (axisCounter === 1) meta.xAxisRef = ref;
                else if (axisCounter === 2) meta.yAxisRef = ref;
              }
            }
          }
        } else if (blockType === 'MATRIX_DIM') {
          const x = parseInt(lexer.next() ?? '1', 10) || 1;
          const y = parseInt(lexer.next() ?? '1', 10) || 1;
          meta.xMatrixSize = x;
          meta.yMatrixSize = y;
          lexer.skipBlock('MATRIX_DIM'); // Sicurezza
        } else {
          lexer.skipBlock(blockType ?? '');
        }
      } else if (token === '/end') {
        lexer.next(); // skip name
        break;
      }
    }

    list.push(meta);
  }

  // --- Utility Engine ---

  /** Normalizzazione sicura degli indirizzi esadecimali (Risoluzione Mirroring Tricore/MPC) */
  private static parseAddress(hexStr: string): number {
    const val = hexStr.toLowerCase().startsWith('0x') ? parseInt(hexStr.substring(2), 16) : parseInt(hexStr, 10);
    if (isNaN(val)) return 0;
    return val;
  }

  private static mapHardwareAddress(addr: number, binSize: number): number {
    if (addr >= 0x80000000) return addr & 0x1FFFFFFF;
    if (addr >= 0x800000 && binSize < 0x800000) return addr - 0x800000;
    return addr;
  }

  private static getStride(t: RawDataType): number {
    if (t === 'uint16' || t === 'int16') return 2;
    if (t === 'float32' || t === 'uint32' || t === 'int32') return 4;
    if (t === 'float64') return 8;
    return 1;
  }

  private static synthesizeMapDefinition(
    char: CharacteristicMeta,
    compuMethods: Map<string, CompuMethodMeta>,
    recordLayouts: Map<string, RecordLayoutMeta>,
    axisPts: Map<string, AxisPtsMeta>,
    view: DataView,
    binSize: number,
    globalEndian: Endianness
  ): MapDefinition | null {
    
    const physicalAddress = this.mapHardwareAddress(char.address, binSize);
    
    // Fallback Geometria Mappe
    let cols = char.xMatrixSize ?? 1;
    let rows = char.yMatrixSize ?? 1;
    if (char.type === 'VAL_BLK' || char.type === 'CURVE') { cols = Math.max(cols, 8); rows = 1; }
    else if (char.type === 'MAP' || char.type === 'CUBIC') { cols = Math.max(cols, 16); rows = Math.max(rows, 12); }

    // Risoluzione DataType Fisico
    const layout = recordLayouts.get(char.recordLayout);
    const dataType = layout?.dataType ?? 'uint16';
    const stride = this.getStride(dataType);

    // ODA Boundary Check preventivo
    if (physicalAddress + cols * rows * stride > binSize) return null;

    // Risoluzione Matematica Z (Z-Axis)
    const method = compuMethods.get(char.conversion);
    const factor = method?.factor ?? 1.0;
    const offsetA2l = method?.offset ?? 0.0;
    const unit = method?.unit ?? 'RAW';

    // Funzione helper per risolvere assi fisici dal binario
    const resolveAxis = (refName: string | undefined, defaultSize: number, fallbackLabel: string): AxisDefinition => {
      const axis = { label: fallbackLabel, unit: '', values: Array.from({ length: defaultSize }, (_, i) => i * 10) };
      
      if (!refName) return axis;
      
      const pts = axisPts.get(refName);
      if (!pts) return axis;

      const ptsMethod = compuMethods.get(pts.conversion);
      const ptsFactor = ptsMethod?.factor ?? 1.0;
      const ptsOffset = ptsMethod?.offset ?? 0.0;
      axis.unit = ptsMethod?.unit ?? '';

      const ptsLayout = recordLayouts.get(pts.recordLayout);
      const ptsDataType = ptsLayout?.dataType ?? 'uint16';
      const ptsStride = this.getStride(ptsDataType);
      
      const ptsAddr = this.mapHardwareAddress(pts.address, binSize);

      if (ptsAddr + pts.size * ptsStride <= binSize) {
        axis.values = [];
        const le = globalEndian === Endianness.LittleEndian;
        
        for (let i = 0; i < pts.size; i++) {
          let raw = 0;
          const offset = ptsAddr + (i * ptsStride);
          
          if (ptsDataType === 'uint8') raw = view.getUint8(offset);
          else if (ptsDataType === 'int8') raw = view.getInt8(offset);
          else if (ptsDataType === 'uint16') raw = view.getUint16(offset, le);
          else if (ptsDataType === 'int16') raw = view.getInt16(offset, le);
          else if (ptsDataType === 'uint32') raw = view.getUint32(offset, le);
          else if (ptsDataType === 'int32') raw = view.getInt32(offset, le);
          else if (ptsDataType === 'float32') raw = view.getFloat32(offset, le);
          else raw = view.getUint16(offset, le); // safe fallback

          axis.values.push(raw * ptsFactor + ptsOffset);
        }
      }
      return axis;
    };

    const xAxis = resolveAxis(char.xAxisRef, cols, 'Asse X');
    const yAxis = resolveAxis(char.yAxisRef, rows, 'Asse Y');

    // Allineamento dimensionale reale
    cols = xAxis.values.length;
    rows = yAxis.values.length;

    return {
      id: `a2l_${char.name}`,
      label: char.name,
      unit,
      offset: physicalAddress,
      cols,
      rows,
      dataType,
      endianness: globalEndian, // Integrazione dinamica
      factor,
      offsetA2l,
      checksumBlocks: ['block_main'],
      xAxis,
      yAxis
    };
  }
}
