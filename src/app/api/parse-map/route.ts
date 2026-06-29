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
    const mapId = formData.get('mapId');

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

    const requestedMap = typeof mapId === 'string'
      ? (targetDefinitions.find(m => m.id === mapId) || targetDefinitions[0])
      : targetDefinitions[0];

    if (!requestedMap) {
      return NextResponse.json({ error: 'Mappa richiesta non trovata.' }, { status: 404 });
    }

    const parser = new BinaryParser(buffer);
    const cells = parser.parseMap(requestedMap);

    // Generazione ID Sessione Criptografico O(1)
    const nonce = randomBytes(16).toString('hex');
    const opaqueId = createHash('sha256').update(`${requestedMap.id}:${nonce}`).digest('hex').slice(0, 32);

    // Persistenza Stateless su Disco Locale
    await FileCache.saveSession(opaqueId, buffer, requestedMap);

    const parsedMap: ParsedMap = {
      mapId: opaqueId,
      label: requestedMap.label,
      unit:  requestedMap.unit,
      cols:  requestedMap.cols,
      rows:  requestedMap.rows,
      cells,
      xAxis: requestedMap.xAxis,
      yAxis: requestedMap.yAxis
    };

    return NextResponse.json(parsedMap);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
