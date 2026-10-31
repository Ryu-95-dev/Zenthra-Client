import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, setupTempRoot, startServer } from './helpers';

const content = crypto.randomBytes(200_000);
const sha1 = crypto.createHash('sha1').update(content).digest('hex');

let root: string;
beforeEach(() => {
  root = setupTempRoot();
});
afterEach(() => cleanup(root));

describe('download', () => {
  it('downloads and verifies a file, then reuses it', async () => {
    const { download } = await import('../electron/services/http');
    let hits = 0;
    const srv = await startServer((_req, res) => {
      hits++;
      res.end(content);
    });
    const dest = path.join(root, 'a.bin');
    expect(await download({ url: `${srv.url}/a`, dest, hash: { algo: 'sha1', value: sha1 } })).toBe('downloaded');
    expect(fs.readFileSync(dest).equals(content)).toBe(true);
    expect(await download({ url: `${srv.url}/a`, dest, hash: { algo: 'sha1', value: sha1 } })).toBe('cached');
    expect(hits).toBe(1);
    await srv.close();
  });

  it('rejects a corrupted file and leaves nothing behind', async () => {
    const { download } = await import('../electron/services/http');
    const srv = await startServer((_req, res) => res.end(Buffer.from('not the right content')));
    const dest = path.join(root, 'bad.bin');
    await expect(download({ url: `${srv.url}/x`, dest, hash: { algo: 'sha1', value: sha1 } })).rejects.toThrow(/corrompu/);
    expect(fs.existsSync(dest)).toBe(false);
    expect(fs.existsSync(`${dest}.part`)).toBe(false);
    await srv.close();
  });

  it('resumes an interrupted download with a Range request', async () => {
    const { download } = await import('../electron/services/http');
    const ranges: (string | undefined)[] = [];
    const srv = await startServer((req, res) => {
      ranges.push(req.headers.range);
      const m = /bytes=(\d+)-/.exec(req.headers.range ?? '');
      if (m) {
        const start = Number(m[1]);
        res.writeHead(206, { 'content-length': content.length - start });
        res.end(content.subarray(start));
      } else {
        res.end(content);
      }
    });
    const dest = path.join(root, 'resume.bin');
    // Simulate a previous interrupted attempt that saved the first 80 000 bytes.
    fs.writeFileSync(`${dest}.part`, content.subarray(0, 80_000));
    expect(await download({ url: `${srv.url}/r`, dest, hash: { algo: 'sha1', value: sha1 } })).toBe('downloaded');
    expect(ranges[0]).toBe('bytes=80000-');
    expect(fs.readFileSync(dest).equals(content)).toBe(true);
    await srv.close();
  });

  it('can be cancelled', async () => {
    const { download } = await import('../electron/services/http');
    const srv = await startServer((_req, res) => {
      res.write(content.subarray(0, 1000)); // never finishes
    });
    const ctrl = new AbortController();
    const p = download({ url: `${srv.url}/slow`, dest: path.join(root, 'c.bin'), signal: ctrl.signal });
    setTimeout(() => ctrl.abort(), 200);
    await expect(p).rejects.toThrow(/annulée/);
    srv.close();
  });

  it('refuses files above the size limit', async () => {
    const { download } = await import('../electron/services/http');
    const srv = await startServer((_req, res) => res.end(content));
    await expect(download({ url: `${srv.url}/big`, dest: path.join(root, 'big.bin'), maxBytes: 1000 })).rejects.toThrow(/volumineux/);
    await srv.close();
  });

  it('refuses hosts that are not allowed and plain http', async () => {
    const { download, request } = await import('../electron/services/http');
    await expect(download({ url: 'https://evil.example/x.jar', dest: path.join(root, 'e'), allowedHosts: ['cdn.modrinth.com'] })).rejects.toThrow(/non vérifiée/);
    await expect(request('http://example.com/')).rejects.toThrow(/non sécurisée/);
  });
});
