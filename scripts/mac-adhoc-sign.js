// electron-builder afterPack hook — macOS AD-HOC code signing (free, no certificate).
//
// Why: an unsigned (or signature-broken) arm64 Electron app is rejected by macOS as
// "is damaged and can't be opened". Ad-hoc signing (`codesign -s -`) makes the bundle
// valid; Gatekeeper still shows the "unidentified developer" prompt (Open Anyway / xattr),
// which the README and website document.
//
// Why a hook instead of `build.mac.identity: "-"`: electron-builder 25.x treats "-" as a
// keychain identity name, finds nothing and skips signing (ad-hoc via identity "-" landed
// in later major versions). `identity: null` keeps electron-builder from searching for a
// certificate; this hook signs right after packing, before the dmg/zip are created.
import { execFileSync } from 'node:child_process';
import path from 'node:path';

export default async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;
  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  console.log(`[mac-adhoc-sign] codesign --force --deep --sign - ${app}`);
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' });
  execFileSync('codesign', ['--verify', '--deep', '--strict', '--verbose=2', app], {
    stdio: 'inherit',
  });
}
