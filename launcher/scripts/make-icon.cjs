// Builds every logo asset from the source artwork assets-src/zenthra-logo.png
// (a dark Z on a white background). Run with Electron:
//   electron scripts/make-icon.cjs
// Outputs:
//   src/assets/zenthra-logo-mask.png  white Z on transparent, tinted by CSS in the UI
//   build/icon.png                    256 px app / installer icon
//   ../minecraft-mod/.../icon.png     128 px mod icon
const { app, BrowserWindow, nativeImage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

/**
 * The artwork already has a transparent background: CSS masks only use the
 * alpha channel, so it is just cropped square around the shape.
 */
function extractMask(file) {
  const src = nativeImage.createFromPath(file);
  const { width, height } = src.getSize();
  const px = src.toBitmap(); // BGRA
  let minX = width, minY = height, maxX = 0, maxY = 0;
  for (let i = 3; i < px.length; i += 4) {
    if (px[i] > 12) {
      const p = (i - 3) / 4, x = p % width, y = Math.floor(p / width);
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
  }
  const side = Math.min(width, height, Math.ceil(Math.max(maxX - minX, maxY - minY) * 1.04));
  const x = Math.min(width - side, Math.max(0, Math.round((minX + maxX - side) / 2)));
  const y = Math.min(height - side, Math.max(0, Math.round((minY + maxY - side) / 2)));
  return src.crop({ x, y, width: side, height: side });
}

async function renderTile(maskDataUrl, size, out) {
  const win = new BrowserWindow({ width: size, height: size, show: false, transparent: true, frame: false, webPreferences: { offscreen: true } });
  const radius = Math.round(size * 0.22);
  const inner = Math.round(size * 0.74);
  const html = `<html><body style="margin:0;background:transparent">
    <div style="width:${size}px;height:${size}px;border-radius:${radius}px;display:grid;place-items:center;
      background:radial-gradient(circle at 30% 20%,#2a2238,#0f0e14 70%);box-shadow:inset 0 0 0 ${Math.max(1, size / 128)}px rgba(255,255,255,.12)">
      <div style="width:${inner}px;height:${inner}px;background:linear-gradient(135deg,#e9e2ff,#a78bfa 45%,#7c3aed);
        -webkit-mask:url(${maskDataUrl}) center/contain no-repeat"></div>
    </div></body></html>`;
  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  await new Promise((r) => setTimeout(r, 400));
  const img = await win.webContents.capturePage({ x: 0, y: 0, width: size, height: size });
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, img.resize({ width: size, height: size, quality: 'best' }).toPNG());
  win.destroy();
  console.log(`icône écrite : ${out}`);
}

app.on('window-all-closed', () => {});

app.whenReady().then(async () => {
  const mask = extractMask(path.join(root, 'assets-src', 'zenthra-logo.png')).resize({ width: 512, height: 512, quality: 'best' });
  const maskFile = path.join(root, 'src', 'assets', 'zenthra-logo-mask.png');
  fs.mkdirSync(path.dirname(maskFile), { recursive: true });
  fs.writeFileSync(maskFile, mask.toPNG());
  console.log(`icône écrite : ${maskFile}`);

  const dataUrl = mask.toDataURL();
  const big = path.join(root, 'build', 'icon.png');
  await renderTile(dataUrl, 256, big);
  const modIcon = path.join(root, '..', 'minecraft-mod', 'src', 'main', 'resources', 'assets', 'zenthra', 'icon.png');
  fs.writeFileSync(modIcon, nativeImage.createFromPath(big).resize({ width: 128, height: 128, quality: 'best' }).toPNG());
  console.log(`icône écrite : ${modIcon}`);
  app.quit();
});
