import { useState } from 'preact/hooks';
import { Icon } from '../ui/icons';
import { LineBadge, PlatformSign } from '../ui/Badges';
import { MapSheet } from '../ui/MapSheet';
import { useMemo } from 'preact/hooks';
import { journeyEnds, journeyRoutes, modeColor } from '../ui/routes';
import { clock, delayState, delayText, duration } from '../ui/format';
import type { Call, Journey, Leg } from '../data/types';
import { pop } from '../state/nav';

/** Verbindungsdetail: Karte mit Strecke, Kopf mit Zeiten, Zeitleiste mit Gleisen, Zwischenhalten und Umstiegen. */
export function JourneyDetail({ journey: j }: { journey: Journey }) {
  const first = j.legs[0]!;
  const last = j.legs[j.legs.length - 1]!;
  const routes = useMemo(() => journeyRoutes(j), [j]);
  const delay = delayText(j.arrival) || delayText(j.departure);
  const late = delayState(j.arrival) === 'late' || delayState(j.departure) === 'late';
  const share = () => {
    const text = `${first.from.name} ${clock(j.departure.planned)} → ${last.to.name} ${clock(j.arrival.planned)}`;
    if (navigator.share) void navigator.share({ title: 'Verbindung', text }).catch(() => undefined);
    else void navigator.clipboard?.writeText(text);
  };

  return (
    <div class="bn-screen bn-detail">
      <MapSheet
        peek={0.3}
        scene={{ routes, markers: journeyEnds(j), fit: true }}
        header={
          <>
            <div class="bn-ms-head">
              <button type="button" class="bn-iconbtn" aria-label="Zurück" onClick={pop}><Icon name="back" /></button>
              <div class="bn-toprt"><span>{first.from.name}</span><Icon name="back" size={14} class="bn-flip bn-dim" /><span>{last.to.name}</span></div>
              <button type="button" class="bn-iconbtn" aria-label="Teilen" onClick={share}><Icon name="share" /></button>
            </div>
            <div class="bn-bigtime"><b>{clock(j.departure.actual)}</b><span>→</span><b>{clock(j.arrival.actual)}</b></div>
            <div class="bn-pills">
              <span class="bn-pill">{new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: 'numeric', month: 'short' }).format(j.departure.planned)}</span>
              <span class="bn-pill">{duration(j.arrival.actual - j.departure.actual)}</span>
              <span class="bn-pill">{j.transfers === 0 ? 'Direkt' : `${j.transfers} Umstieg${j.transfers > 1 ? 'e' : ''}`}</span>
              {late && <span class="bn-pill bn-pill-late">{delay} min</span>}
              {j.legs.some((l) => l.cancelled) && <span class="bn-pill bn-pill-late">Ausfall</span>}
            </div>
          </>
        }
      >
        <Timeline legs={j.legs} />
      </MapSheet>
    </div>
  );
}

function Timeline({ legs }: { legs: Leg[] }) {
  const first = legs[0]!;
  return (
    <div class="bn-tl">
      <Station c={first.from} color={modeColor(first.mode)} mode={first.mode} walk={first.mode === 'fuss'} />
      {legs.map((l, i) => {
        const next = legs[i + 1];
        const color = modeColor(l.mode);
        const ride = l.mode !== 'fuss';
        return (
          <div key={i}>
            {ride ? <RideRow leg={l} color={color} /> : <WalkRow leg={l} />}
            {next && ride && next.mode !== 'fuss' && (
              <Transfer arrival={l.to} departure={next.from} />
            )}
            <Station c={l.to} color={next ? modeColor(next.mode) : color} mode={l.mode} walk={!ride} />
          </div>
        );
      })}
    </div>
  );
}

function Transfer({ arrival, departure }: { arrival: Call; departure: Call }) {
  const wait = Math.max(0, Math.round((departure.time.actual - arrival.time.actual) / 60000));
  const change = arrival.platform && departure.platform && arrival.platform !== departure.platform;
  return (
    <div class="bn-xfer">
      <Icon name="recent" size={14} />
      <span><b class={wait < 4 ? 'bn-warn' : 'bn-ok'}>Umstieg {wait} min</b>{change ? ` · Gl. ${arrival.platform} → ${departure.platform}` : ''}</span>
    </div>
  );
}

/** Ein Halt der Zeitleiste: Fahrplanzeit (mit Echtzeit darunter, wenn verspätet), Name und Gleisschild. */
function Station({ c, color, mode, walk }: { c: Call; color: string; mode: Leg['mode']; walk: boolean }) {
  const state = delayState(c.time);
  return (
    <div class="bn-st" style={{ '--c': color }}>
      <div class="bn-tm">{clock(c.time.planned)}{state === 'late' && <small class="bn-late">{clock(c.time.actual)}</small>}</div>
      <div class="bn-nm">{c.name}</div>
      {!walk && c.platform && <div class="bn-row2"><PlatformSign platform={c.platform} changed={c.platformChanged} mode={mode} /></div>}
    </div>
  );
}

function RideRow({ leg, color }: { leg: Leg; color: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div class="bn-leg" style={{ '--c': color }}>
      <div class="bn-lh">
        <LineBadge mode={leg.mode} line={leg.line} />
        <span class="bn-small">{duration(leg.to.time.actual - leg.from.time.actual)}</span>
        {leg.cancelled && <span class="bn-late bn-small">Fällt aus</span>}
      </div>
      {(leg.headsign || leg.agency) && <div class="bn-small">{leg.headsign && `Richtung ${leg.headsign}`}{leg.headsign && leg.agency ? ' · ' : ''}{leg.agency}</div>}
      {leg.bookingRequired && <div class="bn-small bn-warn">Anmeldung erforderlich (Rufbus)</div>}
      {leg.via.length > 0 && (
        <div class="bn-via">
          <button type="button" class="bn-vh" aria-expanded={open} onClick={() => setOpen(!open)}>{leg.via.length} Zwischenhalt{leg.via.length > 1 ? 'e' : ''}<Icon name="chevron" size={14} class={open ? 'bn-flip' : ''} /></button>
          {open && leg.via.map((v, i) => (
            <div class="bn-v" key={i}><span>{v.name}</span><em class={delayState(v.time) === 'late' ? 'bn-late' : ''}>{clock(v.time.actual)}</em></div>
          ))}
        </div>
      )}
    </div>
  );
}

function WalkRow({ leg }: { leg: Leg }) {
  return (
    <div class="bn-leg bn-walk">
      <div class="bn-lh"><LineBadge mode="fuss" line="" /><span class="bn-small">{duration(leg.to.time.actual - leg.from.time.actual)}{leg.walkM ? ` · ${leg.walkM} m` : ''}</span></div>
    </div>
  );
}
