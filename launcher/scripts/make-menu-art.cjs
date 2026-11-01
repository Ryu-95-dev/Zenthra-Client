// Draws the artwork of the in-game Zenthra main menu. Run with Electron:
//   npx electron scripts/make-menu-art.cjs
// Outputs (minecraft-mod/src/main/resources/assets/zenthra/textures/gui/):
//   menu_background.png  480×270 pixel-art night scene (moon, temples, sakura, water)
//   logo.png             "ZENTHRA / CLIENT" logo with a katana, transparent
//   icons.png            interface icons (Lucide), plus minecraft-mod/.../gui/ZIcon.java
// Falling petals, glows and the moon halo pulse are animated in game, not here.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const outDir = path.join(__dirname, '..', '..', 'minecraft-mod', 'src', 'main', 'resources', 'assets', 'zenthra', 'textures', 'gui');

// Runs inside the page: everything is drawn on a canvas with whole-pixel rectangles.
const backgroundScript = `
const W = 480, H = 270;
const c = document.createElement('canvas'); c.width = W; c.height = H;
const g = c.getContext('2d');
let seed = 7;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const px = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const rgb = (a) => 'rgb(' + a.join(',') + ')';

// Sky, banded every 3 px for a pixel-art gradient.
const top = [6, 3, 12], mid = [24, 12, 40], low = [52, 26, 70];
for (let y = 0; y < 200; y += 3) {
  const t = y / 200;
  px(0, y, W, 3, rgb(t < 0.6 ? mix(top, mid, t / 0.6) : mix(mid, low, (t - 0.6) / 0.4)));
}
// Stars.
for (let i = 0; i < 140; i++) {
  const x = rnd() * W, y = rnd() * 150, b = rnd();
  px(x, y, 1, 1, b > 0.85 ? '#f4ecff' : b > 0.5 ? '#b9a6d6' : '#6f5a8f');
}
// Moon with a stepped halo.
const mx = 392, my = 58, r = 27;
[[r + 22, 'rgba(170,140,220,0.06)'], [r + 14, 'rgba(180,150,230,0.09)'], [r + 7, 'rgba(200,180,240,0.13)']].forEach(([rr, col]) => {
  for (let y = -rr; y <= rr; y += 2) { const w = Math.floor(Math.sqrt(rr * rr - y * y)); px(mx - w, my + y, w * 2, 2, col); }
});
for (let y = -r; y <= r; y++) {
  const w = Math.floor(Math.sqrt(r * r - y * y));
  for (let x = -w; x < w; x++) {
    const shade = 0.82 + 0.18 * (1 - (x + y * 0.4) / (r * 1.6));
    const n = rnd() < 0.08 ? 0.9 : 1;
    const v = Math.min(1, shade * n);
    px(mx + x, my + y, 1, 1, rgb([Math.round(222 * v), Math.round(214 * v), Math.round(232 * v)]));
  }
}
[[-9, -8, 6], [8, 4, 7], [-4, 12, 4], [12, -11, 3], [-14, 6, 3], [3, -3, 2]].forEach(([cx, cy, cr]) => {
  for (let y = -cr; y <= cr; y++) { const w = Math.floor(Math.sqrt(cr * cr - y * y)); px(mx + cx - w, my + cy + y, w * 2, 1, 'rgba(120,105,140,0.45)'); }
});
// Thin clouds crossing the sky.
const cloud = (x, y, len, col) => { for (let i = 0; i < len; i += 4) { const h = 2 + Math.floor(rnd() * 3); px(x + i, y - h / 2, 5, h, col); } };
cloud(300, 80, 120, 'rgba(60,35,85,0.85)'); cloud(350, 92, 90, 'rgba(45,26,66,0.9)');
cloud(40, 60, 110, 'rgba(50,30,72,0.7)'); cloud(150, 40, 80, 'rgba(45,28,66,0.6)');

// Mountains: three layers, back to front.
const ridge = (baseY, amp, step, col, rim, seedOff) => {
  seed = 1000 + seedOff;
  let y = baseY;
  for (let x = 0; x < W; x += step) {
    y += (rnd() - 0.5) * amp;
    y = Math.max(baseY - amp * 4, Math.min(baseY + amp, y));
    px(x, y, step, H - y, col);
    if (rim) px(x, y, step, 1, rim);
  }
};
ridge(138, 12, 4, '#3b2459', '#5a3a82', 1); ridge(162, 9, 3, '#2a1843', '#433064', 2);
// Mist band.
for (let y = 168; y < 190; y += 2) px(0, y, W, 2, 'rgba(120,80,160,' + (0.10 - Math.abs(y - 179) * 0.008).toFixed(3) + ')');
ridge(190, 5, 3, '#170d26', null, 3);

// Pagoda silhouette: tiers of roofs with curved tips and lit windows.
const pagoda = (cx, baseY, tiers, w0, tierH, col, lit) => {
  let w = w0, y = baseY;
  px(cx - w / 2 + 3, y - 4, w - 6, 4, col);
  for (let t = 0; t < tiers; t++) {
    const bodyW = w * 0.62;
    px(cx - bodyW / 2, y - tierH, bodyW, tierH, col);
    if (lit) for (let k = -1; k <= 1; k++) px(cx + k * bodyW * 0.28 - 1, y - tierH * 0.65, 2, 3, t % 2 ? '#9d6bd6' : '#c79cf0');
    px(cx - w / 2, y - tierH - 2, w, 2, col);
    if (lit) px(cx - w / 2, y - tierH - 2, w, 1, '#4b2f73');
    px(cx - w / 2 - 2, y - tierH - 4, 3, 2, col); px(cx + w / 2 - 1, y - tierH - 4, 3, 2, col);
    y -= tierH + 2; w *= 0.8;
  }
  px(cx - 1, y - 12, 2, 12, col); px(cx - 3, y - 7, 6, 1, col);
};
pagoda(400, 214, 6, 78, 14, '#0b0612', true);
pagoda(318, 206, 3, 42, 10, '#120a1c', true);
pagoda(276, 200, 2, 26, 8, '#170e24', false);
// Torii gate on the left shore.
const torii = (x, y, s, col) => { px(x, y - 30 * s, 4 * s, 30 * s, col); px(x + 22 * s, y - 30 * s, 4 * s, 30 * s, col); px(x - 6 * s, y - 34 * s, 38 * s, 4 * s, col); px(x - 2 * s, y - 26 * s, 30 * s, 2 * s, col); };
torii(118, 214, 1, '#0e0716');

// Water with the moon's reflection.
for (let y = 214; y < H; y += 2) px(0, y, W, 2, rgb(mix([18, 9, 30], [7, 4, 12], (y - 214) / 56)));
seed = 99;
for (let y = 216; y < H; y += 3) {
  const w = 6 + rnd() * 26 * (1 - (y - 216) / 60);
  px(mx - w / 2 + (rnd() - 0.5) * 6, y, w, 1, 'rgba(210,190,240,' + (0.5 - (y - 216) / 140).toFixed(2) + ')');
  if (rnd() < 0.5) px(rnd() * W, y, 4 + rnd() * 12, 1, 'rgba(140,100,190,0.25)');
}
// Reflections of the lit windows.
for (let i = 0; i < 6; i++) px(405 + (rnd() - 0.5) * 30, 220 + i * 5, 3, 1, 'rgba(180,130,230,0.35)');

// Sakura: dark branches with pixel blossom clusters.
const pinks = ['#f0b6ec', '#d98ad8', '#b765c0', '#8d4a9e', '#5f2f72'];
const blossom = (x, y, rad, n) => {
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * rad;
    const s = 1 + Math.floor(rnd() * 3);
    const shade = Math.min(4, Math.floor((d / rad) * 3 + rnd() * 2));
    px(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.75, s, s, pinks[shade]);
  }
};
const branch = (x, y, len, ang, wid, depth) => {
  const col = '#140a1c';
  for (let i = 0; i < len; i += 1.5) px(x + Math.cos(ang) * i, y + Math.sin(ang) * i, wid, wid, col);
  const ex = x + Math.cos(ang) * len, ey = y + Math.sin(ang) * len;
  if (depth > 0) {
    branch(ex, ey, len * 0.7, ang - 0.5 + rnd() * 0.3, Math.max(1, wid - 1), depth - 1);
    branch(ex, ey, len * 0.6, ang + 0.4 + rnd() * 0.3, Math.max(1, wid - 1), depth - 1);
  }
  blossom(ex, ey, 10 + depth * 4, 50 + depth * 25);
};
seed = 42;
branch(-6, 4, 40, 0.35, 4, 3);      // top-left
branch(-8, 250, 46, -0.55, 4, 3);   // bottom-left
branch(492, 272, 34, -2.4, 4, 3);   // bottom-right
branch(492, 120, 22, -2.8, 3, 2);   // right edge
// A few petals already floating in the air.
for (let i = 0; i < 40; i++) px(rnd() * W, rnd() * H, 2, 1, pinks[Math.floor(rnd() * 3)]);
// Vignette.
for (let i = 0; i < 18; i++) {
  const a = (0.16 * (1 - i / 18)).toFixed(3);
  g.fillStyle = 'rgba(0,0,0,' + a + ')';
  g.fillRect(0, i, W, 1); g.fillRect(0, H - 1 - i, W, 1); g.fillRect(i, 0, 1, H); g.fillRect(W - 1 - i, 0, 1, H);
}
return c.toDataURL('image/png');
`;

