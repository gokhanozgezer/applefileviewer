// E2E yardımcıları — şifre çözüm oturum dizinleri (os.tmpdir()/afv-dec-<pid>-*) gözlemi.
// e2e/ altında doğrudan fs yasak (eslint no-restricted-imports); tests/** serbest.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Verilen main sürecinin afv-dec-<pid>-* oturum dizinleri (mutlak yol). */
export function decryptSessionDirs(pid: number): string[] {
  return fs
    .readdirSync(os.tmpdir())
    .filter((n) => n.startsWith(`afv-dec-${pid}-`))
    .map((n) => path.join(os.tmpdir(), n));
}

export function pathExists(p: string): boolean {
  return fs.existsSync(p);
}
