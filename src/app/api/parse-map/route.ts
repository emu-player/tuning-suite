import { NextRequest, NextResponse } from 'next/server';
import { BinaryParser } from '@/lib/server/BinaryParser';
import { XdfParser } from '@/lib/server/XdfParser';
import { A2lParser } from '@/lib/server/A2lParser';
import { MAP_DEFINITIONS } from '@/lib/definitions';
import { FileCache } from '@/lib/server/Cache';
import type { MapDefinition, ParsedMap } from '@/types/calibration';
import { createHash, randomBytes } from 'node:crypto';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file');
    const driver = formData.get('driver');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Nessun file binario ricevuto.' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = arrayBuffer.slice(0);

    let targetDefinitions = MAP_DEFINITIONS;

    if (driver instanceof File) {
      const driverContent = await driver.text();
      if (driver.name.toLowerCase().endsWith('.xdf')) {
        targetDefinitions = XdfParser.parse(driverContent, buffer.byteLength);
      } else if (driver.name.toLowerCase().endsWith('.a2l')) {
        targetDefinitions = await A2lParser.parse(driverContent, buffer);
      }
    }

    if (targetDefinitions.length === 0) {
      return NextResponse.json({ error: 'Nessun driver valido estratto o compatibile.' }, { status: 422 });
    }

    const parser = new BinaryParser(buffer);
    const parsedMaps: ParsedMap[] = [];

    // Limit to 100 maps maximum to avoid payload overflow in massive definition files
    const maxMaps = Math.min(targetDefinitions.length, 100);

    for (let i = 0; i < maxMaps; i++) {
      const def = targetDefinitions[i];
      if (!def) continue;

      try {
        const cells = parser.parseMap(def);

        // Session ID cryptographic generation
        const nonce = randomBytes(16).toString('hex');
        const opaqueId = createHash('sha256').update(`${def.id}:${nonce}`).digest('hex').slice(0, 32);

        // Stateless caching on local disk
        await FileCache.saveSession(opaqueId, buffer, def);

        parsedMaps.push({
          mapId: opaqueId,
          label: def.label,
          unit:  def.unit,
          cols:  def.cols,
          rows:  def.rows,
          cells,
          xAxis: def.xAxis,
          yAxis: def.yAxis
        });
      } catch (err) {
        // Skip individual maps that fail parser constraints (e.g., OOB)
        console.error(`Skipping map: ${def.label}`, err);
      }
    }

    if (parsedMaps.length === 0) {
      return NextResponse.json({ error: 'Impossibile decodificare alcuna mappa valida.' }, { status: 422 });
    }

    return NextResponse.json(parsedMaps);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