const logoScript = `
const W = 640, H = 220;
const c = document.createElement('canvas'); c.width = W; c.height = H;
const g = c.getContext('2d');
const cx = W / 2;

// Purple energy ring behind the title.
g.save(); g.translate(cx + 20, 92); g.rotate(-0.12);
g.lineWidth = 7; g.strokeStyle = 'rgba(150,100,230,0.8)'; g.beginPath(); g.ellipse(0, 0, 210, 62, 0, 0.15 * Math.PI, 1.95 * Math.PI); g.stroke();
g.lineWidth = 2; g.strokeStyle = 'rgba(210,180,255,0.6)'; g.beginPath(); g.ellipse(0, 0, 214, 66, 0, 1.1 * Math.PI, 1.9 * Math.PI); g.stroke();
g.restore();

// Katana across the title: blade from lower left to upper right, handle top right.
g.save(); g.translate(cx - 30, 104); g.rotate(-0.2);
const bladeGrad = g.createLinearGradient(-280, 0, 160, 0);
bladeGrad.addColorStop(0, 'rgba(220,210,240,0)'); bladeGrad.addColorStop(0.25, '#d9d2ea'); bladeGrad.addColorStop(1, '#8f86a8');
g.fillStyle = bladeGrad;
g.shadowColor = 'rgba(190,150,255,0.9)'; g.shadowBlur = 14;
g.beginPath(); g.moveTo(-280, 3); g.lineTo(160, -7); g.lineTo(160, 6); g.lineTo(-262, 8); g.closePath(); g.fill();
g.shadowBlur = 0; g.fillStyle = '#ffffff'; g.fillRect(-240, -3, 400, 2);
g.fillStyle = '#5a4e72'; g.fillRect(-250, 2, 410, 2);
g.fillStyle = '#2b2236'; g.fillRect(160, -12, 8, 24);          // guard (tsuba)
g.fillStyle = '#0c0a10'; g.fillRect(168, -6, 120, 12);         // handle
g.fillStyle = '#e8e2f2';
for (let x = 172; x < 284; x += 12) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 6, -5); g.lineTo(x + 12, 0); g.lineTo(x + 6, 5); g.closePath(); g.fill(); }
g.fillStyle = '#0c0a10'; g.fillRect(186, -2, 70, 4);
g.fillStyle = '#3a3048'; g.fillRect(288, -7, 6, 14);           // pommel
g.restore();

// Title.
g.save(); g.translate(cx, 112); g.transform(1, 0, -0.18, 1, 0, 0);
g.font = '900 108px "Arial Black", Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
g.lineJoin = 'round';
g.lineWidth = 16; g.strokeStyle = '#0b0614'; g.strokeText('ZENTHRA', 0, 0);
g.lineWidth = 6; g.strokeStyle = '#3d2463'; g.strokeText('ZENTHRA', 0, 0);
const tg = g.createLinearGradient(0, -90, 0, 6);
tg.addColorStop(0, '#fbf7ff'); tg.addColorStop(0.35, '#d9c2ff'); tg.addColorStop(0.62, '#a77ae6'); tg.addColorStop(1, '#5c32a8');
g.fillStyle = tg; g.fillText('ZENTHRA', 0, 0);
g.globalCompositeOperation = 'source-atop';
g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(-330, -90, 660, 34);
g.restore();

// Sakura flowers on the title.
const flower = (x, y, s) => {
  g.save(); g.translate(x, y);
  for (let i = 0; i < 5; i++) {
    g.rotate((Math.PI * 2) / 5);
    g.fillStyle = '#f0a8e6'; g.beginPath(); g.ellipse(0, -s, s * 0.62, s, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#d27fcf'; g.beginPath(); g.ellipse(0, -s * 0.6, s * 0.25, s * 0.45, 0, 0, Math.PI * 2); g.fill();
  }
  g.fillStyle = '#fff1a8'; g.beginPath(); g.arc(0, 0, s * 0.28, 0, Math.PI * 2); g.fill();
  g.restore();
};
flower(150, 42, 13); flower(486, 34, 11); flower(520, 128, 12); flower(128, 120, 9); flower(470, 80, 7);

// "CLIENT" with small ornaments.
g.font = '700 26px "Segoe UI", Arial, sans-serif'; g.textAlign = 'center';
g.fillStyle = '#efe7fb'; g.strokeStyle = '#0b0614'; g.lineWidth = 5;
const spaced = 'C L I E N T';
g.strokeText(spaced, cx, 172); g.fillText(spaced, cx, 172);
g.fillStyle = '#b48ae8';
g.fillRect(cx - 150, 162, 66, 2); g.fillRect(cx + 84, 162, 66, 2);
g.beginPath(); g.moveTo(cx - 84, 158); g.lineTo(cx - 78, 163); g.lineTo(cx - 84, 168); g.lineTo(cx - 90, 163); g.fill();
g.beginPath(); g.moveTo(cx + 84, 158); g.lineTo(cx + 90, 163); g.lineTo(cx + 84, 168); g.lineTo(cx + 78, 163); g.fill();
return c.toDataURL('image/png');
`;

