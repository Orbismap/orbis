import type { Plugin } from 'vite';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { precacheUrls } from './src/wetter/pwa/precache';

const publicDir = fileURLToPath(new URL('./public', import.meta.url));
const swSource = fileURLToPath(new URL('./src/wetter/pwa/sw.js', import.meta.url));

const listPublic = (dir: string, prefix = ''): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? listPublic(join(dir, entry.name), `${prefix}${entry.name}/`) : [`${prefix}${entry.name}`],
  );

/**
 * Offline shell for the weather PWA. The build is shared with the map, so only what the weather app needs is
 * precached: the entry chunk, the weather chunk with everything it imports statically (plus CSS and worker assets),
 * index.html and public/wetter/. Everything else of the map never reaches the weather cache.
 */
const isMapApp = (item: { type: string; facadeModuleId?: string | null } | undefined): boolean =>
  item?.type === 'chunk' && !!item.facadeModuleId?.replace(/\\/g, '/').endsWith('/src/boot.tsx');

export function wetterPwa(): Plugin {
  return {
    name: 'orbis-wetter-pwa',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const chunks = Object.values(bundle).filter((item) => item.type === 'chunk');
      const wetterEntry = chunks.find((chunk) => chunk.facadeModuleId?.replace(/\\/g, '/').endsWith('/src/wetter/main.tsx'));
      const entry = chunks.find((chunk) => chunk.isEntry);
      if (!wetterEntry || !entry) {
        this.warn('wetter-pwa: weather or entry chunk not found – no offline precache emitted');
        return;
      }

      const files = new Set<string>(['index.html']);
      // The weather chunk's own lazy imports (render kit, widgets) are needed offline too; the entry's are not
      // (that would pull in the whole map app).
      const visit = (name: string, lazy = false) => {
        if (files.has(name)) return;
        const chunk = bundle[name];
        if (!chunk || chunk.type !== 'chunk') return;
        files.add(name);
        chunk.imports.forEach((dep) => visit(dep, false));
        // The map app (handoff target) is not precached: offline there are no tiles for it anyway.
        if (lazy) chunk.dynamicImports.filter((dep) => !isMapApp(bundle[dep])).forEach((dep) => visit(dep, false));
        chunk.viteMetadata?.importedCss.forEach((css) => files.add(css));
        chunk.viteMetadata?.importedAssets.forEach((asset) => files.add(asset));
      };
      visit(entry.fileName);
      visit(wetterEntry.fileName, true);

      const publicFiles = listPublic(publicDir).filter(
        (file) => file.startsWith('wetter/') || file === 'favicon.svg' || file === 'apple-touch-icon.png',
      );
      const urls = precacheUrls('/', [...files], publicFiles);
      const version = createHash('sha256').update(urls.join('\n')).digest('hex').slice(0, 12);
      this.emitFile({ type: 'asset', fileName: 'wetter-precache.json', source: JSON.stringify({ version, urls }) });
      // The version comment changes sw.js on every build, so browsers re-check the precache list.
      this.emitFile({ type: 'asset', fileName: 'wetter-sw.js', source: `${readFileSync(swSource, 'utf8')}\n/* build ${version} */\n` });
    },
  };
}
