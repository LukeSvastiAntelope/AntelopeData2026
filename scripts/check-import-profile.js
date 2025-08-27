// Run a quick preflight profile on a CSV: columns, numeric-only share, refusal codes, weight/country candidates, and a few column stats.
// Usage: node scripts/check-import-profile.js "/absolute/path/to/file.csv"

const fs = require('fs');
const Papa = require('papaparse');

function parseCsvSample(filePath, maxRows = 1000, maxBytes = 8 * 1024 * 1024) {
  const stat = fs.statSync(filePath);
  const bytesToRead = Math.min(maxBytes, stat.size);
  const fd = fs.openSync(filePath, 'r');
  const buffer = Buffer.alloc(bytesToRead);
  fs.readSync(fd, buffer, 0, bytesToRead, 0);
  fs.closeSync(fd);
  const csvString = buffer.toString('utf8');
  const result = Papa.parse(csvString, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h, i) => (h && String(h).trim()) || `Column_${i}`,
  });
  if (result.errors && result.errors.length) {
    console.warn('CSV parse warnings:', result.errors.map((e) => e.message).join('; '));
  }
  const data = Array.isArray(result.data) ? result.data.filter(Boolean) : [];
  return data.slice(0, maxRows);
}

function computeQuickStats(rawData) {
  if (!rawData.length) return null;
  const headers = Object.keys(rawData[0]);
  const duplicateHeaders = headers.filter((h, i, arr) => arr.indexOf(h) !== i);
  const stats = {};
  headers.forEach((h) => {
    stats[h] = {
      missing: 0,
      present: 0,
      topMap: new Map(),
      numericCount: 0,
      numericMin: null,
      numericMax: null,
      refusalCount: 0,
    };
  });
  for (const row of rawData) {
    for (const h of headers) {
      const v0 = row[h];
      const v = v0 === undefined || v0 === null ? '' : String(v0);
      const st = stats[h];
      if (v.trim() === '') {
        st.missing++;
        continue;
      }
      st.present++;
      st.topMap.set(v, (st.topMap.get(v) || 0) + 1);
      const n = Number(v);
      if (!isNaN(n)) {
        st.numericCount++;
        st.numericMin = st.numericMin === null ? n : Math.min(st.numericMin, n);
        st.numericMax = st.numericMax === null ? n : Math.max(st.numericMax, n);
        if (n >= 97 && n <= 99) st.refusalCount++;
      }
    }
  }
  let numericOnlyColumns = 0;
  let refusalCodesDetected = false;
  headers.forEach((h) => {
    const st = stats[h];
    if (st.present > 0 && st.numericCount / st.present > 0.9) numericOnlyColumns++;
    if (st.refusalCount > 0) refusalCodesDetected = true;
  });
  const weightCandidates = headers.filter((h) => /(^|[_\-\s])(wgt|weight)($|[_\-\s\d])/i.test(h));
  const countryCandidates = headers.filter((h) => /country|country_code|iso2|iso3/i.test(h));
  return { headers, duplicateHeaders: Array.from(new Set(duplicateHeaders)), stats, numericOnlyColumns, refusalCodesDetected, weightCandidates, countryCandidates };
}

function summarizeTop(map, k = 5) {
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, k)
    .map(([v, c]) => `${v} (${c})`)
    .join(', ');
}

async function main() {
  const csvPath = process.argv[2];
  if (!csvPath) {
    console.error('Usage: node scripts/check-import-profile.js "/absolute/path/to/file.csv"');
    process.exit(1);
  }
  if (!fs.existsSync(csvPath)) {
    console.error(`File not found: ${csvPath}`);
    process.exit(1);
  }
  console.log(`Preflight profile for: ${csvPath}`);
  const sample = parseCsvSample(csvPath);
  console.log(`Sample rows parsed: ${sample.length}`);
  const q = computeQuickStats(sample);
  if (!q) {
    console.log('No data.');
    return;
  }
  console.log('\nProfile:');
  console.log(`- Columns: ${q.headers.length}`);
  console.log(`- Numeric-only columns: ${q.numericOnlyColumns} (${Math.round((q.numericOnlyColumns / q.headers.length) * 100)}%)`);
  console.log(`- Refusal codes detected (97–99): ${q.refusalCodesDetected ? 'Yes' : 'No'}`);
  console.log(`- Duplicate headers: ${q.duplicateHeaders.length}`);
  console.log(`- Weight candidates: ${q.weightCandidates.slice(0, 5).join(', ') || '—'}`);
  console.log(`- Country candidates: ${q.countryCandidates.slice(0, 5).join(', ') || '—'}`);

  // Show a few column summaries
  const showCols = [...new Set([...(q.weightCandidates.slice(0, 1)), ...(q.countryCandidates.slice(0, 1))])];
  for (const h of showCols) {
    const st = q.stats[h];
    if (!st) continue;
    const missingRate = ((st.missing / (st.missing + st.present || 1)) * 100).toFixed(0);
    const range = st.numericMin !== null && st.numericMax !== null ? `${st.numericMin}–${st.numericMax}` : '—';
    console.log(`\nColumn: ${h}`);
    console.log(`  - missing: ${missingRate}%`);
    console.log(`  - unique≈${st.topMap.size}`);
    console.log(`  - range: ${range}`);
    if (st.refusalCount > 0) console.log(`  - refusal(97–99): ${st.refusalCount}`);
    const top = summarizeTop(st.topMap, 5);
    if (top) console.log(`  - top: ${top}`);
  }
}

main().catch((e) => {
  console.error('Error:', e);
  process.exit(1);
});


