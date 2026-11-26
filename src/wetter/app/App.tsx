import { useEffect, useRef, useState } from 'preact/hooks';
import { lastKnown } from '@/core/lastKnown';
import { online } from '@/core/online';
import { OrbisHud } from '../../ui/hud/OrbisHud';
import { Dashboard } from '../dashboard/Dashboard';
import { loadWarning } from '../data/openMeteo';
import { loadWeather, savedWeather, type WeatherResult } from '../data/weather';
import { saveWarning } from '../data/saved';
import { WeatherProvider } from '../features/forecast/context';
import { Hero } from '../features/forecast/Hero';
import { sample } from '../features/forecast/sample';
import { DEFAULT_PLACE, type Place } from '../data/geocoding';
import { isMobileViewport } from '../dashboard/viewport';
import { PlaceList } from '../features/search/PlaceList';
import './app.css';
const INITIAL: WeatherResult = {
  weather: sample,
  source: { label: 'Beispieldaten', detail: 'lädt …' },
};

const lastPlace = lastKnown<Place>('wetter:place', 1);
const locationOf = (city: Place) => ({ name: city.name, eyebrow: city.region || city.country, lat: city.lat, lng: city.lng });
/** Offline the app opens with the place looked at last: its forecast is the one most surely saved. */
const startPlace = (): Place => (online.peek() ? DEFAULT_PLACE : lastPlace.get('last')?.data ?? DEFAULT_PLACE);

export function App() {
  const [city, setCity] = useState<Place>(startPlace);
  const [data, setData] = useState<WeatherResult>(() => savedWeather(locationOf(city)) ?? INITIAL);
  const net = online.value;
  const [listOpen, setListOpen] = useState(false);
  const searchInput = useRef<HTMLInputElement>(null);
  const [focusSearch, setFocusSearch] = useState(false);

  // On phones the menu covers the screen – close it once a place was picked so the forecast is visible.
  const selectCity = (place: Place) => {
    setCity(place);
    lastPlace.put('last', place);
    if (isMobileViewport()) setListOpen(false);
  };

  // ⌘F / Strg+F opens the side menu and focuses its search field instead of the browser find.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        setListOpen(true);
        setFocusSearch(true);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  // Focus only once the panel is open – while closed it is inert and cannot take focus.
  useEffect(() => {
    if (listOpen && focusSearch) {
      searchInput.current?.focus();
      searchInput.current?.select();
      setFocusSearch(false);
    }
  }, [listOpen, focusSearch]);

  // ⌘B / Strg+B toggles the left sidebar – like the buttons in the HUD.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'b') {
        event.preventDefault();
        setListOpen((open) => !open);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const location = locationOf(city);
    // the saved forecast at once, the fresh one replaces it
    const saved = savedWeather(location);
    if (saved) setData(saved);
    loadWeather(location, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setData(result);
        // DWD needs several seconds – don't hold up the rest of the forecast for it.
        loadWarning(location.lat, location.lng, { signal: controller.signal })
          .then((warning) => {
            if (controller.signal.aborted) return;
            saveWarning(location.lat, location.lng, warning);
            setData((current) => ({
              ...current,
              weather: { ...current.weather, current: { ...current.weather.current, warning } },
            }));
          })
          .catch(() => { /* no warning is a valid result */ });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setData({
          weather: { ...sample, place: location },
          source: { label: 'Beispieldaten', detail: error instanceof Error ? error.message : 'Fehler' },
        });
      });
    return () => controller.abort();
  }, [city, net]);

  return (
    <WeatherProvider value={data.weather}>
      <div class="wx-app">
        <OrbisHud project="wetter" fixed open={listOpen} onOpenChange={setListOpen}>
          <PlaceList onSelect={selectCity} inputRef={searchInput} />
        </OrbisHud>
        <Hero place={data.weather.place} current={data.weather.current} source={data.source} />
        <Dashboard />
      </div>
    </WeatherProvider>
  );
}
