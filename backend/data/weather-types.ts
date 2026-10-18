export type WeatherResult = {
  iata: string; icao: string; metric: 'current_aviation_weather';
  availability: 'available' | 'unavailable';
  observation: null | {
    observedAt: string; rawMetar: string; windSpeedKnots: number | null;
    windGustKnots: number | null; visibilityStatuteMiles: string | number | null;
    flightCategory: string | null; evidenceType: 'reported'; categoryEvidenceType: 'provider-derived';
  };
  freshness: 'live-api' | 'cached' | 'stale-cache' | 'unavailable';
  observationStale: boolean | null;
  source: { name: string; url: string; documentationUrl: string; retrievedAt: string | null };
  unavailableReason: string | null; limitations: string[];
};
export type WeatherLookup = (iata: string) => Promise<WeatherResult>;
