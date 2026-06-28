import { NextResponse } from 'next/server';
import { Endianness } from '@/types/calibration';
import { CHECKSUM_DEFINITIONS } from '@/lib/definitions';
import { ChecksumEngine } from '@/lib/server/ChecksumEngine';

export const runtime = 'nodejs';

export async function GET() {
  // Generiamo un file binario di 2048 byte riempito di valori realistici
  const buffer = new ArrayBuffer(2048);
  const view = new DataView(buffer);

  // Mappa 1: Driver's Wish (offset 0, 16x12 uint16 = 384 byte)
  // Rampa reale di coppia motrice richiesta (0 -> 450 Nm)
  let offset = 0;
  for (let r = 0; r < 12; r++) {
    const pedalFactor = r / 11; // 0% a 100%
    for (let c = 0; c < 16; c++) {
      const rpmFactor = c < 8 ? (c / 8) : (1 - (c - 8) / 8); // curve di erogazione
      const rawValue = Math.round((pedalFactor * 4500 * (0.3 + rpmFactor * 0.7)));
      view.setUint16(offset, rawValue, true);
      offset += 2;
    }
  }

  // Mappa 2: Limitatore di Coppia (offset 512, 12x4 int16 = 96 byte)
  offset = 512;
  const torqueCurve = [2500, 3800, 4200, 4100, 4000, 3800, 3600, 3400, 3000, 2600, 2000, 1500];
  for (let r = 0; r < 4; r++) {
    const pressureLoss = 1 - (3 - r) * 0.08; // perdita di efficienza ad alte quote
    for (let c = 0; c < 12; c++) {
      const baseTorque = torqueCurve[c] ?? 2000;
      const rawValue = Math.round(baseTorque * pressureLoss);
      view.setInt16(offset, rawValue, true);
      offset += 2;
    }
  }

  // Mappa 3: Boost Target (offset 704, 8x8 uint16 = 128 byte)
  offset = 704;
  for (let r = 0; r < 8; r++) {
    const rpmBonus = r * 50;
    for (let c = 0; c < 8; c++) {
      const loadBonus = c * 120;
      const rawValue = 1000 + rpmBonus + loadBonus; // pressione mbar (1000 -> 2340 mbar)
      view.setUint16(offset, rawValue, true);
      offset += 2;
    }
  }

  // Mappa 4: EGR Duty Cycle (offset 832, 8x4 uint16 = 64 byte)
  offset = 832;
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 8; c++) {
      // EGR aperta al minimo e basso carico, chiusa ad alti regimi/carico
      const rawValue = Math.round(Math.max(50, 9500 - (r * 1500) - (c * 800)));
      view.setUint16(offset, rawValue, true);
      offset += 2;
    }
  }

  // Calcolo del Checksum Reale e scrittura all'offset 1022
  const engine = new ChecksumEngine(CHECKSUM_DEFINITIONS);
  engine.applyBlocks(buffer, ['block_main']);

  return new NextResponse(Buffer.from(buffer), {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': 'attachment; filename="ECU_EDC16_Sandbox_Original.bin"',
    },
  });
}
