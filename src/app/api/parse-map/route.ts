import { NextRequest, NextResponse } from 'next/server';
import { BinaryParser } from '@/lib/server/BinaryParser';
import { XdfParser } from '@/lib/server/XdfParser';
import { A2lParser } from '@/lib/server/A2lParser';
import { MAP_DEFINITIONS, mapIdRegistry } from '@/lib/definitions';
import type { MapDefinition, ParsedMap } from '@/types/calibration';
import { createHash, randomBytes } from 'node:crypto';

export const runtime = 'nodejs';
export const maxDuration = 30;

export const binaryCache = new Map<string, ArrayBuffer>();
export const activeDefinitionsCache = new Map<string, MapDefinition>();

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file');
    const driver = formData.get('driver'); // File di driver .xdf o .a2l opzionale
    const mapId = formData.get('mapId');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Nessun file binario ricevuto.' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = arrayBuffer.slice(0);

    // Selezione o elaborazione dinamica della definizione
    let targetDefinitions = MAP_DEFINITIONS;

    if (driver instanceof File) {
      const driverContent = await driver.text();
      if (driver.name.endsWith('.xdf')) {
        targetDefinitions = XdfParser.parse(driverContent, buffer.byteLength);
      } else if (driver.name.endsWith('.a2l')) {
        targetDefinitions = await A2lParser.parse(driverContent, buffer.byteLength);
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

    const stride = requestedMap.dataType === 'float32' || requestedMap.dataType === 'uint32' || requestedMap.dataType === 'int32' ? 4
      : requestedMap.dataType === 'uint16' || requestedMap.dataType === 'int16' ? 2 : 1;
    const requiredBytes = requestedMap.offset + requestedMap.rows * requestedMap.cols * stride;

    let workingBuffer = buffer;
    if (buffer.byteLength < requiredBytes) {
      workingBuffer = new ArrayBuffer(requiredBytes + 1024);
      new Uint8Array(workingBuffer).set(new Uint8Array(buffer), 0);
    }

    const parser = new BinaryParser(workingBuffer);
    const cells = parser.parseMap(requestedMap);

    const nonce = randomBytes(16).toString('hex');
    const opaqueId = createHash('sha256')
      .update(`${requestedMap.id}:${nonce}`)
      .digest('hex')
      .slice(0, 32);

    mapIdRegistry.set(opaqueId, requestedMap.id);
    binaryCache.set(opaqueId, workingBuffer);
    activeDefinitionsCache.set(requestedMap.id, requestedMap);

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
