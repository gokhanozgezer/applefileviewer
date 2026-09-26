// util/plist — XML + binary plist parser.
// Graceful failure: bozuk veya boş buffer için null döner, THROW ETMEZ.
// Caller bunu null check'le handle eder (örn. parseBackupPlists Info.plist eksikse parseError set eder).
// Throw YALNIZCA programmer bug (yanlış tip). Veri bozulması → null.

import plist from 'plist';
import bplist from 'bplist-parser';

export type PlistValue =
  | string
  | number
  | boolean
  | Date
  | Buffer
  | PlistValue[]
  | { [k: string]: PlistValue };

const BPLIST_MAGIC = Buffer.from('bplist', 'utf8');

/**
 * Plist parse — XML veya binary (bplist).
 *
 * Graceful failure: bozuk veya boş buffer için null döner, THROW ETMEZ.
 * Caller bunu null check'le handle eder (örn. parseBackupPlists Info.plist eksikse parseError set eder).
 *
 * Throw YALNIZCA programmer bug (yanlış tip). Veri bozulması null.
 */
export async function parsePlist(buf: Buffer): Promise<PlistValue | null> {
  if (!Buffer.isBuffer(buf)) {
    throw new TypeError('parsePlist: Buffer bekleniyor');
  }
  if (buf.length === 0) return null;

  try {
    if (buf.subarray(0, 6).equals(BPLIST_MAGIC)) {
      const [parsed] = bplist.parseBuffer(buf);
      return parsed as PlistValue;
    }
    return plist.parse(buf.toString('utf8')) as PlistValue;
  } catch {
    return null;
  }
}
