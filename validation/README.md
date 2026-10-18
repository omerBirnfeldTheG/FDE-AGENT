# FAA enplanement validation only

Run with Node.js 24 (native TypeScript support; no dependencies):

```sh
node validation/validate-enplanements.ts
```

The script parses selected FAA PDF text extracts, validates positive integer counts, reconciles published percentages to their two-decimal precision, checks the overlapping 2024 counts across both publications, and writes `results.json` with unrounded growth percentages and source URLs.

## Provenance and acquisition limitation

The official FAA index pages were checked on 2026-10-10:

- https://www.faa.gov/airports/planning_capacity/passenger_allcargo_stats/passenger
- https://www.faa.gov/airports/planning_capacity/passenger_allcargo_stats/passenger/previous_years

The browser retrieved and parsed the two official PDFs identified in `faa-extracts.json`. The excerpts contain only the three requested rows, with PDF line wrapping flattened. They are not full downloaded documents or an automated ingestion pipeline. Local `curl` download failed with `Could not resolve host: www.faa.gov`; no original PDF/XLSX bytes are present. Original file download and workbook parsing remain unvalidated.

2024 workbook URL:
https://www.faa.gov/sites/faa.gov/files/2026-09/arp-cy2024-commercial-service-enplanements.xlsx

2025 workbook URL:
https://www.faa.gov/airports/planning_capacity/passenger_allcargo_stats/passenger/arp-cy2025-commercial-service-enplanements.xlsx

## Findings and limitations

- Counts are reported calendar-year enplanements (passenger boardings), not total arriving/departing passengers or unique travelers. No estimates or imputation were used.
- The 2025 document explicitly says Final; the 2024 archived publication is dated September 15, 2025 and does not explicitly say Final in its title.
- All three 2024 counts agree exactly between the 2024 report and the prior-year column of the 2025 report.
- Recomputed growth agrees with the FAA percentages after rounding to two decimals.
- The 2025 commercial-service PDF link opens a 51-page all-airports-by-state report. The 2024 report is an 11-page commercial-service ranking. Column years and identifiers were checked rather than inferred from filenames.
- The 2024 file lives under a 2026-09 URL path, but the document itself is dated 2025-09-15. Path dates are not reporting years.
- Text extracts are narrowly validated for these three primary, large-hub airports; this parser is not suitable for nationwide ingestion.
- Annual traffic does not measure terminal capacity, peak-hour pressure, or investment returns. Causes of growth/decline are unavailable in these reports.

No frontend, backend, scoring engine, or AI agent was built.
