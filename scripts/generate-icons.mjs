import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import png2icons from 'png2icons';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const assetsDir = path.join(rootDir, 'assets');
const buildDir = path.join(rootDir, 'build');

fs.mkdirSync(buildDir, { recursive: true });

function renderSvgToPng(svgPath, width) {
  const svg = fs.readFileSync(svgPath, 'utf8');
  const resvg = new Resvg(svg, {
    fitTo: {
      mode: 'width',
      value: width,
    },
  });
  return resvg.render().asPng();
}

// 1. Main app icon (1024x1024 PNG -> ICNS & ICO)
const appIconSvg = path.join(assetsDir, 'icon.svg');
const appPng = renderSvgToPng(appIconSvg, 1024);
fs.writeFileSync(path.join(buildDir, 'icon.png'), appPng);

const icnsBuffer = png2icons.createICNS(appPng, png2icons.BICUBIC, 0);
if (!icnsBuffer) {
  throw new Error('Failed to generate build/icon.icns');
}
fs.writeFileSync(path.join(buildDir, 'icon.icns'), icnsBuffer);

const icoBuffer = png2icons.createICO(appPng, png2icons.BICUBIC, 0, true);
if (!icoBuffer) {
  throw new Error('Failed to generate build/icon.ico');
}
fs.writeFileSync(path.join(buildDir, 'icon.ico'), icoBuffer);

// 2. Tray icons (macOS Template + Windows/Linux PNG)
const traySvg = path.join(assetsDir, 'tray-icon.svg');
fs.writeFileSync(path.join(buildDir, 'trayTemplate.png'), renderSvgToPng(traySvg, 22));
fs.writeFileSync(path.join(buildDir, 'trayTemplate@2x.png'), renderSvgToPng(traySvg, 44));
fs.writeFileSync(path.join(buildDir, 'tray.png'), renderSvgToPng(traySvg, 32));

console.log('Generated icons in build/: icon.png, icon.icns, icon.ico, trayTemplate.png, trayTemplate@2x.png, tray.png');
