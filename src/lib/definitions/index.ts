import type { MapDefinition, ChecksumBlockDefinition } from '@/types/calibration';
import { Endianness } from '@/types/calibration';

export const MAP_DEFINITIONS: MapDefinition[] = [
  {
    id: 'drivers_wish',
    label: "Driver's Wish (Richiesta Pedale)",
    unit: 'Nm (Coppia)',
    offset: 0,
    cols: 16,
    rows: 12,
    dataType: 'uint16',
    endianness: Endianness.LittleEndian,
    factor: 0.1,
    offsetA2l: 0,
    checksumBlocks: ['block_main'],
    xAxis: {
      label: 'Giri Motore',
      unit: 'RPM',
      values: [800, 1000, 1200, 1500, 1800, 2000, 2250, 2500, 3000, 3500, 4000, 4500, 4800, 5000, 5200, 5500]
    },
    yAxis: {
      label: 'Posizione Pedale',
      unit: '%',
      values: [0, 5, 10, 15, 20, 30, 40, 50, 60, 75, 90, 100]
    }
  },
  {
    id: 'torque_limiter',
    label: 'Limitatore di Coppia (Coppia Max)',
    unit: 'Nm',
    offset: 512,
    cols: 12,
    rows: 4,
    dataType: 'int16',
    endianness: Endianness.LittleEndian,
    factor: 0.1,
    offsetA2l: 0,
    checksumBlocks: ['block_sub_cal', 'block_main'],
    xAxis: {
      label: 'Giri Motore',
      unit: 'RPM',
      values: [1000, 1500, 1800, 2000, 2250, 2500, 2800, 3000, 3500, 4000, 4500, 4800]
    },
    yAxis: {
      label: 'Pressione Atmosferica',
      unit: 'hPa',
      values: [800, 900, 1000, 1050]
    }
  },
  {
    id: 'boost_target',
    label: 'Pressione Turbo Obiettivo',
    unit: 'mbar',
    offset: 704,
    cols: 8,
    rows: 8,
    dataType: 'uint16',
    endianness: Endianness.LittleEndian,
    factor: 1.0,
    offsetA2l: 0,
    checksumBlocks: ['block_sub_cal', 'block_main'],
    xAxis: {
      label: 'Iniezione Quantità',
      unit: 'mg/str',
      values: [10, 20, 30, 40, 50, 60, 70, 80]
    },
    yAxis: {
      label: 'Giri Motore',
      unit: 'RPM',
      values: [1200, 1500, 1800, 2000, 2500, 3000, 3500, 4000]
    }
  },
  {
    id: 'egr_duty_cycle',
    label: 'Valvola EGR (Ricircolo Gas Scarico)',
    unit: '% Duty',
    offset: 832,
    cols: 8,
    rows: 4,
    dataType: 'uint16',
    endianness: Endianness.LittleEndian,
    factor: 0.01,
    offsetA2l: 0,
    checksumBlocks: ['block_main'],
    xAxis: {
      label: 'Massa Aria',
      unit: 'mg/hub',
      values: [200, 350, 500, 650, 800, 950, 1100, 1200]
    },
    yAxis: {
      label: 'Giri Motore',
      unit: 'RPM',
      values: [800, 1500, 2200, 3000]
    }
  }
];

export const CHECKSUM_DEFINITIONS: ChecksumBlockDefinition[] = [
  {
    id: 'block_main',
    strategy: 'additive16twos',
    regionStart: 0,
    regionEnd: 900,
    storeOffset: 1022,
    storeDataType: 'uint16',
    storeEndianness: Endianness.LittleEndian,
  },
  // Configurazione blocco secondario calibrazione (CRC32 multilivello annidato)
  {
    id: 'block_sub_cal',
    strategy: 'crc32_custom',
    regionStart: 512,
    regionEnd: 832,
    storeOffset: 1016,
    storeDataType: 'uint32',
    storeEndianness: Endianness.LittleEndian,
    polynomial: 0x04C11DB7,
    initXor: 0xFFFFFFFF,
    finalXor: 0xFFFFFFFF,
    refIn: true,
    refOut: true,
    parentBlockId: 'block_main',
    descriptorOffset: 12 // Scrive il checksum calcolato all'interno del blocco descrittore principale
  }
];

export function getMapById(id: string): MapDefinition | undefined {
  return MAP_DEFINITIONS.find(m => m.id === id);
}

export const mapIdRegistry = new Map<string, string>();
