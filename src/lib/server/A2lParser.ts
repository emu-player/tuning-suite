import type { MapDefinition, RawDataType } from '@/types/calibration';
import { Endianness } from '@/types/calibration';

interface A2lBlock { type: string; name: string; args: string[]; subBlocks: A2lBlock[]; }
interface CompuMethodMeta { name: string; type: string; unit: string; factor: number; offset: number; }
interface RecordLayoutMeta { name: string; dataType: RawDataType; }
interface AxisPtsMeta { name: string; address: number; recordLayout: string; conversion: string; size: number; }

class A2lTokenizer {
  private readonly content: string;
  private readonly length: number;
  private pos: number = 0;
  constructor(content: string) { this.content = content; this.length = content.length; }

  public nextToken(): string | null {
    const len = this.length;
    const content = this.content;
    while (this.pos < len) {
      const charCode = content.charCodeAt(this.pos);
      if (charCode <= 32) { this.pos++; continue; }
      if (charCode === 47) {
        if (this.pos + 1 < len) {
          const nextCode = content.charCodeAt(this.pos + 1);
          if (nextCode === 47) {
            this.pos += 2;
            while (this.pos < len && content.charCodeAt(this.pos) !== 10 && content.charCodeAt(this.pos) !== 13) this.pos++;
            continue;
          } else if (nextCode === 42) {
            this.pos += 2;
            while (this.pos < len) {
              if (content.charCodeAt(this.pos) === 42 && this.pos + 1 < len && content.charCodeAt(this.pos + 1) === 47) {
                this.pos += 2; break;
              }
              this.pos++;
            }
            continue;
          }
        }
      }
      if (charCode === 34) {
        const start = this.pos++;
        while (this.pos < len) {
          if (content.charCodeAt(this.pos) === 34) {
            if (content.charCodeAt(this.pos - 1) === 92) { this.pos++; continue; }
            this.pos++; break;
          }
          this.pos++;
        }
        return content.substring(start, this.pos);
      }
      const start = this.pos;
      while (this.pos < len) {
        const c = content.charCodeAt(this.pos);
        if (c <= 32 || c === 34) break;
        if (c === 47 && this.pos + 1 < len && (content.charCodeAt(this.pos + 1) === 47 || content.charCodeAt(this.pos + 1) === 42)) break;
        this.pos++;
      }
      return content.substring(start, this.pos);
    }
    return null;
  }
}

function getStride(t: RawDataType): number {
  if (t === 'uint16' || t === 'int16') return 2;
  if (t === 'float32' || t === 'uint32' || t === 'int32') return 4;
  if (t === 'float64') return 8;
  return 1;
}

export class A2lParser {
  public static async parse(a2lContent: string, binary: ArrayBuffer): Promise<MapDefinition[]> {
    const tokenizer = new A2lTokenizer(a2lContent);
    const rootBlock: A2lBlock = { type: 'ROOT', name: 'ROOT', args: [], subBlocks: [] };
    const stack: A2lBlock[] = [rootBlock];
    let token = tokenizer.nextToken();
    
    // Chunking per prevenire l'hang dell'Event Loop con A2L enormi
    let iterCount = 0;
    while (token !== null) {
      if (++iterCount % 8000 === 0) {
        await new Promise(r => setTimeout(r, 0));
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
        tokenizer.nextToken();
        if (stack.length > 1) stack.pop();
      } else {
        const current = stack[stack.length - 1];
        if (current) current.args.push(token);
      }
      token = tokenizer.nextToken();
    }

    const compuMethods = new Map<string, CompuMethodMeta>();
    const recordLayouts = new Map<string, RecordLayoutMeta>();
    const axisPtsMap = new Map<string, AxisPtsMeta>();

    indexCompuMethods(rootBlock, compuMethods);
    indexRecordLayouts(rootBlock, recordLayouts);
    indexAxisPts(rootBlock, axisPtsMap);

    const mapDefinitions: MapDefinition[] = [];
    constCharacteristics(rootBlock, mapDefinitions, binary, compuMethods, recordLayouts, axisPtsMap);
    return mapDefinitions;
  }
}

