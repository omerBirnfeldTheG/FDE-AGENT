import { validateAirportCode } from '../services/airport-growth.ts';
import { DataError } from '../services/airport-growth.ts';

type Area = 'terminalCapacity' | 'congestion' | 'projectCosts' | 'financialPerformance';
interface Source { title: string; url: string; reportingPeriod: string; locator: string; verifiedOn: string }
interface Fact { area: Area; metric: string; value: number | string; unit: string; evidenceType: 'reported'; scope: string; temporalBasis: 'historical' | 'planned' | 'undated-provider-description'; source: Source; limitations: string[] }
const source = (title: string, url: string, reportingPeriod: string, locator: string): Source => ({ title, url, reportingPeriod, locator, verifiedOn: '2026-10-13' });
const lax = source('LAX FY2025 Annual Continuing Disclosure Report', 'https://www.lawa.org/sites/lawa/files/2025-12/LAX%20-%202025%20Annual%20Continuing%20Disclosure%20Report.pdf', 'FY2025 ended June 30, 2025; subsequent events through September 2025', 'PDF page 135 / printed page 90');
const sfo = source('Terminal 3 West modernization announcement', 'https://www.flysfo.com/it/node/15497', 'Announcement dated August 20, 2024', 'Project announcement paragraphs');
const runway = source('SFO runway constraints', 'https://www.flysfo.com/about/airport-operations/policies-regulations/runway-constraints', 'Undated operational description; retrieved October 13, 2026', 'Runway Constraints section');
const bos = source('Massport approves partial budgets for Terminals C and E', 'https://www.massport.com/massport-approves-partial-budgets-projects-terminals-c-and-e', 'November 15, 2018', 'Terminal E modernization paragraphs');
const fact = (area: Area, metric: string, value: number | string, unit: string, scope: string, temporalBasis: Fact['temporalBasis'], source: Source, limitations: string[]): Fact => ({ area, metric, value, unit, evidenceType: 'reported', scope, temporalBasis, source, limitations });
const records: Record<string, Fact[]> = {
  LAX: [
    fact('terminalCapacity', 'gate_inventory', 168, 'gates', 'Airport lease gate table including remote and commuter gates', 'historical', lax, ['Gate inventory is not passenger throughput, utilization, or spare capacity.']),
    fact('projectCosts', 'estimated_project_cost', 1700000000, 'USD nominal', 'Terminal 5 renovation and reconstruction', 'planned', { ...lax, locator: 'PDF page 42 / introductory letter Terminal 5 section' }, ['Approximate FY2025 report estimate; not actual expenditure or a net-new expansion budget.']),
    fact('projectCosts', 'approved_appropriation', 1400000000, 'USD nominal', 'Terminal 5 renovation and reconstruction', 'historical', { ...lax, locator: 'PDF page 180 / printed page 134, subsequent events September 18, 2025' }, ['Appropriation is distinct from total project cost; do not add the two amounts.']),
    fact('congestion', 'documented_airfield_bottleneck', 'Taxiway B departure queue conflicts with cargo ramp access', 'qualitative', 'Taxiway C easterly extension rationale', 'historical', { ...lax, locator: 'PDF page 179 / printed page 133, subsequent events July 17, 2025' }, ['Airfield bottleneck, not terminal crowding or a quantified airport delay rate.']),
    fact('financialPerformance', 'operating_revenue_rounded', 2000000000, 'USD nominal', 'Entire LAX airport, FY2025', 'historical', { ...lax, locator: 'PDF page 66 / management discussion operating revenues' }, ['Rounded reported airport revenue; not net income, free cash flow, or incremental project return.'])
  ],
  SFO: [
    fact('terminalCapacity', 'planned_additional_floor_area', 200000, 'square feet', 'Terminal 3 West modernization', 'planned', sfo, ['Additional space is not a published annual passenger capacity or verified completed capacity.']),
    fact('projectCosts', 'announced_project_budget', 2600000000, 'USD nominal', 'Terminal 3 West modernization', 'planned', sfo, ['August 2024 announcement; page warns content may be outdated. Later budget revisions not reconciled.']),
    fact('congestion', 'fair_weather_arrival_rate', 45, 'arrivals/hour', 'Runways, approximate provider description', 'undated-provider-description', runway, ['Not measured terminal congestion or a live operational rate.']),
    fact('congestion', 'low_visibility_arrival_rate', 36, 'arrivals/hour', 'Runways, approximate provider description', 'undated-provider-description', runway, ['Weather-sensitive runway constraint; terminal investment does not necessarily relieve it.'])
  ],
  BOS: [
    fact('terminalCapacity', 'completed_additional_gates', 4, 'gates', 'Terminal E modernization phase 1, completed October 2023', 'historical', source('MEPA certificate and responses to comments', 'https://www.massport.com/sites/default/files/2025-10/A_MEPA-Certificates-Responses-Comments.pdf', 'Certificate dated October 18, 2024; hosted in 2025', 'MEPA Certificate and Responses to Comments, printed A-22, Terminal E paragraph'), ['Verified through indexed public PDF text; direct retrieval is blocked by the publisher anti-bot page.', 'Completed gate addition, not total airport inventory or annual passenger capacity.']),
    fact('terminalCapacity', 'historically_planned_additional_gates', 7, 'gates', 'Terminal E two-phase plan announced in 2018', 'planned', bos, ['Historical plan, not current inventory or confirmed completed gates; later scope changes not reconciled.']),
    fact('projectCosts', 'approved_partial_budget', 100000000, 'USD nominal', 'Terminal E modernization, November 2018 approval', 'historical', bos, ['Partial early budget, not total or final project cost; unsuitable for comparing total project costs.'])
  ]
};

export function getInvestmentEvidence(code: string) {
  const iata = validateAirportCode(code);
  if (!records[iata]) throw new DataError(404, 'AIRPORT_DATA_NOT_FOUND', `No investment evidence is available for ${iata}.`);
  return investmentResponse(iata, structuredClone(records[iata]));
}

const evidenceLimitations = {
    financialReturns: { availability: 'unavailable', npv: null, irrPercent: null, paybackYears: null, reason: 'No verified project-specific incremental cash-flow forecast has been imported. Airport revenue and project budgets cannot establish project returns.' },
    limitations: ['Coverage is limited to LAX, SFO and BOS. This is a manually curated historical evidence snapshot, not live document retrieval.', 'Documents were inspected through public web extracts; original documents have not been archived or checksummed by this investment importer.', 'Scope and reporting dates differ. These records are not normalized or used in the Demand Growth Score.', 'Annual terminal passenger capacity, gate utilization, unmet demand and comparable delay rates have not yet been validated.', 'Financial scenarios require explicit assumptions for incremental revenue, operating costs, construction timing and discount rate. No financial assumptions or return estimates are supplied here.']
};
function evidenceCoverage(facts: Fact[]) {
  const areas: Area[] = ['terminalCapacity', 'congestion', 'projectCosts', 'financialPerformance'];
  return areas.map(area => ({ area, availability: facts.some(f => f.area === area) ? 'partial' : 'unavailable', factCount: facts.filter(f => f.area === area).length }));
}

function investmentResponse(iata: string, facts: Fact[]) {
  return { iata, datasetMode: 'curated-public-document-extracts', facts, coverage: evidenceCoverage(facts), ...evidenceLimitations };
}