async function render(script, file) {
  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
  await win.loadURL('data:text/html;charset=utf-8,<html><body></body></html>');
  const dataUrl = await win.webContents.executeJavaScript('(() => { try {' + script + '} catch (e) { return "ERR:" + e.stack; } })()');
  if (dataUrl.startsWith('ERR:')) throw new Error(file + ' : ' + dataUrl);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, file), Buffer.from(dataUrl.split(',')[1], 'base64'));
  win.destroy();
  console.log('écrit : ' + file);
}

// Icon atlas for the in-game screens, drawn from Lucide icons (ISC licence, see
// node_modules/lucide-react/LICENSE): 32 px cells, 8 per row; the first half of the
// image is lavender, the second half white (hovered / active). The Java enum
// gui/ZIcon.java is generated with the same order.
const ICONS = [
  // Modules
  ['WAYPOINTS', 'MapPin'], ['HIT_COLOR', 'Palette'], ['FREELOOK', 'Eye'], ['ZOOM', 'ZoomIn'],
  ['KEYSTROKES', 'Keyboard'], ['CPS', 'MousePointerClick'], ['FPS', 'ChartLine'], ['ARMOR', 'Shield'],
  ['POTION', 'FlaskConical'], ['CROSSHAIR', 'Crosshair'], ['SPRINT', 'Zap'], ['DIRECTION', 'Compass'],
  ['TIMER', 'Timer'], ['SCOREBOARD', 'ListOrdered'], ['STATUS', 'Activity'], ['MAIN_MENU', 'House'],
  ['INVENTORY', 'Backpack'], ['TOTEM', 'HeartPulse'], ['PING', 'Wifi'], ['DAY', 'Sun'],
  ['CLOCK', 'Clock'], ['SPEED', 'Wind'], ['MEMORY', 'MemoryStick'], ['DURABILITY', 'TriangleAlert'],
  ['NETHER', 'Flame'], ['BREAK', 'Coffee'],
  // Navigation
  ['ALL', 'LayoutGrid'], ['HUD', 'Monitor'], ['PVP', 'Target'], ['CAMERA', 'Camera'],
  ['UTILITY', 'Wrench'], ['WORLD', 'Box'], ['PROFILES', 'Layers'], ['PERFORMANCE', 'ChartColumn'],
  ['DIAGNOSTIC', 'Info'],
  // Interface
  ['SEARCH', 'Search'], ['CLOSE', 'X'], ['CHECK', 'Check'], ['RESET', 'RotateCcw'],
  ['CHEVRON', 'ChevronRight'], ['SETTINGS', 'Settings'], ['USERS', 'Users'], ['KEY', 'Keyboard'],
  ['SAVE', 'Save'],
];

