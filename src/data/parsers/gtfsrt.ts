// GTFS-Realtime VehiclePositions without a protobuf library: a tiny wire-format reader for exactly the fields we need
// (FeedMessage.entity[].vehicle: trip, position, timestamp, stop_id, vehicle descriptor).
export interface RtVehicle {
  lat: number;
  lon: number;
  bearing?: number;
  /** m/s */
  speed?: number;
  tripId?: string;
  routeId?: string;
  stopId?: string;
  /** vehicle label (e.g. the fleet number) */
  label?: string;
  id?: string;
  /** seconds since epoch */
  timestamp?: number;
}

class Reader {
  pos: number;
  constructor(readonly buf: Uint8Array, pos = 0, readonly end = buf.length) {
    this.pos = pos;
  }
  varint(): number {
    let result = 0;
    let shift = 0;
    let b: number;
    do {
      b = this.buf[this.pos++]!;
      result += (b & 0x7f) * 2 ** shift;
      shift += 7;
    } while (b & 0x80 && this.pos < this.end);
    return result;
  }
  float(): number {
    const v = new DataView(this.buf.buffer, this.buf.byteOffset + this.pos, 4).getFloat32(0, true);
    this.pos += 4;
    return v;
  }
  /** length-delimited field as a sub reader */
  sub(): Reader {
    const len = this.varint();
    const r = new Reader(this.buf, this.pos, this.pos + len);
    this.pos += len;
    return r;
  }
  string(): string {
    const r = this.sub();
    return new TextDecoder().decode(this.buf.subarray(r.pos, r.end));
  }
  skip(wire: number) {
    if (wire === 0) this.varint();
    else if (wire === 1) this.pos += 8;
    else if (wire === 2) {
      const len = this.varint(); // read first: `pos += varint()` would use the old pos
      this.pos += len;
    }
    else if (wire === 5) this.pos += 4;
    else throw new Error(`protobuf wire type ${wire}`);
  }
  /** `fn(field, wire)` must consume the value and return true, or return false to skip it. */
  each(fn: (field: number, wire: number) => boolean): void {
    while (this.pos < this.end) {
      const tag = this.varint();
      const field = Math.floor(tag / 8);
      const wire = tag & 7;
      if (!fn(field, wire)) this.skip(wire);
    }
  }
}

/** FeedMessage -> vehicle positions (entries without coordinates are dropped). */
export function gtfsRtVehicles(data: ArrayBuffer | Uint8Array): RtVehicle[] {
  const out: RtVehicle[] = [];
  const msg = new Reader(data instanceof Uint8Array ? data : new Uint8Array(data));
  msg.each((f, w) => {
    if (f !== 2 || w !== 2) return false; // FeedMessage.entity
    const ent = msg.sub();
    ent.each((ef, ew) => {
      if (ef !== 4 || ew !== 2) return false; // FeedEntity.vehicle
      const vp = ent.sub();
      const v: Partial<RtVehicle> = {};
      vp.each((vf, vw) => {
        if (vf === 5 && vw === 0) {
          v.timestamp = vp.varint(); // VehiclePosition.timestamp
          return true;
        }
        if (vw !== 2) return false;
        if (vf === 7) {
          v.stopId = vp.string();
          return true;
        }
        if (vf !== 1 && vf !== 2 && vf !== 8) return false;
        const s = vp.sub();
        if (vf === 2) {
          s.each((pf, pw) => {
            if (pw !== 5) return false;
            const x = s.float();
            if (pf === 1) v.lat = x;
            else if (pf === 2) v.lon = x;
            else if (pf === 3) v.bearing = x;
            else if (pf === 5) v.speed = x;
            return true;
          });
        } else if (vf === 1) {
          s.each((tf, tw) => {
            if (tw !== 2) return false;
            if (tf === 1) v.tripId = s.string();
            else if (tf === 5) v.routeId = s.string();
            else return false;
            return true;
          });
        } else {
          s.each((df, dw) => {
            if (dw !== 2) return false;
            if (df === 1) v.id = s.string();
            else if (df === 2) v.label = s.string();
            else return false;
            return true;
          });
        }
        return true;
      });
      if (v.lat !== undefined && v.lon !== undefined && (v.lat !== 0 || v.lon !== 0) && Number.isFinite(v.lat) && Number.isFinite(v.lon)) out.push(v as RtVehicle);
      return true;
    });
    return true;
  });
  return out;
}
