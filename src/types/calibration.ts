export const enum Endianness {
  LittleEndian = 0,
  BigEndian    = 1,
}

export type EcuFamily = 'EDC15' | 'EDC16' | 'EDC17' | 'MD1' | 'SID807' | 'GENERIC';
export type SessionStatus = 'idle' | 'parsing' | 'ready' | 'writing' | 'error';

export type RawDataType =
  | 'float32' | 'float64' | 'uint8' | 'int8'
  | 'uint16'  | 'int16' | 'uint32' | 'int32';

export interface AxisDefinition {
  label: string;
  unit: string;
  values: number[];
}

export interface MapDefinition {
  id: string;
  label: string;
  unit: string;
  offset: number;
  cols: number;
  rows: number;
  dataType: RawDataType;
  endianness: Endianness;
  factor: number;
  offsetA2l: number;
  bitmask?: number;
  bitShift?: number;
  checksumBlocks: string[];
  xAxis?: AxisDefinition;
  yAxis?: AxisDefinition;
  isPointer?: boolean;
  swappedAxes?: boolean;
  formulaForward?: string;
  formulaReverse?: string;
  physMin?: number;
  physMax?: number;
}

export interface ChecksumBlockDefinition {
  id: string;
  strategy: 'additive16twos' | 'crc32_custom' | 'multilevel';
  regionStart: number;
  regionEnd: number;
  storeOffset: number;
  storeDataType: 'uint16' | 'uint32';
  storeEndianness: Endianness;
  polynomial?: number;
  initXor?: number;
  finalXor?: number;
  refIn?: boolean;
  refOut?: boolean;
  parentBlockId?: string;
  descriptorOffset?: number;
}

export interface ParsedCell {
  col: number;
  row: number;
  physical: number;
}

export interface ParsedMap {
  mapId: string;
  label: string;
  unit: string;
  cols: number;
  rows: number;
  cells: ParsedCell[];
  xAxis?: AxisDefinition;
  yAxis?: AxisDefinition;
}

export interface CellDelta {
  col: number;
  row: number;
  newPhysical: number;
}

export interface PatchRequest {
  mapId: string;
  deltas: CellDelta[];
}

export interface PatchResponse {
  success: boolean;
  message: string;
  patchedBinary?: string;
}

export type MathOperation =
  | { kind: 'add';      value: number }
  | { kind: 'multiply'; value: number }
  | { kind: 'set';      value: number }
  | { kind: 'interpolate' };
