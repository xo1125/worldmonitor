// Entry point for /watch — the Robinhood Chain watchlist page.
// Same App as the macro dashboard; App reads the pathname to pick the tab, so
// this differs only in which HTML shell (and which meta tags) served it.
import './styles/main.css';
import { inject } from '@vercel/analytics';
import { App } from './App';

inject();

const app = new App('app');
app.init().catch(console.error);
