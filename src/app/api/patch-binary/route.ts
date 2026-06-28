import { NextRequest, NextResponse } from 'next/server';
import { BinaryParser } from '@/lib/server/BinaryParser';
import { ChecksumEngine } from '@/lib/server/ChecksumEngine';
import { mapIdRegistry, CHECKSUM_DEFINITIONS } from '@/lib/definitions';
import { binaryCache, activeDefinitionsCache } from '../parse-map/route';
import type { PatchRequest, PatchResponse } from '@/types/calibration';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as PatchRequest;
    const { mapId, deltas } = body;

    if (!mapId || !Array.isArray(deltas)) {
      return NextResponse.json<PatchResponse>({ success: false, message: 'Richiesta non valida.' }, { status: 400 });
    }

    const defId = mapIdRegistry.get(mapId);
    if (!defId) {
      return NextResponse.json<PatchResponse>({ success: false, message: 'Sessione scaduta o mappa sconosciuta.' }, { status: 404 });
    }

    // Cerca la definizione reale all'interno della cache delle definizioni attive caricate
    const def = activeDefinitionsCache.get(defId);
    if (!def) {
      return NextResponse.json<PatchResponse>({ success: false, message: 'Definizione mappa mancante.' }, { status: 500 });
    }

    const originalBuffer = binaryCache.get(mapId);
    if (!originalBuffer) {
      return NextResponse.json<PatchResponse>({ success: false, message: 'Binario non trovato nella cache.' }, { status: 404 });
    }

    const workBuffer = originalBuffer.slice(0);
    const parser = new BinaryParser(workBuffer);

    for (const delta of deltas) {
      parser.writeCell(def, delta.col, delta.row, delta.newPhysical);
    }

    // Ricalcolo Checksum Reale
    const engine = new ChecksumEngine(CHECKSUM_DEFINITIONS);
    engine.applyBlocks(workBuffer, def.checksumBlocks);

    const base64 = Buffer.from(workBuffer).toString('base64');
    
    binaryCache.set(mapId, workBuffer);

    return NextResponse.json<PatchResponse>({
      success: true,
      message: `Patch completata con successo! ${deltas.length} celle modificate. Checksum aggiornato.`,
      patchedBinary: base64,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json<PatchResponse>({ success: false, message: msg }, { status: 500 });
  }
}
