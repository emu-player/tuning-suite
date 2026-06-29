import type { MapDefinition, RawDataType } from '@/types/calibration';
import { Endianness } from '@/types/calibration';

/**
 * Estrae in modo case-insensitive e veloce il valore interno di un tag XML.
 * Esente da vulnerabilità di tipo ReDoS (Regular Expression Denial of Service) [1].
 */
function extractTagValueCI(xml: string, tag: string): string {
  const lowerXml = xml.toLowerCase();
  const lowerTag = tag.toLowerCase();
  const startTag = `<${lowerTag}`;
  const startIdx = lowerXml.indexOf(startTag);
  if (startIdx === -1) return '';

  const closeBracket = lowerXml.indexOf('>', startIdx);
  if (closeBracket === -1) return '';

  const endTag = `</${lowerTag}>`;
  const endIdx = lowerXml.indexOf(endTag, closeBracket);
  if (endIdx === -1) return '';

  return xml.substring(closeBracket + 1, endIdx).trim();
}

/**
 * Estrae il valore di un attributo specifico all'interno di un tag XML.
 */
function extractAttribute(xml: string, attr: string): string {
  const lowerXml = xml.toLowerCase();
  const lowerAttr = attr.toLowerCase() + '=';
  const attrIdx = lowerXml.indexOf(lowerAttr);
  if (attrIdx === -1) return '';

  const valStart = attrIdx + lowerAttr.length;
  let quoteChar = xml[valStart];
  let startOffset = 1;
  if (quoteChar !== '"' && quoteChar !== "'") {
    quoteChar = ' ';
    startOffset = 0;
  }

  const quoteIdx = xml.indexOf(quoteChar, valStart + startOffset);
  if (quoteIdx === -1) return '';

  return xml.substring(valStart + startOffset, quoteIdx).trim();
}

/**
 * Risolve linearmente un'espressione matematica di base adatta alla generazione dinamica degli assi.
 */
function evaluateLinearExpression(eq: string, xVal: number): number {
  const clean = eq.replace(/\s+/g, '').toLowerCase();
  if (clean === 'x') return xVal;

  try {
    let factor = 1.0;
    let offset = 0.0;

    if (clean.includes('*')) {
      const parts = clean.split('*');
      if (parts[0] === 'x') {
        const secondPart = parts[1] ?? '1';
        if (secondPart.includes('+')) {
          const subParts = secondPart.split('+');
          factor = parseFloat(subParts[0]!) || 1.0;
          offset = parseFloat(subParts[1]!) || 0.0;
        } else if (secondPart.includes('-')) {
          const subParts = secondPart.split('-');
          factor = parseFloat(subParts[0]!) || 1.0;
          offset = -(parseFloat(subParts[1]!) || 0.0);
        } else {
          factor = parseFloat(secondPart) || 1.0;
        }
      }
    } else if (clean.includes('+')) {
      const parts = clean.split('+');
      if (parts[0] === 'x') {
        offset = parseFloat(parts[1]!) || 0.0;
      }
    } else if (clean.includes('-')) {
      const parts = clean.split('-');
      if (parts[0] === 'x') {
        offset = -(parseFloat(parts[1]!) || 0.0);
      }
    } else if (clean.includes('/')) {
      const parts = clean.split('/');
      if (parts[0] === 'x') {
        factor = 1.0 / (parseFloat(parts[1]!) || 1.0);
      }
    }

    return xVal * factor + offset;
  } catch {
    return xVal * 10;
  }
}

/**
 * Parser per i file XML XDF di TunerPro.
 * Ottimizzato tramite scansione manuale per massimizzare le performance e la robustezza computazionale [1].
 */