function indexCompuMethods(block: A2lBlock, map: Map<string, CompuMethodMeta>): void {
  if (block.type === 'COMPU_METHOD' && block.name) {
    const shift = (block.args[0] && block.args[0].startsWith('"')) ? 1 : 0;
    const convType = block.args[0 + shift] ?? 'IDENTICAL';
    const unit = (block.args[2 + shift] ?? 'RAW').replace(/"/g, '');
    let factor = 1.0, offset = 0.0;

    for (const nested of block.subBlocks) {
      if (nested.type === 'COEFFS_LINEAR' || nested.name === 'COEFFS_LINEAR') {
        const a = parseFloat(nested.args[0] ?? '1.0'), b = parseFloat(nested.args[1] ?? '0.0');
        if (!isNaN(a)) factor = a; if (!isNaN(b)) offset = b;
      }
    }
    map.set(block.name, { name: block.name, type: convType, unit, factor, offset });
  }
  for (const sub of block.subBlocks) indexCompuMethods(sub, map);
}

function indexRecordLayouts(block: A2lBlock, map: Map<string, RecordLayoutMeta>): void {
  if (block.type === 'RECORD_LAYOUT' && block.name) {
    let dataType: RawDataType = 'uint16';
    const fncIdx = block.args.findIndex((arg) => arg === 'FNC_VALUES');
    if (fncIdx !== -1 && block.args[fncIdx + 2]) {
      const ts = block.args[fncIdx + 2]!.toUpperCase();
      if (ts.includes('8') || ts.includes('BYTE')) dataType = ts.startsWith('S') ? 'int8' : 'uint8';
      else if (ts.includes('32') || ts.includes('LONG')) dataType = ts.startsWith('S') ? 'int32' : 'uint32';
      else if (ts.includes('FLOAT')) dataType = 'float32';
    }
    map.set(block.name, { name: block.name, dataType });
  }
  for (const sub of block.subBlocks) indexRecordLayouts(sub, map);
}

function indexAxisPts(block: A2lBlock, map: Map<string, AxisPtsMeta>): void {
  if (block.type === 'AXIS_PTS' && block.name) {
    const shift = (block.args[0] && block.args[0].startsWith('"')) ? 1 : 0;
    const addrStr = block.args[0 + shift] ?? '0';
    const address = addrStr.toLowerCase().startsWith('0x') ? parseInt(addrStr.substring(2), 16) : parseInt(addrStr, 10);
    const recLayout = block.args[3 + shift] ?? 'DEFAULT';
    const conversion = block.args[5 + shift] ?? 'IDENTICAL';
    const size = parseInt(block.args[6 + shift] ?? '1', 10) || 1;
    map.set(block.name, { name: block.name, address, recordLayout: recLayout, conversion, size });
  }
  for (const sub of block.subBlocks) indexAxisPts(sub, map);
}

function constCharacteristics(
  block: A2lBlock, list: MapDefinition[], binary: ArrayBuffer,
  compuMethods: Map<string, CompuMethodMeta>,
  recordLayouts: Map<string, RecordLayoutMeta>,
  axisPtsMap: Map<string, AxisPtsMeta>
): void {
  if (block.type === 'CHARACTERISTIC') {
    const def = compileCharacteristic(block, binary, compuMethods, recordLayouts, axisPtsMap);
    if (def) list.push(def);
  }
  for (const sub of block.subBlocks) {
    constCharacteristics(sub, list, binary, compuMethods, recordLayouts, axisPtsMap);
  }
}

function compileCharacteristic(
  block: A2lBlock, binary: ArrayBuffer,
  compuMethods: Map<string, CompuMethodMeta>, recordLayouts: Map<string, RecordLayoutMeta>, axisPtsMap: Map<string, AxisPtsMeta>
): MapDefinition | null {
  const label = block.name;
  const args = block.args;
  const shift = (args[0] && args[0].startsWith('"')) ? 1 : 0;
  const charType = args[0 + shift] ?? 'VALUE';
  const addressStr = args[1 + shift] ?? '0x0';
  let address = addressStr.toLowerCase().startsWith('0x') ? parseInt(addressStr.substring(2), 16) : parseInt(addressStr, 10);
  if (isNaN(address)) return null;

  if (address >= 0x80000000) address = address & 0x1fffffff;
  else if (address >= 0x800000 && binary.byteLength < 0x800000) address -= 0x800000;

  const recordLayout = args[2 + shift] ?? 'DEFAULT';
  const conversionRef = args[4 + shift] ?? 'IDENTICAL';

  let dataType: RawDataType = 'uint16';
  const resolvedLayout = recordLayouts.get(recordLayout);
  if (resolvedLayout) dataType = resolvedLayout.dataType;

  let cols = 1, rows = 1;
  if (charType === 'VAL_BLK' || charType === 'CURVE') cols = 8;
  else if (charType === 'MAP' || charType === 'CUBIC') { cols = 16; rows = 12; }

  let factor = 1.0, offsetA2l = 0.0, unit = 'RAW';
  const method = compuMethods.get(conversionRef);
  if (method) { factor = method.factor; offsetA2l = method.offset; unit = method.unit; }

  const xAxisProps = { label: 'Asse X', unit: '', values: [] as number[], size: 0 };
  const yAxisProps = { label: 'Asse Y', unit: '', values: [] as number[], size: 0 };
  let axisCount = 0;

  const view = new DataView(binary);

  for (const sub of block.subBlocks) {
    if (sub.type === 'MATRIX_DIM') {
      const c = parseInt(sub.args[0] ?? '8', 10), r = parseInt(sub.args[1] ?? '1', 10);
      if (!isNaN(c)) cols = c; if (!isNaN(r)) rows = r;
    } else if (sub.type === 'AXIS_DESCR') {
      axisCount++;
      const axisConv = sub.args[2] ?? 'IDENTICAL';
      const axisSize = parseInt(sub.args[3] ?? '1', 10) || 1;
      let axisFactor = 1.0, axisOffset = 0.0;

      const axisMethod = compuMethods.get(axisConv);
      if (axisMethod) { axisFactor = axisMethod.factor; axisOffset = axisMethod.offset; }

      let refPtsName = '';
      for (const axisSub of sub.subBlocks) {
        if (axisSub.type === 'AXIS_PTS_REF' || axisSub.name === 'AXIS_PTS_REF') refPtsName = axisSub.args[0] ?? '';
      }
      
      let values = Array.from({ length: axisSize }, (_, idx) => idx * axisFactor + axisOffset);

      // Recursive Resolution of AXIS_PTS directly from binary
      if (refPtsName) {
        const sharedPts = axisPtsMap.get(refPtsName);
        if (sharedPts) {
          const ptsMethod = compuMethods.get(sharedPts.conversion);
          const ptsFactor = ptsMethod?.factor ?? 1.0;
          const ptsOffset = ptsMethod?.offset ?? 0.0;
          
          const ptsLayout = recordLayouts.get(sharedPts.recordLayout);
          const ptsDataType = ptsLayout ? ptsLayout.dataType : 'uint16';
          const ptsStride = getStride(ptsDataType);
          
          let addr = sharedPts.address;
          if (addr >= 0x80000000) addr &= 0x1fffffff;
          else if (addr >= 0x800000 && binary.byteLength < 0x800000) addr -= 0x800000;

          if (addr + sharedPts.size * ptsStride <= binary.byteLength) {
             values = [];
             for(let i=0; i<sharedPts.size; i++) {
                // Semplificazione: assume uint16 per la lettura rapida degli assi condivisi se il tipo esatto non è noto
                let raw = 0;
                if (ptsDataType === 'uint8') raw = view.getUint8(addr + i);
                else if (ptsDataType === 'uint16') raw = view.getUint16(addr + i*2, true);
                else if (ptsDataType === 'uint32') raw = view.getUint32(addr + i*4, true);
                else raw = view.getUint16(addr + i*2, true);
                values.push(raw * ptsFactor + ptsOffset);
             }
          }
        }
      }

      if (axisCount === 1) { cols = values.length || axisSize; xAxisProps.values = values; }
      else if (axisCount === 2) { rows = values.length || axisSize; yAxisProps.values = values; }
    }
  }

  if (address + cols * rows * getStride(dataType) > binary.byteLength) return null;

  if (xAxisProps.values.length === 0) xAxisProps.values = Array.from({ length: cols }, (_, i) => i * 10);
  if (yAxisProps.values.length === 0) yAxisProps.values = Array.from({ length: rows }, (_, i) => i * 10);

  return {
    id: `a2l_${label}`, label, unit, offset: address, cols, rows, dataType,
    endianness: Endianness.LittleEndian, factor, offsetA2l, checksumBlocks: ['block_main'],
    xAxis: { label: xAxisProps.label, unit: xAxisProps.unit, values: xAxisProps.values },
    yAxis: { label: yAxisProps.label, unit: yAxisProps.unit, values: yAxisProps.values }
  };
}
