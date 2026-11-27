// Tiles are kept compressed: that is the space they take.
async function through(data: Uint8Array<ArrayBuffer>, stream: CompressionStream | DecompressionStream): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(stream)).arrayBuffer());
}
export const gzip = (data: Uint8Array<ArrayBuffer>) => through(data, new CompressionStream('gzip'));
export const gunzip = (data: Uint8Array<ArrayBuffer>) => through(data, new DecompressionStream('gzip'));
