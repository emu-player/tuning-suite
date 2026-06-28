import type { MapDefinition, RawDataType } from '@/types/calibration';
import { Endianness } from '@/types/calibration';

/**
 * Parser leggero e velocissimo per i file XML XDF di TunerPro.
 * Implementato in modo robusto tramite regex strutturate per evitare crash ed instabilità.
 */
export class XdfParser {
  public static parse(xmlContent: string, binarySize: number): MapDefinition[] {
    const mapDefinitions: MapDefinition[] = [];
    
    // Individua ed estrae tutti i blocchi <XDFTABLE>
    const tableRegex = /<XDFTABLE[^>]*>([\s\S]*?)<\/XDFTABLE>/g;
    let match;

    while ((match = tableRegex.exec(xmlContent)) !== null) {
      const tableBody = match[1];
      if (!tableBody) continue;

      // Estrazione del titolo della tabella
      const titleMatch = /<title>([^<]+)<\/title>/i.exec(tableBody);
      const label = titleMatch?.[1]?.trim() ?? 'Mappa Sconosciuta';

      // Estrazione dell'ID o del nome univoco
      const idMatch = /uniqueid="([^"]+)"/i.exec(match[0] ?? '');
      const id = idMatch?.[1] ?? `map_${Math.random().toString(36).substring(2, 9)}`;

      // Estrazione dei parametri dell'asse Z (i dati della tabella stessa)
      const zAxisRegex = /<XDFAXIS\s+id="z"[^>]*>([\s\S]*?)<\/XDFAXIS>/i;
      const zAxisMatch = zAxisRegex.exec(tableBody);
      const zAxisBody = zAxisMatch?.[1] ?? '';

      // Verifica offset e indirizzo esadecimale reale
      const addressMatch = /m_address="0x([0-9A-Fa-f]+)"/i.exec(zAxisBody);
      const rawOffset = addressMatch ? parseInt(addressMatch[1] ?? '0', 16) : null;
      if (rawOffset === null || isNaN(rawOffset)) continue;

      // Estrazione grandezza byte del dato (stride)
      const bytesMatch = /m_bytes="([0-9]+)"/i.exec(zAxisBody);
      const stride = bytesMatch ? parseInt(bytesMatch[1] ?? '2', 10) : 2;

      // Determinazione della tipologia dato in base ai byte dichiarati
      let dataType: RawDataType = 'uint16';
      if (stride === 1) dataType = 'uint8';
      else if (stride === 4) dataType = 'uint32';

      // Estrazione formule di scaling matematico
      const mathMatch = /<MATH[^>]*>([\s\S]*?)<\/MATH>/i.exec(zAxisBody);
      const mathBody = mathMatch?.[1] ?? '';
      const equationMatch = /equation="([^"]+)"/i.exec(mathBody);
      const equation = equationMatch?.[1] ?? 'x';

      // Rilevamento inversione degli assi (transposizione matriciale)
      const swappedMatch = /<swappedaxis[^>]*\/>/i.test(tableBody);

      // Estrazione metadati degli assi X e Y (dimensioni, etichette e unità)
      const xAxis = this.parseAxis('x', tableBody);
      const yAxis = this.parseAxis('y', tableBody);

      // Protezione overflow binario di sicurezza
      const cols = xAxis.size;
      const rows = yAxis.size;
      if (rawOffset + (rows * cols * stride) > binarySize) {
        continue; // Salta se la definizione descrive aree esterne al binario
      }

      // Estrazione dei fattori numerici dall'equazione
      let factor = 1.0;
      let offsetA2l = 0;
      if (equation.includes('*')) {
        const parts = equation.split('*');
        const numPart = parts[1] ?? '1.0';
        factor = parseFloat(numPart) || 1.0;
      }

      mapDefinitions.push({
        id,
        label,
        unit: zAxisBody.match(/<units>([^<]+)<\/units>/i)?.[1] ?? 'RAW',
        offset: rawOffset,
        cols,
        rows,
        dataType,
        endianness: Endianness.LittleEndian,
        factor,
        offsetA2l,
        checksumBlocks: ['block_main'],
        swappedAxes: swappedMatch,
        xAxis: {
          label: xAxis.label,
          unit: xAxis.unit,
          values: Array.from({ length: cols }, (_, i) => i * 10)
        },
        yAxis: {
          label: yAxis.label,
          unit: yAxis.unit,
          values: Array.from({ length: rows }, (_, i) => i * 10)
        }
      });
    }

    return mapDefinitions;
  }

  private static parseAxis(axisId: 'x' | 'y', body: string): { label: string; unit: string; size: number } {
    const regex = new RegExp(`<XDFAXIS\\s+id="${axisId}"[^>]*>([\\s\\S]*?)<\/XDFAXIS>`, 'i');
    const match = regex.exec(body);
    if (!match) return { label: axisId.toUpperCase(), unit: '', size: 8 };

    const axisBody = match[1] ?? '';
    const labelMatch = /<title>([^<]+)<\/title>/i.exec(axisBody);
    const unitMatch = /<units>([^<]+)<\/units>/i.exec(axisBody);
    const sizeMatch = /<indexcount>([0-9]+)<\/indexcount>/i.exec(axisBody);

    return {
      label: labelMatch?.[1]?.trim() ?? axisId.toUpperCase(),
      unit: unitMatch?.[1] ?? '',
      size: sizeMatch ? parseInt(sizeMatch[1] ?? '8', 10) : 8
    };
  }
}
