import type { MapDefinition, RawDataType } from '@/types/calibration';
import { Endianness } from '@/types/calibration';

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

function extractAttribute(xml: string, attr: string): string {
  const escapedAttr = attr.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
  const regex = new RegExp(`${escapedAttr}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^>\\s]+))`, 'i');
  const match = regex.exec(xml);
  if (!match) return '';
  return (match[1] || match[2] || match[3] || '').trim();
}

export class XdfParser {
  public static parse(xmlContent: string, binarySize: number): MapDefinition[] {
    const mapDefinitions: MapDefinition[] = [];
    let startPos = 0;
    const len = xmlContent.length;

    while (startPos < len) {
      const idx = xmlContent.indexOf('<XDFTABLE', startPos);
      if (idx === -1) break;
      const endIdx = xmlContent.indexOf('</XDFTABLE>', idx);
      if (endIdx === -1) break;

      const tableBlock = xmlContent.substring(idx, endIdx + 11);
      startPos = endIdx + 11;

      const label = extractTagValueCI(tableBlock, 'title') || 'Mappa Sconosciuta';
      const tagEndIdx = tableBlock.indexOf('>');
      const tableTag = tableBlock.substring(0, tagEndIdx + 1);
      const id = extractAttribute(tableTag, 'uniqueid') || `map_${Math.random().toString(36).substring(2, 9)}`;

      const lowerBlock = tableBlock.toLowerCase();
      const zAxisStart = lowerBlock.indexOf('<xdfaxis id="z"');
      if (zAxisStart === -1) continue;
      const zAxisEnd = lowerBlock.indexOf('</xdfaxis>', zAxisStart);
      if (zAxisEnd === -1) continue;

      const zAxisBody = tableBlock.substring(zAxisStart, zAxisEnd + 10);
      const addressStr = extractAttribute(zAxisBody, 'm_address');
      if (!addressStr) continue;
      
      const rawOffset = addressStr.toLowerCase().startsWith('0x') ? parseInt(addressStr.substring(2), 16) : parseInt(addressStr, 10);
      if (isNaN(rawOffset)) continue;

      const isPointer = zAxisBody.includes('<indexcode'); // Semplificazione euristica

      const bytesStr = extractAttribute(zAxisBody, 'm_bytes');
      const stride = bytesStr ? parseInt(bytesStr, 10) : 2;

      const datatypeStr = extractTagValueCI(zAxisBody, 'datatype');
      const datatypeVal = datatypeStr ? parseInt(datatypeStr, 10) : 0;
      const typeflagsStr = extractTagValueCI(zAxisBody, 'typeflags');
      const typeflagsVal = typeflagsStr ? parseInt(typeflagsStr, 16) : 0;

      const isSigned = datatypeVal === 1 || (typeflagsVal & 0x01) !== 0;
      const isFloat = datatypeVal === 2 || (typeflagsVal & 0x02) !== 0;

      let dataType: RawDataType = 'uint16';
      if (isFloat && stride === 4) dataType = 'float32';
      else if (stride === 1) dataType = isSigned ? 'int8' : 'uint8';
      else if (stride === 2) dataType = isSigned ? 'int16' : 'uint16';
      else if (stride === 4) dataType = isSigned ? 'int32' : 'uint32';

      // Parsing Equazione
      let equation = 'x';
      const mathStart = lowerBlock.indexOf('<math', zAxisStart);
      if (mathStart !== -1 && mathStart < zAxisEnd) {
        const mathEnd = lowerBlock.indexOf('</math>', mathStart);
        if (mathEnd !== -1 && mathEnd < zAxisEnd) {
          const mathBody = tableBlock.substring(mathStart, mathEnd + 7);
          equation = extractAttribute(mathBody, 'equation') || 'x';
        }
      }

      // Estrazione Bitmask (EMBEDINFO)
      let bitmask: number | undefined;
      let bitShift: number | undefined;
      const embedStart = lowerBlock.indexOf('<embedinfo', zAxisStart);
      if (embedStart !== -1 && embedStart < zAxisEnd) {
         const embedEnd = lowerBlock.indexOf('>', embedStart);
         const embedBody = tableBlock.substring(embedStart, embedEnd + 1);
         const maskStr = extractAttribute(embedBody, 'wlbitmask') || extractAttribute(embedBody, 'mask');
         const shiftStr = extractAttribute(embedBody, 'wlshift') || extractAttribute(embedBody, 'shift');
         if (maskStr) bitmask = parseInt(maskStr, maskStr.toLowerCase().startsWith('0x') ? 16 : 10);
         if (shiftStr) bitShift = parseInt(shiftStr, 10);
      }

      // Estrazione Limiti (Min/Max)
      const minStr = extractTagValueCI(zAxisBody, 'min');
      const maxStr = extractTagValueCI(zAxisBody, 'max');
      const physMin = minStr ? parseFloat(minStr) : undefined;
      const physMax = maxStr ? parseFloat(maxStr) : undefined;

      const swappedMatch = lowerBlock.indexOf('<swappedaxis') !== -1;
      const xAxis = this.parseAxis('x', tableBlock);
      const yAxis = this.parseAxis('y', tableBlock);

      if (!isPointer && rawOffset + (yAxis.size * xAxis.size * stride) > binarySize) continue;

      mapDefinitions.push({
        id,
        label,
        unit: extractTagValueCI(zAxisBody, 'units') || 'RAW',
        offset: rawOffset,
        cols: xAxis.size,
        rows: yAxis.size,
        dataType,
        endianness: Endianness.LittleEndian,
        factor: 1.0,
        offsetA2l: 0.0,
        formulaForward: equation.toLowerCase(),
        physMin,
        physMax,
        bitmask,
        bitShift,
        checksumBlocks: ['block_main'],
        swappedAxes: swappedMatch,
        isPointer,
        xAxis: { label: xAxis.label, unit: xAxis.unit, values: xAxis.values },
        yAxis: { label: yAxis.label, unit: yAxis.unit, values: yAxis.values }
      });
    }
    return mapDefinitions;
  }

  private static parseAxis(axisId: 'x' | 'y', tableBody: string) {
    const lowerBody = tableBody.toLowerCase();
    const startTag = `<xdfaxis id="${axisId}"`;
    const startIdx = lowerBody.indexOf(startTag);
    if (startIdx === -1) return { label: axisId.toUpperCase(), unit: '', size: 8, values: Array.from({ length: 8 }, (_, i) => i * 10) };
    const endTag = `</xdfaxis>`;
    const endIdx = lowerBody.indexOf(endTag, startIdx);
    if (endIdx === -1) return { label: axisId.toUpperCase(), unit: '', size: 8, values: Array.from({ length: 8 }, (_, i) => i * 10) };
    
    const axisBody = tableBody.substring(startIdx, endIdx + endTag.length);
    const label = extractTagValueCI(axisBody, 'title') || axisId.toUpperCase();
    const unit = extractTagValueCI(axisBody, 'units') || '';
    const sizeStr = extractTagValueCI(axisBody, 'indexcount');
    const size = sizeStr ? parseInt(sizeStr, 10) : 8;

    return { label, unit, size, values: Array.from({ length: size }, (_, i) => i) };
  }
}
