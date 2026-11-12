import { describe, expect, it } from 'vitest';
import { AisBook, etaText, parseAisMessage, parseAisTime, subscriptionBoxes } from './aisstream';
import { relayUrl } from './aisclient';
import { commonsSearchUrl, parseCommonsPhoto } from './shipphoto';

const pos = '{"MetaData":{"MMSI":235053187,"ShipName":"SKY CLIPPER         ","latitude":51.48388,"longitude":-0.00996,"time_utc":"2026-11-11 17:51:23.338204023 +0000 UTC"},"MessageType":"PositionReport","Message":{"PositionReport":{"NavigationalStatus":0,"Sog":12.3,"Cog":8.1,"TrueHeading":511}}}';
const stat = '{"MetaData":{"MMSI":235053187,"ShipName":"SKY CLIPPER"},"MessageType":"ShipStaticData","Message":{"ShipStaticData":{"CallSign":"9HB7065","Destination":"HAMBLE@@","Dimension":{"A":12,"B":17,"C":4,"D":3},"Eta":{"Day":11,"Hour":14,"Minute":0,"Month":9},"ImoNumber":9811000,"MaximumStaticDraught":3.6,"Name":"SKY CLIPPER","Type":60}}}';

describe('aisstream', () => {
  it('parses time and position reports', () => {
    expect(parseAisTime('2026-11-11 17:51:23.338204023 +0000 UTC')).toBe(Date.UTC(2026, 10, 11, 17, 51, 23));
    const m = parseAisMessage(pos, Date.UTC(2026, 10, 12))!;
    expect(m).toMatchObject({ kind: 'pos', mmsi: 235053187, sog: 12.3, cog: 8.1, hdg: -1, name: 'SKY CLIPPER' });
    expect(parseAisMessage('{"error":"Api Key Is Not Valid"}')).toEqual({ kind: 'error', text: 'Api Key Is Not Valid' });
    expect(parseAisMessage('nope')).toBeNull();
    expect(parseAisMessage('{"Message":{"CompressionEnabled":false},"MessageType":"SubscriptionConfirmation"}')).toBeNull();
  });
  it('merges static data into tracks', () => {
    const b = new AisBook();
    b.apply(parseAisMessage(pos)!);
    b.apply(parseAisMessage(stat)!);
    const [t] = b.tracks();
    expect(t!.props).toMatchObject({ cls: 'passenger', name: 'SKY CLIPPER', moving: true });
    expect(t!.heading).toBeCloseTo(8.1);
    const s = b.statics.get(235053187)!;
    expect(s).toMatchObject({ dest: 'HAMBLE', imo: 9811000, len: 29, wid: 7 });
    expect(etaText(s.eta)).toBe('11.09., 14:00 UTC');
  });
  it('keeps a trail and caps the book', () => {
    const b = new AisBook(2);
    for (let i = 0; i < 4; i++) b.apply({ kind: 'pos', mmsi: i, lng: 1, lat: 1, sog: 1, cog: 1, hdg: -1, nav: 0, name: '', t: Date.now() - i * 1000 });
    b.prune();
    expect(b.ships.size).toBe(2);
    for (let i = 0; i < 5; i++) b.apply({ kind: 'pos', mmsi: 9, lng: 1 + i * 0.01, lat: 1, sog: 1, cog: 1, hdg: -1, nav: 0, name: '', t: Date.now() + i * 30_000 });
    expect(b.trails.get(9)!.length).toBe(5);
  });
  it('builds subscription boxes', () => {
    expect(subscriptionBoxes({ west: 0, south: 50, east: 3, north: 52 })).toEqual([[[50, 0], [52, 3]]]);
    expect(subscriptionBoxes({ west: 170, south: -10, east: 190, north: 10 })).toHaveLength(2);
    expect(subscriptionBoxes({ west: -180, south: -90, east: 180, north: 90 })).toEqual([[[-90, -180], [90, 180]]]);
  });
  it('derives the relay url', () => {
    expect(relayUrl('https://orbis.malte9799.workers.dev/')).toBe('wss://orbis.malte9799.workers.dev/ais');
  });
  it('accepts a Commons photo only when the title names the ship and the licence is free', () => {
    const page = (title: string, lic: string) => ({ title, index: 1, imageinfo: [{ thumburl: 'https://upload.wikimedia.org/x.jpg', descriptionurl: 'https://commons.wikimedia.org/wiki/' + title, extmetadata: { LicenseShortName: { value: lic }, Artist: { value: '<a href="x">S.J. de Waard</a>' } } }] });
    const raw = { query: { pages: [page('File:Container ship Foo.jpg', 'CC BY 2.0'), page('File:IMO 9811000 EVER GIVEN (11).JPG', 'CC BY-SA 3.0')] } };
    const p = parseCommonsPhoto(raw, { imo: 9811000, name: 'EVER GIVEN' })!;
    expect(p.author).toBe('S.J. de Waard');
    expect(p.license).toBe('CC BY-SA 3.0');
    expect(parseCommonsPhoto(raw, { imo: 0, name: 'LADY 8' })).toBeNull();
    expect(parseCommonsPhoto({ query: { pages: [page('File:EVER GIVEN.jpg', 'All rights reserved')] } }, { imo: 0, name: 'EVER GIVEN' })).toBeNull();
    expect(commonsSearchUrl('IMO 1')).toContain('origin=*');
  });
});
