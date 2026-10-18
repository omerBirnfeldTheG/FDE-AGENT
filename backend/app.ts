import express from 'express';
import type { AirportRepository } from './data/airport-repository.ts';
import { loadAirportRepository } from './data/airport-repository.ts';
import { createWeatherLookup } from './data/aviation-weather.ts';
import type { WeatherLookup } from './data/aviation-weather.ts';
import type { ChatAgent } from './agent/chat.ts';
import { getAirportGrowth } from './services/airport-growth.ts';
import { getAirportRankings } from './services/airport-rankings.ts';
import { getInvestmentAssessment } from './services/investment-assessment.ts';
import { getInvestmentEvidence } from './data/investment-evidence.ts';
import { configureAgent } from './http/provider.ts';
import { createChatHandler } from './http/chat-route.ts';
import { handleError, handleUnknownRoute } from './http/errors.ts';

function registerDataRoutes(app: express.Express, repository: AirportRepository) {
  app.get('/api/airports/rankings', (_req, res) => res.json(getAirportRankings(repository)));
  app.get('/api/airports/:iata/growth', (req, res) => res.json(getAirportGrowth(repository, req.params.iata)));
  app.get('/api/airports/:iata/investment-evidence', (req, res) => res.json(getInvestmentEvidence(req.params.iata)));
  app.get('/api/airports/:iata/investment-assessment', (req, res) => res.json(getInvestmentAssessment(repository, req.params.iata)));
}

function registerWeatherRoute(app: express.Express, weather: WeatherLookup) {
  app.get('/api/airports/:iata/weather', async (req, res, next) => {
    try { res.json(await weather(req.params.iata)); }
    catch (error) { next(error); }
  });
}

function registerRoutes(app: express.Express, repository: AirportRepository, weather: WeatherLookup, injected?: ChatAgent) {
  let agent = injected;
  app.post('/api/chat', createChatHandler(() => agent ??= configureAgent(repository, weather)));
  registerDataRoutes(app, repository);
  registerWeatherRoute(app, weather);
  app.use(handleUnknownRoute);
  app.use(handleError);
}

export function createApp(repository = loadAirportRepository(), injectedAgent?: ChatAgent, weather = createWeatherLookup()) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '32kb' }));
  registerRoutes(app, repository, weather, injectedAgent);
  return app;
}