export class XdfParser {
  public static parse(xmlContent: string, binarySize: number): MapDefinition[] {
    const mapDefinitions: MapDefinition[] = [];
    let startPos = 0;
    const len = xmlContent.length;

    // Scansione sequenziale tramite indice per individuare tutti i blocchi <XDFTABLE> [1]
    while (startPos < len) {
      const idx = xmlContent.indexOf('<XDFTABLE', startPos);
      if (idx === -1) break;
      const endIdx = xmlContent.indexOf('</XDFTABLE>', idx);
      if (endIdx === -1) break;

      const tableBlock = xmlContent.substring(idx, endIdx + 11);
      startPos = endIdx + 11;

      // Estrazione del titolo della tabella
      const label = extractTagValueCI(tableBlock, 'title') || 'Mappa Sconosciuta';

      // Estrazione dell'ID univoco dall'attributo del tag principale
      const tagEndIdx = tableBlock.indexOf('>');
      const tableTag = tableBlock.substring(0, tagEndIdx + 1);
      const id = extractAttribute(tableTag, 'uniqueid') || `map_${Math.random().toString(36).substring(2, 9)}`;

      // Estrazione del blocco relativo all'asse Z (i dati della tabella)
      const lowerBlock = tableBlock.toLowerCase();
      const zAxisStart = lowerBlock.indexOf('<xdfaxis id="z"');
      if (zAxisStart === -1) continue;
      const zAxisEnd = lowerBlock.indexOf('</xdfaxis>', zAxisStart);
      if (zAxisEnd === -1) continue;

      const zAxisBody = tableBlock.substring(zAxisStart, zAxisEnd + 10);

      // Risoluzione dell'offset e dell'indirizzo esadecimale reale
      const addressStr = extractAttribute(zAxisBody, 'm_address');
      if (!addressStr) continue;
      const rawOffset = addressStr.toLowerCase().startsWith('0x')
        ? parseInt(addressStr.substring(2), 16)
        : parseInt(addressStr, 10);
      if (isNaN(rawOffset)) continue;

      // Estrazione della grandezza in byte del dato (stride)
      const bytesStr = extractAttribute(zAxisBody, 'm_bytes');
      const stride = bytesStr ? parseInt(bytesStr, 10) : 2;

      // Determinazione tipologica tramite attributi nativi XDF
      const datatypeStr = extractTagValueCI(zAxisBody, 'datatype');
      const datatypeVal = datatypeStr ? parseInt(datatypeStr, 10) : 0;

      const typeflagsStr = extractTagValueCI(zAxisBody, 'typeflags');
      const typeflagsVal = typeflagsStr ? parseInt(typeflagsStr, 16) : 0;

      const isSigned = datatypeVal === 1 || (typeflagsVal & 0x01) !== 0;
      const isFloat = datatypeVal === 2 || (typeflagsVal & 0x02) !== 0;

      let dataType: RawDataType = 'uint16';
      if (isFloat && stride === 4) {
        dataType = 'float32';
      } else if (stride === 1) {
        dataType = isSigned ? 'int8' : 'uint8';
      } else if (stride === 2) {
        dataType = isSigned ? 'int16' : 'uint16';
      } else if (stride === 4) {
        dataType = isSigned ? 'int32' : 'uint32';
      }

      // Estrazione e normalizzazione della formula matematica
      let equation = 'x';
      const mathStart = lowerBlock.indexOf('<math', zAxisStart);
      if (mathStart !== -1 && mathStart < zAxisEnd) {
        const mathEnd = lowerBlock.indexOf('</math>', mathStart);
        if (mathEnd !== -1 && mathEnd < zAxisEnd) {
          const mathBody = tableBlock.substring(mathStart, mathEnd + 7);
          equation = extractAttribute(mathBody, 'equation') || 'x';
        }
      }

      // Rilevamento della trasposizione matriciale (inversione degli assi)
      const swappedMatch = lowerBlock.indexOf('<swappedaxis') !== -1;

      // Scansione e parsing degli assi X e Y
      const xAxis = this.parseAxis('x', tableBlock);
      const yAxis = this.parseAxis('y', tableBlock);

      const cols = xAxis.size;
      const rows = yAxis.size;

      // Protezione da overflow della memoria binaria
      if (rawOffset + (rows * cols * stride) > binarySize) {
        continue;
      }

      // Estrazione dei fattori numerici lineari (factor e offset) dall'equazione
      let factor = 1.0;
      let offsetA2l = 0.0;
      const cleanEquation = equation.replace(/\s+/g, '').toLowerCase();

      if (cleanEquation.includes('*')) {
        const parts = cleanEquation.split('*');
        if (parts[0] === 'x') {
          const secondPart = parts[1] ?? '1';
          if (secondPart.includes('+')) {
            const subParts = secondPart.split('+');
            factor = parseFloat(subParts[0]!) || 1.0;
            offsetA2l = parseFloat(subParts[1]!) || 0.0;
          } else if (secondPart.includes('-')) {
            const subParts = secondPart.split('-');
            factor = parseFloat(subParts[0]!) || 1.0;
            offsetA2l = -(parseFloat(subParts[1]!) || 0.0);
          } else {
            factor = parseFloat(secondPart) || 1.0;
          }
        }
      } else if (cleanEquation.includes('+')) {
        const parts = cleanEquation.split('+');
        if (parts[0] === 'x') {
          offsetA2l = parseFloat(parts[1]!) || 0.0;
        }
      } else if (cleanEquation.includes('-')) {
        const parts = cleanEquation.split('-');
        if (parts[0] === 'x') {
          offsetA2l = -(parseFloat(parts[1]!) || 0.0);
        }
      } else if (cleanEquation.includes('/')) {
        const parts = cleanEquation.split('/');
        if (parts[0] === 'x') {
          factor = 1.0 / (parseFloat(parts[1]!) || 1.0);
        }
      }

      mapDefinitions.push({
        id,
        label,
        unit: extractTagValueCI(zAxisBody, 'units') || 'RAW',
        offset: rawOffset,
        cols,
        rows,
        dataType,
        endianness: Endianness.LittleEndian,
        factor,
        offsetA2l,
        formulaForward: equation.toLowerCase(), // Iniettata direttamente per una valutazione ultra-veloce in CompuMethod
        checksumBlocks: ['block_main'],
        swappedAxes: swappedMatch,
        xAxis: {
          label: xAxis.label,
          unit: xAxis.unit,
          values: xAxis.values
        },
        yAxis: {
          label: yAxis.label,
          unit: yAxis.unit,
          values: yAxis.values
        }
      });
    }

    return mapDefinitions;
  }

