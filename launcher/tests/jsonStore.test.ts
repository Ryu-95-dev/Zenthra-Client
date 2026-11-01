import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, setupTempRoot } from './helpers';

let root: string;

describe('writeJson', () => {
  beforeEach(() => {
    root = setupTempRoot();
  });
  afterEach(() => cleanup(root));

  it('survives many saves of the same file at once and keeps the last one', async () => {
    const { writeJson, readJson } = await import('../electron/services/jsonStore');
    const file = path.join(root, 'settings.json');
    // Like dragging the colour picker: dozens of saves without waiting.
    const saves = Array.from({ length: 30 }, (_, i) => writeJson(file, { accentColor: `#0000${String(i).padStart(2, '0')}` }));
    await expect(Promise.all(saves)).resolves.toBeDefined();
    expect(await readJson(file, {})).toEqual({ accentColor: '#000029' });
    expect(fs.readdirSync(root).filter((f) => f.endsWith('.tmp'))).toEqual([]);
  });
});
