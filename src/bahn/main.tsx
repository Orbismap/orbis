import { render } from 'preact';
import { registerServiceWorker } from '../pwa/register';
import { App } from './app/App';
import 'maplibre-gl/dist/maplibre-gl.css';
import './styles/tokens.css';
import './styles/base.css';

render(<App />, document.getElementById('app')!);

registerServiceWorker('bahn');
