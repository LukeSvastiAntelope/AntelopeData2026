/**
 * Multi-dataset tray types + Pyodide named-frame helpers (Analytics C3).
 */

import type { Dataset } from '../hooks/useAnalysisContext';

export type DatasetSourceKind = 'upload' | 'survey' | 'voter' | 'prior_survey';

/** Catalog entry — available but not necessarily loaded into Pyodide. */
export type DatasetSourceCatalogItem = {
  id: string;
  kind: DatasetSourceKind;
  label: string;
  subtitle?: string;
  rowEstimate?: number;
  surveyId?: number;
  listId?: number;
  /** Local upload already parsed into a Dataset (not from server catalog). */
  localDataset?: Dataset;
};

/** A source currently feeding the analysis (drop zone). */
export type AnalysisFrame = {
  id: string;
  kind: DatasetSourceKind;
  label: string;
  /** Python variable name: df_survey, df_voter, df_prior_12, df_upload, … */
  frameName: string;
  dataset: Dataset;
  surveyId?: number;
  listId?: number;
  /** Primary frame is also aliased as `df` for backward compatibility. */
  isPrimary: boolean;
};

/** Suggest a stable Pyodide variable name for a source kind. */
export function suggestFrameName(
  kind: DatasetSourceKind,
  opts?: { surveyId?: number; listId?: number; existingNames?: string[] }
): string {
  const taken = new Set(opts?.existingNames || []);
  const base = (() => {
    switch (kind) {
      case 'survey':
        return 'df_survey';
      case 'voter':
        return opts?.listId != null ? `df_voter_${opts.listId}` : 'df_voter';
      case 'prior_survey':
        return opts?.surveyId != null ? `df_prior_${opts.surveyId}` : 'df_prior';
      case 'upload':
      default:
        return 'df_upload';
    }
  })();

  if (!taken.has(base)) return base;
  let i = 2;
  while (taken.has(`${base}_${i}`)) i += 1;
  return `${base}_${i}`;
}

/** Convert Dataset array-of-arrays into JSON payload for Pyodide. */
export function datasetToJsonPayload(dataset: Dataset): string {
  return JSON.stringify({
    columns: dataset.columns,
    data: dataset.data,
  });
}

/**
 * Load every analysis frame into Pyodide as named DataFrames.
 * Primary frame is also assigned to `df` for existing single-frame code paths.
 * Replaces any previously loaded analysis frames (sets a marker flag).
 */
export function loadNamedFramesIntoPyodide(
  pyodide: any,
  frames: AnalysisFrame[]
): { loaded: string[]; primary: string | null } {
  if (!pyodide || !frames.length) {
    return { loaded: [], primary: null };
  }

  const primary = frames.find((f) => f.isPrimary) || frames[0];
  const loaded: string[] = [];

  // Clear previous named frames we may have created
  pyodide.runPython(`
import pandas as pd
_prev = globals().get("__antelope_frame_names__", [])
for _n in list(_prev):
    if _n in globals():
        del globals()[_n]
globals()["__antelope_frame_names__"] = []
`);

  for (const frame of frames) {
    const payload = datasetToJsonPayload(frame.dataset);
    const safeName = frame.frameName.replace(/[^a-zA-Z0-9_]/g, '_');
    pyodide.globals.set('__antelope_data_json__', payload);
    pyodide.globals.set('__antelope_frame_name__', safeName);
    pyodide.runPython(`
import json
import pandas as pd

data_dict = json.loads(__antelope_data_json__)
_name = str(__antelope_frame_name__)
_cols = list(data_dict.get("columns") or [])
_rows = list(data_dict.get("data") or [])
if _rows:
    max_cols = max(len(r) for r in _rows)
    while len(_cols) < max_cols:
        _cols.append(f"extra_col_{len(_cols)}")
_df = pd.DataFrame(_rows, columns=_cols)
for _c in _df.columns:
    try:
        _df[_c] = pd.to_numeric(_df[_c])
    except Exception:
        pass
globals()[_name] = _df
_names = globals().get("__antelope_frame_names__", [])
if _name not in _names:
    _names.append(_name)
globals()["__antelope_frame_names__"] = _names
print(f"Loaded {_name}: {_df.shape[0]} rows × {_df.shape[1]} cols")
`);
    loaded.push(safeName);
  }

  // Alias primary as df
  const primaryName = (primary.frameName || 'df').replace(/[^a-zA-Z0-9_]/g, '_');
  pyodide.globals.set('__antelope_primary_name__', primaryName);
  pyodide.runPython(`
_primary = str(__antelope_primary_name__)
if _primary in globals():
    df = globals()[_primary]
    print(f"Primary df alias → {_primary} ({df.shape[0]} × {df.shape[1]})")
`);

  return { loaded, primary: primaryName };
}

/** Compact description of loaded frames for plan-steps / code prompts. */
export function formatLoadedFramesForPrompt(
  frames: AnalysisFrame[],
  headRows = 8
): string {
  if (!frames.length) return '';
  const blocks = frames.map((f) => {
    const cols = f.dataset.columns || [];
    const types = f.dataset.dtypes || {};
    const dtypeLine = cols
      .slice(0, 40)
      .map((c) => `${c}: ${types[c] || 'unknown'}`)
      .join(', ');
    const sample =
      f.dataset.sampleData?.slice(0, headRows) ||
      (f.dataset.data || []).slice(0, headRows).map((row: any) => {
        if (row && !Array.isArray(row) && typeof row === 'object') return row;
        const obj: Record<string, unknown> = {};
        cols.forEach((c, i) => {
          obj[c] = Array.isArray(row) ? row[i] : undefined;
        });
        return obj;
      });
    const primaryTag = f.isPrimary ? ' [PRIMARY → also available as df]' : '';
    return [
      `### Frame \`${f.frameName}\`${primaryTag}`,
      `- Label: ${f.label}`,
      `- Kind: ${f.kind}`,
      `- Shape: ${f.dataset.shape?.[0] ?? f.dataset.data?.length ?? 0} rows × ${cols.length} columns`,
      `- Dtypes: ${dtypeLine || '(none)'}`,
      `- Head:`,
      '```json',
      JSON.stringify(sample, null, 2).slice(0, 8000),
      '```',
    ].join('\n');
  });

  return [
    '## Loaded Pyodide dataframes (multi-dataset)',
    'Join/compare across these named frames. Primary is also aliased as `df`.',
    ...blocks,
  ].join('\n\n');
}
