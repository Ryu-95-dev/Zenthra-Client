// Builds the update manifest for a release archive.
//   node scripts/make-update-manifest.mjs <archive.zip> <public URL of the archive> [notes.txt]
// Publish the printed JSON over HTTPS and put its address in Paramètres → Mises à jour.
import crypto from 'node:crypto';
import fs from 'node:fs';

const [archive, url, notesFile] = process.argv.slice(2);
if (!archive || !url?.startsWith('https://')) {
  console.error('Usage : node scripts/make-update-manifest.mjs <archive.zip> <https://…/archive.zip> [notes.txt]');
  process.exit(1);
}
const { version } = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const data = fs.readFileSync(archive);
const manifest = {
  formatVersion: 1,
  version,
  notes: notesFile ? fs.readFileSync(notesFile, 'utf8') : '',
  publishedAt: new Date().toISOString(),
  downloads: {
    'win-x64': { url, sha256: crypto.createHash('sha256').update(data).digest('hex'), size: data.length },
  },
};
console.log(JSON.stringify(manifest, null, 2));
