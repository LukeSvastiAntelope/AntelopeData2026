/**
 * Format dataset "raw grain" for LLM prompts — head + dtype/column stats.
 * Bounded so we don't dump entire frames into the model context.
 */

export type DatasetGrainInput = {
  columns: string[];
  types: Record<string, string>;
  sample_data?: any[];
  sampleData?: any[];
  /** True row count when sample is a head of a larger frame */
  row_count?: number;
  codebook_mappings?: any;
  codebookMappings?: any;
};

const HEAD_ROWS = 15;
const MAX_COLS_DETAIL = 60;

/** Convert array-rows or object-rows into column-keyed objects for the model. */
export function normalizeRowsToObjects(
  columns: string[],
  rows: any[]
): Record<string, unknown>[] {
  if (!rows?.length) return [];
  return rows.map((r) => {
    if (r && !Array.isArray(r) && typeof r === 'object') {
      return r as Record<string, unknown>;
    }
    if (Array.isArray(r)) {
      const obj: Record<string, unknown> = {};
      columns.forEach((c, i) => {
        obj[c] = r[i];
      });
      return obj;
    }
    return {};
  });
}

function rowsOf(info: DatasetGrainInput): Record<string, unknown>[] {
  const raw = info.sample_data || info.sampleData || [];
  return normalizeRowsToObjects(info.columns || [], raw);
}

function columnStats(info: DatasetGrainInput): Array<Record<string, unknown>> {
  const rows = rowsOf(info);
  const cols = (info.columns || []).slice(0, MAX_COLS_DETAIL);
  return cols.map((col) => {
    const values = rows.map((r) => r?.[col]);
    const nonNull = values.filter((v) => v != null && v !== '');
    const nullCount = values.length - nonNull.length;
    const unique = new Set(nonNull.map((v) => String(v))).size;
    const dtype = info.types?.[col] || 'unknown';
    const base: Record<string, unknown> = {
      column: col,
      dtype,
      non_null: nonNull.length,
      nulls: nullCount,
      unique_in_head: unique,
    };
    const nums = nonNull
      .map((v) => (typeof v === 'number' ? v : Number(v)))
      .filter((n) => Number.isFinite(n));
    if (nums.length >= Math.max(3, Math.floor(nonNull.length * 0.5))) {
      base.min = Math.min(...nums);
      base.max = Math.max(...nums);
      base.mean = Number(
        (nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(4)
      );
    } else {
      base.sample_values = [...new Set(nonNull.map((v) => String(v)))].slice(0, 8);
    }
    return base;
  });
}

/** Compact markdown/text block: shape, dtypes, head, column stats. */
export function formatDatasetGrainForPrompt(info: DatasetGrainInput): string {
  const rows = rowsOf(info);
  const head = rows.slice(0, HEAD_ROWS);
  const rowCount = info.row_count ?? rows.length;
  const cols = info.columns || [];
  const types = info.types || {};
  const stats = columnStats(info);

  const typeLine = cols
    .slice(0, MAX_COLS_DETAIL)
    .map((c) => `${c}: ${types[c] || 'unknown'}`)
    .join(', ');

  const headJson = JSON.stringify(head, null, 2);
  const statsJson = JSON.stringify(stats, null, 2);

  const codebook = info.codebook_mappings || info.codebookMappings;

  return [
    `### Dataset grain (plan against THIS, not a vague summary)`,
    `- Shape: ${rowCount} rows × ${cols.length} columns (showing head of ${head.length} rows + stats on head)`,
    `- Dtypes: ${typeLine || '(none)'}`,
    '',
    `#### Column stats (from head)`,
    statsJson,
    '',
    `#### Dataframe head (${head.length} rows)`,
    '```json',
    headJson.length > 24000 ? headJson.slice(0, 24000) + '\n…(truncated)' : headJson,
    '```',
    codebook
      ? `\n#### Codebook\n${JSON.stringify(codebook, null, 2).slice(0, 12000)}`
      : '',
    '',
    'You may request more grain in a step (e.g. print df.describe(), value_counts, crosstabs) — the full frame is loaded as `df` in Pyodide.',
  ]
    .filter(Boolean)
    .join('\n');
}
