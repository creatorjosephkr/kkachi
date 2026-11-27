const path = require('node:path');
const { execFileSync } = require('node:child_process');

/**
 * Electron-builder afterPack hook.
 * When building unsigned macOS bundles (no CSC_LINK / Developer ID),
 * Electron's prebuilt binary retains an invalidated signature after
 * electron-builder edits Info.plist and copies extraResources (e.g. ko.lproj).
 * Re-signing ad-hoc (`-`) restores a valid bundle seal so macOS does not
 * report the app as damaged and move it to the Trash.
 */
exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') {
    return;
  }
  // Skip if a real Apple Developer signing identity is configured
  if (process.env.CSC_LINK || process.env.CSC_NAME) {
    return;
  }

  const appName = `${context.packager.appInfo.productFilename}.app`;
  const appPath = path.join(context.appOutDir, appName);

  console.log(`[afterPack] Ad-hoc signing macOS bundle: ${appPath}`);
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], {
    stdio: 'inherit',
  });
};
