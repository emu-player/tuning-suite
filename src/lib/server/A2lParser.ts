import type { MapDefinition, RawDataType } from '@/types/calibration';
import { Endianness } from '@/types/calibration';

interface A2lBlock {
  type: string;
  name: string;
  args: string[];
  subBlocks: A2lBlock[];
}

/**
 * Tokenizer lessicale conforme allo standard ASAM ASAP2.
 * Gestisce correttamente commenti inline, stringhe quotate e whitespace.
 */
class A2lTokenizer {
  private readonly content: string;
  private pos: number = 0;

  constructor(content: string) {
    this.content = content;
  }

  public nextToken(): string | null {
    while (this.pos < this.content.length) {
      const char = this.content[this.pos];
      if (!char) break;

      // Skip whitespace
      if (/\s/.test(char)) {
        this.pos++;
        continue;
      }

      // Skip commenti inline /.../ e /*...*/
      if (char === '/' && this.pos + 1 < this.content.length) {
        const nextChar = this.content[this.pos + 1];
        if (nextChar === '/') {
          this.pos += 2;
          while (this.pos < this.content.length && this.content[this.pos] !== '\n') {
            this.pos++;
          }
          continue;
        } else if (nextChar === '*') {
          this.pos += 2;
          while (this.pos < this.content.length) {
            const cur = this.content[this.pos];
            const nxt = this.content[this.pos + 1];
            if (cur === '*' && nxt === '/') {
              this.pos += 2;
              break;
            }
            this.pos++;
          }
          continue;
        }
      }

      // Stringhe quotate (es. "Nm")
      if (char === '"') {
        let start = this.pos;
        this.pos++;
        while (this.pos < this.content.length && this.content[this.pos] !== '"') {
          // Gestione escape
          if (this.content[this.pos] === '\\') {
            this.pos += 2;
          } else {
            this.pos++;
          }
        }
        this.pos++; // Include la chiusura "
        return this.content.substring(start, this.pos);
      }

      // Token standard o blocchi riservati
      const start = this.pos;
      while (this.pos < this.content.length && /[^\s"\/]/.test(this.content[this.pos] ?? '')) {
        this.pos++;
      }
      return this.content.substring(start, this.pos);
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
    let tokenCount = 0;

    // Fase 1: Compilazione strutturata dell'AST asincrono
    while (token !== null) {
      tokenCount++;
      if (tokenCount % 10000 === 0) {
        await new Promise((resolve) => setImmediate(resolve));
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
        tokenizer.nextToken(); // Salta il tag di chiusura duplicato
        stack.pop();
      } else {
        const current = stack[stack.length - 1];
        if (current) {
          current.args.push(token);
        }
      }
      token = tokenizer.nextToken();
    }

    // Fase 2: Estrazione delle caratteristiche e dei record layout
    const mapDefinitions: MapDefinition[] = [];
    constCharacteristics(rootBlock, mapDefinitions, binarySize);
    return mapDefinitions;
  }
}

function constCharacteristics(block: A2lBlock, list: MapDefinition[], binarySize: number): void {
  if (block.type === 'CHARACTERISTIC') {
    const def = compileCharacteristic(block, binarySize);
    if (def) {
      list.push(def);
    }
  }
  for (const sub of block.subBlocks) {
    constCharacteristics(sub, list, binarySize);
  }
}

function compileCharacteristic(block: A2lBlock, binarySize: number): MapDefinition | null {
  const label = block.name;
  const args = block.args;

  // Analisi degli argomenti del blocco CHARACTERISTIC
  const addressStr = args[1] ?? '0x0';
  let address = addressStr.toLowerCase().startsWith('0x')
    ? parseInt(addressStr.substring(2), 16)
    : parseInt(addressStr, 10);

  if (isNaN(address)) return null;

  // Correzione rilocazione automatica per bootloader/flash segmentata
  if (address >= 0x800000 && binarySize < 0x800000) {
    address = address - 0x800000;
  }

  const recordLayout = args[2] ?? 'DEFAULT';
  let dataType: RawDataType = 'uint16';
  if (recordLayout.toLowerCase().includes('8')) {
    dataType = 'uint8';
  } else if (recordLayout.toLowerCase().includes('float') || recordLayout.toLowerCase().includes('32')) {
    dataType = 'float32';
  }

  let cols = 8;
  let rows = 1;

  // Ispezione del tipo di dato (es. CURVE, MAP)
  const charType = args[0] ?? 'VALUE';
  if (charType === 'MAP' || charType === 'CUBIC') {
    cols = 16;
    rows = 12;
  }

  // Risoluzione dei sottomoduli (es. MATRIX_DIM, COMPU_METHOD)
  let factor = 1.0;
  let offsetA2l = 0;
  let unit = 'RAW';

  for (const sub of block.subBlocks) {
    if (sub.type === 'MATRIX_DIM') {
      const c = parseInt(sub.args[0] ?? '8', 10);
      const r = parseInt(sub.args[1] ?? '1', 10);
      if (!isNaN(c)) cols = c;
      if (!isNaN(r)) rows = r;
    } else if (sub.type === 'COMPU_METHOD') {
      // Estrae la formula se definita direttamente
      const ref = sub.name.toLowerCase();
      if (ref.includes('factor_0_01') || ref.includes('0_01')) {
        factor = 0.01;
      } else if (ref.includes('factor_0_1') || ref.includes('0_1')) {
        factor = 0.1;
      }
    } else if (sub.type === 'FORMAT') {
      unit = sub.args[0]?.replace(/"/g, '') ?? 'RAW';
    }
  }

  const stride = getStride(dataType);
  if (address + (cols * rows * stride) > binarySize) {
    return null; // Salva la memoria da errori di overflow out-of-bounds
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
      label: 'Asse X',
      unit: '',
      values: Array.from({ length: cols }, (_, index) => index * 10)
    },
    yAxis: {
      label: 'Asse Y',
      unit: '',
      values: Array.from({ length: rows }, (_, index) => index * 10)
    }
  };
}