function iconSvgs(color) {
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const lucide = require('lucide-react');
  return ICONS.map(([name, component]) => {
    if (!lucide[component]) throw new Error(`icône Lucide introuvable : ${component} (${name})`);
    return renderToStaticMarkup(React.createElement(lucide[component], { size: 28, color, strokeWidth: 2.25 }));
  });
}

async function renderIcons() {
  const cell = 32, cols = 8, rows = Math.ceil(ICONS.length / cols);
  const sets = [iconSvgs('#c9b0f5'), iconSvgs('#ffffff')];
  const script = `
const sets = ${JSON.stringify(sets)};
const cell = ${cell}, cols = ${cols}, rows = ${rows};
const c = document.createElement('canvas'); c.width = cols * cell; c.height = rows * cell * 2;
const g = c.getContext('2d');
const load = (svg) => new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); });
return (async () => {
  for (let s = 0; s < 2; s++) for (let i = 0; i < sets[s].length; i++) {
    const img = await load(sets[s][i]);
    g.drawImage(img, (i % cols) * cell + 2, (Math.floor(i / cols) + s * rows) * cell + 2, 28, 28);
  }
  return c.toDataURL('image/png');
})();`;
  await render(script, 'icons.png');
  const javaFile = path.join(__dirname, '..', '..', 'minecraft-mod', 'src', 'main', 'java', 'client', 'zenthra', 'gui', 'ZIcon.java');
  const java = `package client.zenthra.gui;

/**
 * Icons of assets/zenthra/textures/gui/icons.png (Lucide, ISC licence), ${cell} px cells,
 * ${cols} per row, lavender then white. Generated by launcher/scripts/make-menu-art.cjs: do not edit.
 */
public enum ZIcon {
${ICONS.map(([n]) => `\t${n}`).join(',\n')};

\tpublic static final int CELL = ${cell}, COLUMNS = ${cols}, ROWS = ${rows};
\tpublic static final int TEXTURE_WIDTH = ${cols * cell}, TEXTURE_HEIGHT = ${rows * cell * 2};
}
`;
  fs.writeFileSync(javaFile, java);
  console.log('écrit : ZIcon.java');
}
app.on('window-all-closed', () => {});
app.whenReady().then(async () => {
  try {
    await render(backgroundScript, 'menu_background.png');
    await render(logoScript, 'logo.png');
    await renderIcons();
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  }
  app.quit();
});
