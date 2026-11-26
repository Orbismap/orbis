import type { Plugin } from 'vite';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { precacheUrls } from './src/pwa/precache';

const publicDir = fileURLToPath(new URL('./public', import.meta.url));
const swSource = fileURLToPath(new URL('./src/pwa/sw.js', import.meta.url));
/** The apps that work offline: `src/<app>/main.tsx`, their public files in `public/<app>/`. */
const APPS = ['wetter', 'bahn', 'find'] as const;
const SHARED_PUBLIC = ['favicon.svg', 'apple-touch-icon.png'];

const listPublic = (dir: string, prefix = ''): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? listPublic(join(dir, entry.name), `${prefix}${entry.name}/`) : [`${prefix}${entry.name}`],
  );

const isModule = (item: { type: string; facadeModuleId?: string | null } | undefined, path: string): boolean =>
  item?.type === 'chunk' && !!item.facadeModuleId?.replace(/\\/g, '/').endsWith(path);
/** The map app's chunk (it has no facade when other chunks share code with it, so its modules are asked). */
const isMapApp = (item: { type: string; moduleIds?: string[] } | undefined): boolean =>
  item?.type === 'chunk' && !!item.moduleIds?.some((id) => id.replace(/\\/g, '/').endsWith('/src/boot.tsx'));

/**
 * Offline shells of the small apps (weather, Bahn, Find). The build is shared with the map, so each app precaches only what it needs:
 * the entry chunk, its own chunk with everything it imports (plus CSS and worker assets), index.html and its public files.
 * Everything else of the map never reaches these caches.
 */
export function orbisPwa(): Plugin {
  return {
    name: 'orbis-pwa',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const chunks = Object.values(bundle).filter((item) => item.type === 'chunk');
      const entry = chunks.find((chunk) => chunk.isEntry);
      const template = readFileSync(swSource, 'utf8');
      const allPublic = listPublic(publicDir);
      const workers = Object.keys(bundle).filter((name) => /(^|\/)worker-[\w-]+\.js$/.test(name));

      for (const app of APPS) {
        const main = chunks.find((chunk) => isModule(chunk, `/src/${app}/main.tsx`));
        if (!main || !entry) {
          this.warn(`pwa: chunk of "${app}" or entry chunk not found – no service worker emitted`);
          continue;
        }

        const files = new Set<string>(['index.html']);
        // The app's own lazy imports (map library, render kit, widgets) are needed offline too; the entry's are not
        // (that would pull in the other apps). The entry is visited first, so nothing leads back into it.
        const visit = (name: string, lazy: boolean) => {
          if (files.has(name)) return;
          const chunk = bundle[name];
          if (!chunk || chunk.type !== 'chunk') return;
          files.add(name);
          chunk.imports.forEach((dep) => visit(dep, lazy));
          // The map app (handoff target of the weather app) is not precached: it is not made for offline use.
          if (lazy) chunk.dynamicImports.filter((dep) => !isMapApp(bundle[dep])).forEach((dep) => visit(dep, false));
          chunk.viteMetadata?.importedCss.forEach((css) => files.add(css));
          chunk.viteMetadata?.importedAssets.forEach((asset) => files.add(asset));
          // own workers (`new Worker(new URL(…))`) appear in no import list, only by name in the code
          for (const asset of workers) if (chunk.code.includes(asset.slice(asset.lastIndexOf('/') + 1))) files.add(asset);
        };
        visit(entry.fileName, false);
        visit(main.fileName, true);

        const publicFiles = allPublic.filter((file) => file.startsWith(`${app}/`) || SHARED_PUBLIC.includes(file));
        const required = precacheUrls('/', [...files]);
        const optional = precacheUrls('/', publicFiles);
        // changes with any file name of the build, any public file and the worker itself: browsers then install anew
        const hash = createHash('sha256').update(template).update(required.join('\n'));
        for (const file of publicFiles) hash.update(file).update(readFileSync(join(publicDir, file)));
        const config = { app, version: hash.digest('hex').slice(0, 12), required, optional };
        this.emitFile({ type: 'asset', fileName: `${app}-sw.js`, source: `const CONFIG = ${JSON.stringify(config)};\n${template}` });
      }
    },
  };
}
