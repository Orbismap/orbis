/** Baut die URL-Liste für den App-Shell-Cache der Service Worker.
 *  Rein gehalten, damit sie ohne Vite-Build getestet werden kann. */

export function precacheUrls(base: string, files: string[]): string[] {
  const basePath = base.endsWith('/') ? base : `${base}/`;
  const urls = new Set<string>();

  for (const file of files) {
    const name = file.replace(/^\/+/, '');
    // Die Seite liegt unter dem Basis-Pfad selbst: Auf Cloudflare leitet `/index.html` dorthin um.
    urls.add(name === 'index.html' ? basePath : `${basePath}${name}`);
  }

  return [...urls].sort();
}
