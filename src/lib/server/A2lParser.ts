import type { MapDefinition, RawDataType } from '@/types/calibration';
import { Endianness } from '@/types/calibration';

interface A2lBlock {
  type: string;
  name: string;
  args: string[];
  subBlocks: A2lBlock[];
}

interface CompuMethodMeta {
  name: string;
  type: string;
  unit: string;
  factor: number;
  offset: number;
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

/**
 * Tokenizer lessicale ad alte prestazioni conforme allo standard ASAM ASAP2.
 * Evita espressioni regolari complesse e scansione inefficiente per massimizzare il throughput.
 */
class A2lTokenizer {
  private readonly content: string;
  private readonly length: number;
  private pos: number = 0;

  constructor(content: string) {
    this.content = content;
    this.length = content.length;
  }

  public nextToken(): string | null {
    const len = this.length;
    const content = this.content;

    while (this.pos < len) {
      const charCode = content.charCodeAt(this.pos);

      // Salto dei caratteri di spaziatura (Space, Tab, CR, LF)
      if (charCode <= 32) {
        this.pos++;
        continue;
      }

      // Gestione dei commenti inline /.../ e dei commenti a blocco /*...*/
      if (charCode === 47 /* '/' */) {
        if (this.pos + 1 < len) {
          const nextCode = content.charCodeAt(this.pos + 1);
          if (nextCode === 47 /* '/' */) {
            this.pos += 2;
            while (this.pos < len) {
              const c = content.charCodeAt(this.pos);
              if (c === 10 /* '\n' */ || c === 13 /* '\r' */) {
                break;
              }
              this.pos++;
            }
            continue;
          } else if (nextCode === 42 /* '*' */) {
            this.pos += 2;
            while (this.pos < len) {
              const c = content.charCodeAt(this.pos);
              if (c === 42 /* '*' */ && this.pos + 1 < len && content.charCodeAt(this.pos + 1) === 47 /* '/' */) {
                this.pos += 2;
                break;
              }
              this.pos++;
            }
            continue;
          }
        }
      }

      // Stringhe racchiuse tra virgolette doppie (es. "Percentuale pedale")
      if (charCode === 34 /* '"' */) {
        const start = this.pos;
        this.pos++;
        while (this.pos < len) {
          const c = content.charCodeAt(this.pos);
          if (c === 34 /* '"' */) {
            // Gestione del carattere di escape per le virgolette annidate
            if (content.charCodeAt(this.pos - 1) === 92 /* '\' */) {
              this.pos++;
              continue;
            }
            this.pos++;
            break;
          }
          this.pos++;
        }
        return content.substring(start, this.pos);
      }

      // Estrazione del token standard
      const start = this.pos;
      while (this.pos < len) {
        const c = content.charCodeAt(this.pos);
        if (c <= 32 || c === 34 /* '"' */) {
          break;
        }
        if (c === 47 /* '/' */ && this.pos + 1 < len) {
          const next = content.charCodeAt(this.pos + 1);
          if (next === 47 || next === 42) {
            break;
          }
        }
        this.pos++;
      }
      return content.substring(start, this.pos);
    }
    return null;
  }
}

/**
 * Risolve la dimensione in byte di ciascun tipo dato RAW evitando i bug di restringimento di tipo di TS.
 */
function getStride(t: RawDataType): number {
  if (t === 'uint16' || t === 'int16') return 2;
  if (t === 'float32' || t === 'uint32' || t === 'int32') return 4;
  if (t === 'float64') return 8;
  return 1;
}

/**
 * Parser ASAP2/A2L Stateful ad alte prestazioni basato su compilazione AST.
 * Gestisce nativamente i blocchi nidificati (/begin ... /end) e le relazioni degli assi.
 */
export class A2lParser {
  public static async parse(a2lContent: string, binarySize: number): Promise<MapDefinition[]> {
    const tokenizer = new A2lTokenizer(a2lContent);
    const rootBlock: A2lBlock = { type: 'ROOT', name: 'ROOT', args: [], subBlocks: [] };
    const stack: A2lBlock[] = [rootBlock];

    let token = tokenizer.nextToken();
    let lastYield = Date.now();

    // Fase 1: Compilazione strutturata dell'AST asincrono con gestione del budget temporale
    while (token !== null) {
      const now = Date.now();
      if (now - lastYield > 16) { // Cede l'event loop ogni 16ms per evitare il freeze del thread UI
        await new Promise((resolve) => {
          if (typeof setImmediate === 'function') {
            setImmediate(resolve);
          } else {
            setTimeout(resolve, 0);
          }
        });
        lastYield = Date.now();
      }

      if (token === '/begin') {
        const type = tokenizer.nextToken() ?? 'UNKNOWN';
        const name = tokenizer.nextToken() ?? '';
        const current = stack[stack.length - 1];
        if (current) {
          const newBlock: A2lBlock = { type, name, args: [], subBlocks: [] };
          current.subBlocks.push(newBlock);
          stack.push(newBlock);
        }
      } else if (token === '/end') {
        tokenizer.nextToken(); // Salta il tag di chiusura duplicato (es. CHARACTERISTIC)
        if (stack.length > 1) { // Protezione per prevenire sbilanciamenti strutturali
          stack.pop();
        }
      } else {
        const current = stack[stack.length - 1];
        if (current) {
          current.args.push(token);
        }
      }
      token = tokenizer.nextToken();
    }

    // Fase 2: Estrazione e indicizzazione dei metadati globali (Risoluzione ricorsiva dell'AST)
    const compuMethods = new Map<string, CompuMethodMeta>();
    const recordLayouts = new Map<string, RecordLayoutMeta>();
    const axisPtsMap = new Map<string, AxisPtsMeta>();

    indexCompuMethods(rootBlock, compuMethods);
    indexRecordLayouts(rootBlock, recordLayouts);
    indexAxisPts(rootBlock, axisPtsMap);

    // Fase 3: Estrazione delle caratteristiche
    const mapDefinitions: MapDefinition[] = [];
    constCharacteristics(rootBlock, mapDefinitions, binarySize, compuMethods, recordLayouts, axisPtsMap);
    return mapDefinitions;
  }
}

/**
 * Popola ricorsivamente l'elenco delle caratteristiche compilate.
 */
function constCharacteristics(
  block: A2lBlock,
  list: MapDefinition[],
  binarySize: number,
  compuMethods: Map<string, CompuMethodMeta>,
  recordLayouts: Map<string, RecordLayoutMeta>,
  axisPtsMap: Map<string, AxisPtsMeta>
): void {
  if (block.type === 'CHARACTERISTIC') {
    const def = compileCharacteristic(block, binarySize, compuMethods, recordLayouts, axisPtsMap);
    if (def) {
      list.push(def);
    }
  }
  for (const sub of block.subBlocks) {
    constCharacteristics(sub, list, binarySize, compuMethods, recordLayouts, axisPtsMap);
  }
}

/**
 * Indicizza in modo ricorsivo (DFS) i metodi di computazione globali per la conversione da valori ECU a valori fisici.
 */
function indexCompuMethods(block: A2lBlock, map: Map<string, CompuMethodMeta>): void {
  if (block.type === 'COMPU_METHOD') {
    const name = block.name;
    const args = block.args;
    if (name) {
      let shift = 0;
      if (args[0] && args[0].startsWith('"')) {
        shift = 1; // Salta l'argomento "LongIdentifier" opzionale se presente come stringa quotata
      }

      const convType = args[0 + shift] ?? 'IDENTICAL';
      const unit = (args[2 + shift] ?? 'RAW').replace(/"/g, '');

      let factor = 1.0;
      let offset = 0.0;

      // Ricerca dei coefficienti nei sottomoduli (specifici standard ASAM)
      for (const nested of block.subBlocks) {
        if (nested.type === 'COEFFS_LINEAR' || nested.name === 'COEFFS_LINEAR') {
          const a = parseFloat(nested.args[0] ?? '1.0');
          const b = parseFloat(nested.args[1] ?? '0.0');
          if (!isNaN(a)) factor = a;
          if (!isNaN(b)) offset = b;
        } else if (nested.type === 'COEFFS' || nested.name === 'COEFFS') {
          const a = parseFloat(nested.args[0] ?? '0');
          const b = parseFloat(nested.args[1] ?? '1');
          const c = parseFloat(nested.args[2] ?? '0');
          const d = parseFloat(nested.args[3] ?? '0');
          const e = parseFloat(nested.args[4] ?? '0');
          const f = parseFloat(nested.args[5] ?? '1');
          
          // Formula razionale ASAM: Phys = (f * Int - c) / b (se d = 0, e = 0, a = 0)
          if (a === 0 && d === 0 && e === 0 && b !== 0) {
            factor = f / b;
            offset = -c / b;
          }
        }
      }

      // Fallback per coefficienti definiti inline negli argomenti del blocco principale
      if (convType === 'LINEAR') {
        const idx = args.findIndex((arg) => arg === 'COEFFS_LINEAR');
        if (idx !== -1 && args[idx + 1] && args[idx + 2]) {
          const a = parseFloat(args[idx + 1]);
          const b = parseFloat(args[idx + 2]);
          if (!isNaN(a)) factor = a;
          if (!isNaN(b)) offset = b;
        }
      } else if (convType === 'RAT_FUNC') {
        const idx = args.findIndex((arg) => arg === 'COEFFS');
        if (idx !== -1 && args[idx + 6]) {
          const b = parseFloat(args[idx + 2]);
          const c = parseFloat(args[idx + 3]);
          const f = parseFloat(args[idx + 6]);
          if (b !== 0) {
            factor = f / b;
            offset = -c / b;
          }
        }
      }

      map.set(name, { name, type: convType, unit, factor, offset });
    }
  }

  // Esegue la scansione ricorsiva dei sottomoduli
  for (const sub of block.subBlocks) {
    indexCompuMethods(sub, map);
  }
}

/**
 * Indicizza in modo ricorsivo (DFS) i record layout della memoria per determinare con precisione la formattazione dei dati.
 */
function indexRecordLayouts(block: A2lBlock, map: Map<string, RecordLayoutMeta>): void {
  if (block.type === 'RECORD_LAYOUT') {
    const name = block.name;
    if (name) {
      let dataType: RawDataType = 'uint16';

      for (const nested of block.subBlocks) {
        if (nested.type === 'FNC_VALUES') {
          const typeStr = nested.args[1];
          if (typeStr) {
            dataType = mapA2lDataType(typeStr);
          }
        }
      }

      const fncIdx = block.args.findIndex((arg) => arg === 'FNC_VALUES');
      if (fncIdx !== -1 && block.args[fncIdx + 2]) {
        dataType = mapA2lDataType(block.args[fncIdx + 2]);
      }

      map.set(name, { name, dataType });
    }
  }

  // Esegue la scansione ricorsiva dei sottomoduli
  for (const sub of block.subBlocks) {
    indexRecordLayouts(sub, map);
  }
}

/**
 * Indicizza in modo ricorsivo (DFS) i punti asse condivisi (AXIS_PTS) per estrarre la dimensione reale e la mappatura.
 */
function indexAxisPts(block: A2lBlock, map: Map<string, AxisPtsMeta>): void {
  if (block.type === 'AXIS_PTS') {
    const name = block.name;
    const args = block.args;
    if (name) {
      let shift = 0;
      if (args[0] && args[0].startsWith('"')) {
        shift = 1;
      }

      const addrStr = args[0 + shift] ?? '0';
      const address = addrStr.toLowerCase().startsWith('0x')
        ? parseInt(addrStr.substring(2), 16)
        : parseInt(addrStr, 10);

      const recLayout = args[3 + shift] ?? 'DEFAULT';
      const conversion = args[5 + shift] ?? 'IDENTICAL';
      const sizeStr = args[6 + shift] ?? '1';
      const size = parseInt(sizeStr, 10) || 1;

      map.set(name, {
        name,
        address,
        recordLayout: recLayout,
        conversion,
        size
      });
    }
  }

  // Esegue la scansione ricorsiva dei sottomoduli
  for (const sub of block.subBlocks) {
    indexAxisPts(sub, map);
  }
}

/**
 * Mappa i tipi primitivi ASAM ai tipi standard utilizzati dalla calibrazione.
 */
function mapA2lDataType(typeStr: string): RawDataType {
  const norm = typeStr.toUpperCase();
  if (norm === 'UBYTE') return 'uint8';
  if (norm === 'SBYTE') return 'int8';
  if (norm === 'UWORD') return 'uint16';
  if (norm === 'SWORD') return 'int16';
  if (norm === 'ULONG') return 'uint32';
  if (norm === 'SLONG') return 'int32';
  if (norm === 'FLOAT32_IEEE') return 'float32';
  if (norm === 'FLOAT64_IEEE') return 'float32';

  if (norm.includes('INT8') || norm.includes('BYTE')) {
    return norm.startsWith('U') ? 'uint8' : 'int8';
  }
  if (norm.includes('INT16') || norm.includes('WORD')) {
    return norm.startsWith('U') ? 'uint16' : 'int16';
  }
  if (norm.includes('INT32') || norm.includes('LONG')) {
    return norm.startsWith('U') ? 'uint32' : 'int32';
  }
  if (norm.includes('FLOAT') || norm.includes('32')) {
    return 'float32';
  }
  return 'uint16';
}

/**
 * Compila un singolo blocco CHARACTERISTIC incrociando i metadati globali per l'assegnazione corretta dei parametri fisici.
 */
function compileCharacteristic(
  block: A2lBlock,
  binarySize: number,
  compuMethods: Map<string, CompuMethodMeta>,
  recordLayouts: Map<string, RecordLayoutMeta>,
  axisPtsMap: Map<string, AxisPtsMeta>
): MapDefinition | null {
  const label = block.name;
  const args = block.args;

  let shift = 0;
  if (args[0] && args[0].startsWith('"')) {
    shift = 1;
  }

  const charType = args[0 + shift] ?? 'VALUE';
  const addressStr = args[1 + shift] ?? '0x0';
  let address = addressStr.toLowerCase().startsWith('0x')
    ? parseInt(addressStr.substring(2), 16)
    : parseInt(addressStr, 10);

  if (isNaN(address)) return null;

  // Traduzione automatica degli indirizzi virtuali hardware ECU (es. segmenti flash Aurix/Tricore)
  if (address >= 0x80000000) {
    address = address & 0x1fffffff; // Trasforma l'indirizzo virtuale nell'offset reale del file binario
  } else if (address >= 0x800000 && binarySize < 0x800000) {
    address = address - 0x800000;
  }

  const recordLayout = args[2 + shift] ?? 'DEFAULT';
  const conversionRef = args[4 + shift] ?? 'IDENTICAL';

  // Risoluzione esatta del tipo di dato tramite Record Layout
  let dataType: RawDataType = 'uint16';
  const resolvedLayout = recordLayouts.get(recordLayout);
  if (resolvedLayout) {
    dataType = resolvedLayout.dataType;
  } else {
    // Heuristics di fallback in mancanza del layout nel file A2L
    const rlLower = recordLayout.toLowerCase();
    if (rlLower.includes('8') || rlLower.includes('byte') || rlLower.includes('char')) {
      dataType = rlLower.startsWith('s') ? 'int8' : 'uint8';
    } else if (rlLower.includes('float') || rlLower.includes('32')) {
      dataType = 'float32';
    } else if (rlLower.includes('32') || rlLower.includes('long')) {
      dataType = rlLower.startsWith('s') ? 'int32' : 'uint32';
    } else if (rlLower.includes('16') || rlLower.includes('word')) {
      dataType = rlLower.startsWith('s') ? 'int16' : 'uint16';
    }
  }

  // Valori dimensionali standard in base al tipo di oggetto grafico
  let cols = 1;
  let rows = 1;

  if (charType === 'VAL_BLK') {
    cols = 8;
  } else if (charType === 'CURVE') {
    cols = 8;
    rows = 1;
  } else if (charType === 'MAP' || charType === 'CUBIC') {
    cols = 16;
    rows = 12;
  }

  // Risoluzione della formula di calcolo reale per factor e offset
  let factor = 1.0;
  let offsetA2l = 0.0;
  let unit = 'RAW';

  const method = compuMethods.get(conversionRef);
  if (method) {
    factor = method.factor;
    offsetA2l = method.offset;
    unit = method.unit;
  }

  // Ispezione avanzata dei sottomoduli (es. MATRIX_DIM, COMPU_METHOD, AXIS_DESCR)
  const xAxisProps = { label: 'Asse X', unit: '', values: [] as number[], size: 0 };
  const yAxisProps = { label: 'Asse Y', unit: '', values: [] as number[], size: 0 };
  let axisCount = 0;

  for (const sub of block.subBlocks) {
    if (sub.type === 'MATRIX_DIM') {
      const c = parseInt(sub.args[0] ?? '8', 10);
      const r = parseInt(sub.args[1] ?? '1', 10);
      if (!isNaN(c)) cols = c;
      if (!isNaN(r)) rows = r;
    } else if (sub.type === 'COMPU_METHOD') {
      const ref = sub.name;
      const inlineMethod = compuMethods.get(ref);
      if (inlineMethod) {
        factor = inlineMethod.factor;
        offsetA2l = inlineMethod.offset;
        unit = inlineMethod.unit;
      } else {
        const refLower = ref.toLowerCase();
        if (refLower.includes('factor_0_01') || refLower.includes('0_01')) {
          factor = 0.01;
        } else if (refLower.includes('factor_0_1') || refLower.includes('0_1')) {
          factor = 0.1;
        }
      }
    } else if (sub.type === 'FORMAT') {
      const fmt = sub.args[0]?.replace(/"/g, '') ?? 'RAW';
      if (fmt && unit === 'RAW') {
        unit = fmt;
      }
    } else if (sub.type === 'AXIS_DESCR') {
      axisCount++;
      const axisConv = sub.args[2] ?? 'IDENTICAL';
      const axisSize = parseInt(sub.args[3] ?? '1', 10) || 1;

      let axisLabel = axisCount === 1 ? 'Asse X' : 'Asse Y';
      let axisUnit = 'RAW';
      let axisFactor = 1.0;
      let axisOffset = 0.0;

      const axisMethod = compuMethods.get(axisConv);
      if (axisMethod) {
        axisUnit = axisMethod.unit;
        axisFactor = axisMethod.factor;
        axisOffset = axisMethod.offset;
      }

      // Ricerca del riferimento a un asse condiviso (AXIS_PTS_REF)
      let refPtsName = '';
      for (const axisSub of sub.subBlocks) {
        if (axisSub.type === 'AXIS_PTS_REF' || axisSub.name === 'AXIS_PTS_REF') {
          refPtsName = axisSub.args[0] ?? '';
        }
      }
      const ptsRefIdx = sub.args.findIndex((a) => a === 'AXIS_PTS_REF');
      if (ptsRefIdx !== -1 && sub.args[ptsRefIdx + 1]) {
        refPtsName = sub.args[ptsRefIdx + 1];
      }

      let finalSize = axisSize;
      if (refPtsName) {
        const sharedPts = axisPtsMap.get(refPtsName);
        if (sharedPts) {
          finalSize = sharedPts.size;
          const ptsMethod = compuMethods.get(sharedPts.conversion);
          if (ptsMethod) {
            axisUnit = ptsMethod.unit;
            axisFactor = ptsMethod.factor;
            axisOffset = ptsMethod.offset;
          }
        }
      }

      // Popola le proprietà dell'asse X o Y
      if (axisCount === 1) {
        cols = finalSize;
        xAxisProps.label = axisLabel;
        xAxisProps.unit = axisUnit;
        xAxisProps.size = finalSize;
        xAxisProps.values = Array.from({ length: finalSize }, (_, idx) => idx * axisFactor + axisOffset);
      } else if (axisCount === 2) {
        rows = finalSize;
        yAxisProps.label = axisLabel;
        yAxisProps.unit = axisUnit;
        yAxisProps.size = finalSize;
        yAxisProps.values = Array.from({ length: finalSize }, (_, idx) => idx * axisFactor + axisOffset);
      }
    }
  }

  // Verifica dei limiti di sicurezza per prevenire letture fuori dai confini del binario (Out of Bounds)
  const stride = getStride(dataType);
  const totalBytes = cols * rows * stride;
  if (address + totalBytes > binarySize) {
    return null;
  }

  // Generazione dei valori di asse di riserva (fallback se non definiti da AXIS_DESCR)
  if (xAxisProps.values.length === 0) {
    xAxisProps.values = Array.from({ length: cols }, (_, index) => index * 10);
  }
  if (yAxisProps.values.length === 0) {
    yAxisProps.values = Array.from({ length: rows }, (_, index) => index * 10);
  }

  return {
    id: `a2l_${label}`,
    label,
    unit,
    offset: address,
    cols,
    rows,
    dataType,
    endianness: Endianness.LittleEndian,
    factor,
    offsetA2l,
    checksumBlocks: ['block_main'],
    xAxis: {
      label: xAxisProps.label,
      unit: xAxisProps.unit,
      values: xAxisProps.values
    },
    yAxis: {
      label: yAxisProps.label,
      unit: yAxisProps.unit,
      values: yAxisProps.values
    }
  };
}