  /**
   * Effettua il parsing specifico dell'asse compilando dinamicamente i reali valori fisici.
   */
  private static parseAxis(axisId: 'x' | 'y', tableBody: string): { label: string; unit: string; size: number; values: number[] } {
    const lowerBody = tableBody.toLowerCase();
    const startTag = `<xdfaxis id="${axisId}"`;
    const startIdx = lowerBody.indexOf(startTag);
    if (startIdx === -1) {
      return { label: axisId.toUpperCase(), unit: '', size: 8, values: Array.from({ length: 8 }, (_, i) => i * 10) };
    }

    const endTag = `</xdfaxis>`;
    const endIdx = lowerBody.indexOf(endTag, startIdx);
    if (endIdx === -1) {
      return { label: axisId.toUpperCase(), unit: '', size: 8, values: Array.from({ length: 8 }, (_, i) => i * 10) };
    }

    const axisBody = tableBody.substring(startIdx, endIdx + endTag.length);

    const label = extractTagValueCI(axisBody, 'title') || axisId.toUpperCase();
    const unit = extractTagValueCI(axisBody, 'units') || '';

    const sizeStr = extractTagValueCI(axisBody, 'indexcount');
    const size = sizeStr ? parseInt(sizeStr, 10) : 8;

    // Recupero dell'equazione di conversione associata all'asse
    let equation = 'x';
    const mathStart = lowerBody.indexOf('<math', startIdx);
    if (mathStart !== -1 && mathStart < endIdx) {
      const mathEnd = lowerBody.indexOf('</math>', mathStart);
      if (mathEnd !== -1 && mathEnd < endIdx) {
        const mathBody = tableBody.substring(mathStart, mathEnd + 7);
        equation = extractAttribute(mathBody, 'equation') || 'x';
      }
    }

    // Generazione dei valori fisici reali dell'asse basati sulla conversione
    const values: number[] = new Array(size);
    for (let i = 0; i < size; i++) {
      values[i] = evaluateLinearExpression(equation, i);
    }

    return { label, unit, size, values };
  }
}