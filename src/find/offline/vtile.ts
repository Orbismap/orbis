// Drops the layers of a vector tile that the app does not draw, without decoding it: a tile is a list of protobuf fields,
// each layer being field 3 with its name as field 1.

function varint(data: Uint8Array, at: number): [value: number, next: number] {
  let value = 0, factor = 1;
  for (;;) {
    const byte = data[at++];
    if (byte === undefined) throw new Error('Kachel abgeschnitten');
    value += (byte & 0x7f) * factor;
    if (byte < 0x80) return [value, at];
    factor *= 128;
  }
}

/** The fields of a message: its number, the whole field and, for length-delimited ones, the content. */
function* fields(data: Uint8Array) {
  for (let at = 0; at < data.length;) {
    const start = at;
    const [tag, afterTag] = varint(data, at);
    const wire = tag & 7;
    let content: Uint8Array | undefined;
    if (wire === 0) at = varint(data, afterTag)[1];
    else if (wire === 1) at = afterTag + 8;
    else if (wire === 5) at = afterTag + 4;
    else if (wire === 2) {
      const [length, from] = varint(data, afterTag);
      at = from + length;
      content = data.subarray(from, at);
    } else throw new Error('Unbekanntes Kachelformat');
    if (at > data.length) throw new Error('Kachel abgeschnitten');
    yield { field: tag >> 3, whole: data.subarray(start, at), content };
  }
}

const text = new TextDecoder();

export function keepLayers(tile: Uint8Array, keep: ReadonlySet<string>): Uint8Array<ArrayBuffer> {
  const parts: Uint8Array[] = [];
  for (const { field, whole, content } of fields(tile)) {
    if (field === 3 && content) {
      let name = '';
      for (const f of fields(content)) if (f.field === 1 && f.content) { name = text.decode(f.content); break; }
      if (!keep.has(name)) continue;
    }
    parts.push(whole);
  }
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}
