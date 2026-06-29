import { NextRequest, NextResponse } from 'next/server';
import { BinaryParser } from '@/lib/server/BinaryParser';
import { ChecksumEngine } from '@/lib/server/ChecksumEngine';
import { CHECKSUM_DEFINITIONS } from '@/lib/definitions';
import { FileCache } from '@/lib/server/Cache';
import type { PatchRequest, PatchResponse } from '@/types/calibration';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as PatchRequest;
    const { mapId, deltas } = body;

    if (!mapId || !Array.isArray(deltas)) {
      return NextResponse.json<PatchResponse>({ success: false, message: 'Richiesta non valida.' }, { status: 400 });
    }

    // Lettura sicura da cache disco (Stateless)
    const def = await FileCache.getDef(mapId);
    if (!def) {
      return NextResponse.json<PatchResponse>({ success: false, message: 'Definizione mappa scaduta o inesistente.' }, { status: 404 });
    }

    const originalBuffer = await FileCache.getBinary(mapId);
    if (!originalBuffer) {
      return NextResponse.json<PatchResponse>({ success: false, message: 'Binario non trovato nella cache.' }, { status: 404 });
    }

    const workBuffer = originalBuffer.slice(0);
    const parser = new BinaryParser(workBuffer);

    for (const delta of deltas) {
      parser.writeCell(def, delta.col, delta.row, delta.newPhysical);
    }

    // Ricalcolo Checksum Reale con Fail-Safe e Ordinamento Topologico
    const engine = new ChecksumEngine(CHECKSUM_DEFINITIONS);
    engine.applyBlocks(workBuffer, def.checksumBlocks);

    const base64 = Buffer.from(workBuffer).toString('base64');
    
    await FileCache.updateBinary(mapId, workBuffer);

    return NextResponse.json<PatchResponse>({
      success: true,
      message: `Patch completata con successo! ${deltas.length} celle modificate. Checksum aggiornato e verificato.`,
      patchedBinary: base64,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json<PatchResponse>({ success: false, message: msg }, { status: 500 });
  }
}
