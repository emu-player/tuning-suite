import type { MapDefinition, RawDataType, AxisDefinition } from '@/types/calibration';
import { Endianness } from '@/types/calibration';

export class XdfParser {
  // Pattern primario per la scansione rapida delle tabelle XDF. 
  // Usa [\s\S] per matchare in sicurezza i newline multipli senza dipendere dalla flag 's' (ES2018+).
  private static readonly RE_TABLE = /<XDFTABLE[^>]*>([\s\S]*?)<\/XDFTABLE>/gi;
  
  // Cache statica per le espressioni regolari dinamiche per abbattere a ZERO il costo di compilazione JIT nei loop
  private static readonly rxCache = new Map<string, RegExp>();

  /**
   * Restituisce una RegExp pre-compilata dalla cache per la massima efficienza in V8.
   */
  private static getRegex(pattern: string, flags: string = 'i'): RegExp {
    const key = `${pattern}|${flags}`;
    let rx = this.rxCache.get(key);
    if (!rx) {
      rx = new RegExp(pattern, flags);
      this.rxCache.set(key, rx);
    }
    // Nessuna reset lastIndex necessaria se la flag 'g' non è presente
    return rx;
  }

  /**
   * Estrae un attributo XML catturando sintassi con doppi apici, singoli apici o non quotate.
   */
  private static getAttr(block: string, attrName: string): string {
    const rx = this.getRegex(`\\b${attrName}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^>\\s]+))`, 'i');
    const match = rx.exec(block);
    return match ? (match[1] || match[2] || match[3] || '') : '';
  }

  /**
   * Estrae il contenuto testuale compreso tra tag XML.
   */
  private static getTagValue(block: string, tagName: string): string {
    const rx = this.getRegex(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i');
    const match = rx.exec(block);
    return match ? match[1]!.trim() : '';
  }

  /**
   * Estrae ricorsivamente l'intero blocco interno di un asse specifico.
   */
  private static extractAxis(xml: string, axisId: string): string | null {
    const rx = this.getRegex(`<xdfaxis[^>]*id=["']${axisId}["'][^>]*>([\\s\\S]*?)<\\/xdfaxis>`, 'i');
    const match = rx.exec(xml);
    return match ? match[0] : null;
  }

  /**
   * Converte stringhe Hex o Dec in un numero intero sicuro.
   */
  private static parseNumeric(val: string): number {
    const s = val.trim().toLowerCase();
    if (s.startsWith('0x')) return parseInt(s.substring(2), 16);
    return parseInt(s, 10);
  }

  public static parse(xmlContent: string, binarySize: number): MapDefinition[] {
    const mapDefinitions: MapDefinition[] = [];
    let tableMatch: RegExpExecArray | null;

    // Reset rigoroso dello stato globale della RegExp in caso di riutilizzo
    this.RE_TABLE.lastIndex = 0;

    // Parsing O(N) tramite cursore nativo di V8, nessuna substringa manuale spazzatura
    while ((tableMatch = this.RE_TABLE.exec(xmlContent)) !== null) {
      const tableTagBlock = tableMatch[0].substring(0, tableMatch[0].indexOf('>'));
      const innerXML = tableMatch[1]!;

      const id = this.getAttr(tableTagBlock, 'uniqueid') || `map_${Math.random().toString(36).substring(2, 9)}`;
      const label = this.getTagValue(innerXML, 'title') || 'Mappa Sconosciuta';

      // Estrazione del corpo principale asse Z (I Dati Fisici)
      const zAxis = this.extractAxis(innerXML, 'z');
      if (!zAxis) continue;

      const addressStr = this.getAttr(zAxis, 'm_address');
      if (!addressStr) continue;
      
      const rawOffset = this.parseNumeric(addressStr);
      if (isNaN(rawOffset)) continue;

      const isPointer = /<indexcode/i.test(zAxis);

      const bytesStr = this.getAttr(zAxis, 'm_bytes');
      const stride = bytesStr ? parseInt(bytesStr, 10) : 2;

      const datatypeStr = this.getTagValue(zAxis, 'datatype');
      const datatypeVal = datatypeStr ? parseInt(datatypeStr, 10) : 0;
      const typeflagsStr = this.getTagValue(zAxis, 'typeflags');
      const typeflagsVal = typeflagsStr ? parseInt(typeflagsStr, 16) : 0;

      const isSigned = datatypeVal === 1 || (typeflagsVal & 0x01) !== 0;
      const isFloat = datatypeVal === 2 || (typeflagsVal & 0x02) !== 0;

      let dataType: RawDataType = 'uint16';
      if (isFloat && stride === 4) dataType = 'float32';
      else if (stride === 1) dataType = isSigned ? 'int8' : 'uint8';
      else if (stride === 2) dataType = isSigned ? 'int16' : 'uint16';
      else if (stride === 4) dataType = isSigned ? 'int32' : 'uint32';

      // Motore Estrazione Equazione Veloce
      const mathMatch = /<math[^>]*>/i.exec(zAxis);
      const equation = mathMatch ? (this.getAttr(mathMatch[0], 'equation') || 'x') : 'x';

      // Motore Estrazione Bitmask (EMBEDINFO)
      let bitmask: number | undefined;
      let bitShift: number | undefined;
      const embedMatch = /<embedinfo[^>]*>/i.exec(zAxis);
      
      if (embedMatch) {
        const embedTag = embedMatch[0];
        const maskStr = this.getAttr(embedTag, 'wlbitmask') || this.getAttr(embedTag, 'mask');
        const shiftStr = this.getAttr(embedTag, 'wlshift') || this.getAttr(embedTag, 'shift');
        if (maskStr) bitmask = this.parseNumeric(maskStr);
        if (shiftStr) bitShift = parseInt(shiftStr, 10);
      }

      // Estrazione Limiti (Min/Max) Sicuri
      const minStr = this.getTagValue(zAxis, 'min');
      const maxStr = this.getTagValue(zAxis, 'max');
      const physMin = minStr ? parseFloat(minStr) : undefined;
      const physMax = maxStr ? parseFloat(maxStr) : undefined;

      const swappedMatch = /<swappedaxis/i.test(innerXML);
      const xAxis = this.parseAxisDefinition(innerXML, 'x');
      const yAxis = this.parseAxisDefinition(innerXML, 'y');

      // Controllo Limite Geometria contro la ROM reale
      if (!isPointer && rawOffset + (yAxis.size * xAxis.size * stride) > binarySize) continue;

      mapDefinitions.push({
        id,
        label,
        unit: this.getTagValue(zAxis, 'units') || 'RAW',
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

  /**
   * Generatore Geometria Assi Esteso
   */
  private static parseAxisDefinition(xml: string, axisId: string): AxisDefinition & { size: number } {
    const axisBlock = this.extractAxis(xml, axisId);
    
    // Retrocompatibilità Assoluta: Se l'asse non esiste, genera geometria default 8x8 con delta x10
    if (!axisBlock) {
      return { 
        label: axisId.toUpperCase(), 
        unit: '', 
        size: 8, 
        values: Array.from({ length: 8 }, (_, i) => i * 10) 
      };
    }

    const label = this.getTagValue(axisBlock, 'title') || axisId.toUpperCase();
    const unit = this.getTagValue(axisBlock, 'units') || '';
    const sizeStr = this.getTagValue(axisBlock, 'indexcount');
    const size = sizeStr ? parseInt(sizeStr, 10) : 8;

    return {
      label,
      unit,
      size,
      values: Array.from({ length: size }, (_, i) => i) // Geometria Lineare Standard
    };
  }
}
