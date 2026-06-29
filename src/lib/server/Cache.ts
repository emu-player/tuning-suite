import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import type { MapDefinition } from '@/types/calibration';

const CACHE_DIR = path.join(os.tmpdir(), 'tuning-suite-cache');

export class FileCache {
  private static async init() {
    await fs.mkdir(CACHE_DIR, { recursive: true }).catch(() => {});
  }

  public static async saveSession(id: string, bin: ArrayBuffer, def: MapDefinition) {
    await this.init();
    await fs.writeFile(path.join(CACHE_DIR, `bin_${id}.bin`), Buffer.from(bin));
    await fs.writeFile(path.join(CACHE_DIR, `def_${id}.json`), JSON.stringify(def));
  }

  public static async getBinary(id: string): Promise<ArrayBuffer | null> {
    try {
      const buf = await fs.readFile(path.join(CACHE_DIR, `bin_${id}.bin`));
      return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    } catch {
      return null;
    }
  }

  public static async getDef(id: string): Promise<MapDefinition | null> {
    try {
      const text = await fs.readFile(path.join(CACHE_DIR, `def_${id}.json`), 'utf-8');
      return JSON.parse(text) as MapDefinition;
    } catch {
      return null;
    }
  }

  public static async updateBinary(id: string, bin: ArrayBuffer) {
    await fs.writeFile(path.join(CACHE_DIR, `bin_${id}.bin`), Buffer.from(bin));
  }
}
