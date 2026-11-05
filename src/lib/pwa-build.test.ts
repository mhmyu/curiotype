import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  computeRevision,
  isDataFile,
  isExcludedFromPrecache,
  listFiles,
  planPrecache,
  renderServiceWorker,
  toUrlPath,
  writeServiceWorker,
} from './pwa-build';

const template = readFileSync('src/pwa/sw-template.js', 'utf8');

describe('toUrlPath', () => {
  it.each([
    ['index.html', '/'],
    ['id/index.html', '/id/'],
    ['id/stats/index.html', '/id/stats/'],
    ['_astro/app.abc123.js', '/_astro/app.abc123.js'],
    ['data/id/sentences.json', '/data/id/sentences.json'],
    ['404.html', '/404.html'],
    ['favicon.svg', '/favicon.svg'],
  ])('%s -> %s', (file, url) => {
    expect(toUrlPath(file)).toBe(url);
  });
});

describe('isExcludedFromPrecache', () => {
  it.each(['/sw.js', '/_headers', '/_redirects', '/robots.txt', '/404.html', '/sitemap-index.xml', '/sitemap-0.xml', '/og/id.png', '/_astro/a.js.map'])(
    'skips %s',
    (path) => {
      expect(isExcludedFromPrecache(path)).toBe(true);
    },
  );

  it.each(['/', '/id/', '/en/settings/', '/_astro/app.js', '/_astro/fonts/a.woff2', '/icons/icon-192.png', '/favicon.svg', '/id/manifest.webmanifest'])(
    'keeps %s',
    (path) => {
      expect(isExcludedFromPrecache(path)).toBe(false);
    },
  );
});

describe('isDataFile', () => {
  it('matches only the sentence files', () => {
    expect(isDataFile('/data/id/sentences.json')).toBe(true);
    expect(isDataFile('/data/pt-br/sentences.json')).toBe(true);
    expect(isDataFile('/data/id/other.json')).toBe(false);
    expect(isDataFile('/id/sentences.json')).toBe(false);
  });
});

describe('planPrecache', () => {
  it('splits pages and assets from sentence files, sorted, without duplicates or excluded files', () => {
    const plan = planPrecache([
      '/id/',
      '/data/id/sentences.json',
      '/',
      '/sw.js',
      '/og/en.png',
      '/_astro/a.js',
      '/id/',
      '/en/',
      '/data/en/sentences.json',
      '/robots.txt',
    ]);
    expect(plan.precache).toEqual(['/', '/_astro/a.js', '/en/', '/id/']);
    expect(plan.data).toEqual(['/data/en/sentences.json', '/data/id/sentences.json']);
  });
});

describe('computeRevision', () => {
  const files = [
    { path: '/id/', content: 'one' },
    { path: '/_astro/a.js', content: 'two' },
  ];

  it('is stable and does not depend on the order of the files', () => {
    expect(computeRevision(files, template)).toBe(computeRevision([...files].reverse(), template));
    expect(computeRevision(files, template)).toMatch(/^[0-9a-f]{12}$/);
  });

  it('changes when a file changes, a file is added, or the template changes', () => {
    const base = computeRevision(files, template);
    expect(computeRevision([{ ...files[0], content: 'changed' }, files[1]], template)).not.toBe(base);
    expect(computeRevision([...files, { path: '/en/', content: 'x' }], template)).not.toBe(base);
    expect(computeRevision(files, `${template}\n// edit`)).not.toBe(base);
  });

  it('tells a moved file from a changed one', () => {
    expect(computeRevision([{ path: '/a', content: 'x' }], template)).not.toBe(
      computeRevision([{ path: '/b', content: 'x' }], template),
    );
  });
});

describe('renderServiceWorker', () => {
  const plan = { precache: ['/', '/id/', '/_astro/a.js'], data: ['/data/id/sentences.json'] };

  it('fills every placeholder and leaves valid JavaScript', () => {
    const source = renderServiceWorker(template, plan, 'abc123', '/id/');
    expect(source).toContain('const REVISION = "abc123";');
    expect(source).toContain('const PRECACHE_URLS = ["/","/id/","/_astro/a.js"];');
    expect(source).toContain('const DATA_URLS = ["/data/id/sentences.json"];');
    expect(source).toContain('const FALLBACK_URL = "/id/";');
    expect(() => new Function(source)).not.toThrow();
  });

  it('does not treat `$` in a value as a replacement pattern', () => {
    const source = renderServiceWorker(template, { precache: ['/a$&b'], data: [] }, 'r', '/id/');
    expect(source).toContain('["/a$&b"]');
  });

  it('fails when the template lost a placeholder', () => {
    const broken = template.replace("/*REVISION*/'dev'", "'dev'");
    expect(() => renderServiceWorker(broken, plan, 'r', '/id/')).toThrow(/REVISION/);
  });
});

describe('writeServiceWorker', () => {
  const folders: string[] = [];
  afterEach(() => {
    for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
  });

  function makeBuild(files: Record<string, string>): string {
    const root = mkdtempSync(join(tmpdir(), 'typing-pwa-'));
    folders.push(root);
    for (const [name, content] of Object.entries(files)) {
      const path = join(root, name);
      mkdirSync(join(path, '..'), { recursive: true });
      writeFileSync(path, content);
    }
    return root;
  }

  const build = {
    'index.html': '<meta http-equiv="refresh" content="0;url=/id/">',
    'id/index.html': '<html>id</html>',
    'en/index.html': '<html>en</html>',
    '404.html': '<html>404</html>',
    '_astro/app.1.js': 'console.log(1)',
    'data/id/sentences.json': '[]',
    'og/id.png': 'png',
    '_headers': '/*',
    'robots.txt': 'User-agent: *',
  };

  it('writes sw.js next to the pages with the plan and a revision', () => {
    const outDir = makeBuild(build);
    const result = writeServiceWorker({ outDir, template, fallbackUrl: '/id/' });
    expect(result.plan.precache).toEqual(['/', '/_astro/app.1.js', '/en/', '/id/']);
    expect(result.plan.data).toEqual(['/data/id/sentences.json']);
    const written = readFileSync(join(outDir, 'sw.js'), 'utf8');
    expect(written).toContain(result.revision);
    expect(listFiles(outDir)).toContain('sw.js');
  });

  it('gives the same revision again, and a new one after a page changes', () => {
    const first = writeServiceWorker({ outDir: makeBuild(build), template, fallbackUrl: '/id/' });
    const again = writeServiceWorker({ outDir: makeBuild(build), template, fallbackUrl: '/id/' });
    const changed = writeServiceWorker({
      outDir: makeBuild({ ...build, 'id/index.html': '<html>changed</html>' }),
      template,
      fallbackUrl: '/id/',
    });
    expect(again.revision).toBe(first.revision);
    expect(changed.revision).not.toBe(first.revision);
  });

  it('ignores a previous sw.js, so building twice into one folder is stable', () => {
    const outDir = makeBuild(build);
    const first = writeServiceWorker({ outDir, template, fallbackUrl: '/id/' });
    const second = writeServiceWorker({ outDir, template, fallbackUrl: '/id/' });
    expect(second.revision).toBe(first.revision);
  });

  it('fails when the fallback page is not part of the build', () => {
    const outDir = makeBuild({ 'index.html': 'x' });
    expect(() => writeServiceWorker({ outDir, template, fallbackUrl: '/id/' })).toThrow(/fallback/);
  });
});
