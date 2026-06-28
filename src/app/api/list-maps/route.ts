import { NextResponse } from 'next/server';
import { MAP_DEFINITIONS } from '@/lib/definitions';

export const runtime = 'nodejs';

export async function GET() {
  // Only expose id and label – no offsets
  const list = MAP_DEFINITIONS.map(m => ({ id: m.id, label: m.label, unit: m.unit, cols: m.cols, rows: m.rows }));
  return NextResponse.json(list);
}
