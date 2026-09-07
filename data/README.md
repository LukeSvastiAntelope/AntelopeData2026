# Political Data Sources

Place CSV files in this directory for import via `npx tsx scripts/import-political-data.ts --csv`.

## Download URLs

### Cook PVI by Congressional District
- Source: Wikipedia / Cook Political Report
- Format: `cook_pvi.csv` with columns: `state,district,pvi`
- Example row: `CA,12,D+15`
- URL: https://en.wikipedia.org/wiki/Cook_Partisan_Voting_Index

### County-Level Election Results
- Source: MIT Election Data + Science Lab
- Format: `county_results.csv` with columns: `state,county_fips,county_name,margin_2024,margin_2020,votes_2024`
- URL: https://electionlab.mit.edu/data

### FEC Individual Contributions
- Source: Federal Election Commission bulk data
- Format: `fec_by_district.csv` with columns: `district_code,dem_total,rep_total,other_total`
- URL: https://www.fec.gov/data/browse-data/?tab=bulk-data
- Note: Raw data is ~2GB; pre-aggregate by district before placing here

### Congressional District Boundaries (GeoJSON)
- Source: US Census Bureau TIGER/Line
- URL: https://www.census.gov/cgi-bin/geo/shapefiles/index.php?year=2024&layergroup=Congressional+Districts+(119th)
- Alternative: https://github.com/unitedstates/districts
- Place as `public/data/cd-119.geojson` or upload to Mapbox Studio as a tileset

## Note

The `data/` directory is gitignored. State-level baseline data is embedded in the import script and does not require CSV files.
