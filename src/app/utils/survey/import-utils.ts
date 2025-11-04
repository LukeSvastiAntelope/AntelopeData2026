import Fuse from 'fuse.js';

export type ColumnType = 'text' | 'single-choice' | 'multiple-choice' | 'rating' | 'email' | 'number';

export interface ColumnSummary {
  name: string;
  type: ColumnType;
  isDemographic: boolean;
  demographicField?: string;
  sampleValues: string[];
  uniqueValues: string[];
  isRequired: boolean;
}

export interface NormalizeOptions {
  trimStrings?: boolean;
  dropEmptyRows?: boolean;
}

export interface NormalizeResult {
  rows: Record<string, unknown>[];
  headers: string[];
}

export interface ColumnAnalysisResult {
  columns: ColumnSummary[];
  detectedDemographics: string[];
  warnings: string[];
}

const DEMOGRAPHIC_PATTERNS = [
  { field: 'age', patterns: ['age', 'age_range', 'birth_year', 'dob', 'date_of_birth'] },
  { field: 'gender', patterns: ['gender', 'sex'] },
  { field: 'location', patterns: ['city', 'state', 'country', 'zip', 'postal_code', 'location', 'region'] },
  { field: 'education', patterns: ['education', 'education_level', 'degree', 'highest_degree'] },
  { field: 'income', patterns: ['income', 'salary', 'income_range', 'household_income'] },
  { field: 'employment', patterns: ['job_title', 'industry', 'company', 'employment_status', 'occupation'] },
  { field: 'email', patterns: ['email', 'email_address'] }
];

const LIKERT_SCALES = [
  ['strongly disagree', 'disagree', 'neutral', 'agree', 'strongly agree'],
  ['very dissatisfied', 'dissatisfied', 'neutral', 'satisfied', 'very satisfied'],
  ['very unlikely', 'unlikely', 'neutral', 'likely', 'very likely']
];

const BOOLEAN_VALUE_SETS = [
  new Set(['yes', 'no']),
  new Set(['true', 'false']),
  new Set(['y', 'n']),
  new Set(['1', '0']),
  new Set(['agree', 'disagree']),
  new Set(['male', 'female'])
];

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

const RESERVED_HEADERS = new Set(['__proto__', 'constructor', 'prototype']);

const sanitizeHeader = (raw: string | number | null | undefined, fallbackIndex: number, existing: Set<string>): string => {
  const asString = raw === null || raw === undefined ? '' : String(raw);
  const cleaned = asString
    .replace(/\uFEFF/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const base = cleaned || `Column_${fallbackIndex + 1}`;
  let candidate = RESERVED_HEADERS.has(base) ? `Column_${fallbackIndex + 1}` : base;
  let suffix = 1;
  while (existing.has(candidate)) {
    const nextBase = RESERVED_HEADERS.has(base) ? `Column_${fallbackIndex + 1}` : base;
    candidate = `${nextBase}_${suffix++}`;
  }
  existing.add(candidate);
  return candidate;
};

const hasMeaningfulValue = (value: unknown): boolean => {
  if (value === null || value === undefined) {
    return false;
  }
  if (typeof value === 'string') {
    return value.replace(/\uFEFF/g, '').trim().length > 0;
  }
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  if (typeof value === 'number') {
    return !Number.isNaN(value);
  }
  return true;
};

export const normalizeRecords = (records: any[], options?: NormalizeOptions): NormalizeResult => {
  const { trimStrings = true, dropEmptyRows = true } = options || {};
  const normalizedRows: Record<string, unknown>[] = [];
  const headerCache = new Map<string, string>();
  const finalHeaders = new Set<string>();
  const headerOrder: string[] = [];

  records.forEach((record) => {
    if (record === null || typeof record !== 'object') {
      return;
    }

    const normalizedRow: Record<string, unknown> = {};
    let columnIndex = 0;

    for (const [rawKey, rawValue] of Object.entries(record)) {
      const cacheKey = rawKey ?? `__col_${columnIndex}`;
      let header = headerCache.get(cacheKey);
      if (!header) {
        header = sanitizeHeader(rawKey, headerOrder.length, finalHeaders);
        headerCache.set(cacheKey, header);
        headerOrder.push(header);
      }

      let value: unknown = rawValue;
      if (trimStrings && typeof value === 'string') {
        value = value.replace(/\uFEFF/g, '').trim();
      }

      normalizedRow[header] = value;
      columnIndex += 1;
    }

    if (!dropEmptyRows || Object.values(normalizedRow).some(hasMeaningfulValue)) {
      normalizedRows.push(normalizedRow);
    }
  });

  return {
    rows: normalizedRows,
    headers: headerOrder
  };
};

export const detectDemographicField = (columnName: string): { field: string; confidence: number } | null => {
  const normalizedName = columnName.toLowerCase().replace(/[^a-z0-9]/g, '');
  let bestMatch: { field: string; confidence: number } | null = null;

  for (const demo of DEMOGRAPHIC_PATTERNS) {
    for (const pattern of demo.patterns) {
      const normalizedPattern = pattern.replace(/[^a-z0-9]/g, '');
      if (normalizedName === normalizedPattern) {
        return { field: demo.field, confidence: 1.0 };
      }
    }

    for (const pattern of demo.patterns) {
      const normalizedPattern = pattern.replace(/[^a-z0-9]/g, '');
      if (normalizedName.includes(normalizedPattern) || normalizedPattern.includes(normalizedName)) {
        const confidence = Math.max(
          normalizedPattern.length / Math.max(normalizedName.length, 1),
          normalizedName.length / Math.max(normalizedPattern.length, 1)
        ) * 0.9;

        if (!bestMatch || confidence > bestMatch.confidence) {
          bestMatch = { field: demo.field, confidence };
        }
      }
    }

    const fuse = new Fuse(demo.patterns, {
      threshold: 0.4,
      includeScore: true
    });
    const results = fuse.search(columnName);

    if (results.length > 0 && results[0].score !== undefined) {
      const confidence = 1 - results[0].score;
      if (confidence > 0.6 && (!bestMatch || confidence > bestMatch.confidence)) {
        bestMatch = { field: demo.field, confidence };
      }
    }
  }

  return bestMatch && bestMatch.confidence > 0.5 ? bestMatch : null;
};

const looksLikeEmailColumn = (columnName: string, uniqueValues: string[]): boolean => {
  const normalizedName = columnName.toLowerCase();
  if (normalizedName.includes('email')) {
    const emailCount = uniqueValues.filter((value) => EMAIL_REGEX.test(value.trim())).length;
    return emailCount > uniqueValues.length * 0.6;
  }

  if (uniqueValues.length > 0) {
    const emailCount = uniqueValues.filter((value) => EMAIL_REGEX.test(value.trim())).length;
    return emailCount >= Math.max(3, Math.ceil(uniqueValues.length * 0.8));
  }

  return false;
};

const valuesAreNumeric = (values: string[]): boolean => {
  if (values.length === 0) {
    return false;
  }
  let numericCount = 0;
  values.forEach((value) => {
    const normalized = value.replace(/,/g, '').trim();
    if (normalized === '') {
      return;
    }
    const numberValue = Number(normalized);
    if (!Number.isNaN(numberValue)) {
      numericCount += 1;
    }
  });
  return numericCount >= values.length * 0.8;
};

const looksLikeLikertScale = (values: string[]): boolean => {
  if (values.length === 0) {
    return false;
  }
  const lowerValues = values.map((value) => value.toLowerCase());
  return LIKERT_SCALES.some((scale) => {
    const scaleSet = new Set(scale);
    const matchingValues = lowerValues.filter((value) => scaleSet.has(value));
    return matchingValues.length >= Math.max(3, lowerValues.length * 0.7);
  });
};

const looksLikeBoolean = (values: string[]): boolean => {
  if (values.length === 0 || values.length > 10) {
    return false;
  }
  const normalized = values.map((value) => value.toLowerCase());
  return BOOLEAN_VALUE_SETS.some((set) => normalized.every((value) => set.has(value)));
};

const valuesContainDelimitedLists = (values: string[]): boolean => {
  return values.some((value) => {
    if (value.includes(';') || value.includes('|')) {
      return true;
    }
    if (value.includes(',') && value.split(',').length > 1 && !value.match(/^[^,]+,[^,]+,[^,]+$/)) {
      return true;
    }
    return false;
  });
};

export const detectQuestionType = (columnName: string, uniqueValues: string[]): ColumnType => {
  const filteredValues = uniqueValues
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  if (filteredValues.length === 0) {
    return 'text';
  }

  if (looksLikeEmailColumn(columnName, filteredValues)) {
    return 'email';
  }

  if (looksLikeLikertScale(filteredValues)) {
    return 'rating';
  }

  if (looksLikeBoolean(filteredValues)) {
    return 'single-choice';
  }

  if (valuesAreNumeric(filteredValues)) {
    const numbers = filteredValues
      .map((value) => Number(value.replace(/,/g, '').trim()))
      .filter((value) => !Number.isNaN(value));

    if (numbers.length) {
      const min = Math.min(...numbers);
      const max = Math.max(...numbers);

      if (min >= 0 && max <= 10 && max - min <= 10) {
        return 'rating';
      }

      if (columnName.toLowerCase().includes('age') && min >= 0 && max <= 120) {
        return 'number';
      }
    }

    return 'number';
  }

  if (valuesContainDelimitedLists(filteredValues)) {
    return 'multiple-choice';
  }

  if (filteredValues.length <= 15) {
    const averageLength = filteredValues.reduce((total, value) => total + value.length, 0) / filteredValues.length;
    if (averageLength <= 40) {
      return 'single-choice';
    }
  }

  return 'text';
};

export const analyzeColumns = (rows: Record<string, unknown>[], options?: { sampleSize?: number; maxUniqueValues?: number }): ColumnAnalysisResult => {
  const sampleSize = options?.sampleSize ?? Math.min(200, Math.max(50, rows.length));
  const maxUniqueValues = options?.maxUniqueValues ?? 25;
  const sampleRows = rows.slice(0, sampleSize);
  const warnings: string[] = [];
  const detectedDemographicsSet = new Set<string>();
  const columnNames = new Set<string>();

  sampleRows.forEach((row) => {
    Object.keys(row).forEach((key) => columnNames.add(key));
  });

  const sortedColumnNames = Array.from(columnNames);
  const columns: ColumnSummary[] = sortedColumnNames.map((columnName) => {
    const columnValues = sampleRows.map((row) => row[columnName]);
    const asStrings = columnValues.map((value) => {
      if (value === null || value === undefined) {
        return '';
      }
      if (Array.isArray(value)) {
        return value.join(', ');
      }
      return String(value);
    });

    const nonEmptyValues = asStrings.filter((value) => value.trim() !== '');
    const uniqueValues = Array.from(new Set(nonEmptyValues)).slice(0, maxUniqueValues);

    const demographicMatch = detectDemographicField(columnName);
    if (demographicMatch) {
      detectedDemographicsSet.add(demographicMatch.field);
    }

    if (nonEmptyValues.length === 0) {
      warnings.push(`Column "${columnName}" appears to be empty in the preview sample.`);
    }

    const questionType = detectQuestionType(columnName, uniqueValues);
    const isRequired = sampleRows.length > 0
      ? nonEmptyValues.length >= Math.round(sampleRows.length * 0.85)
      : false;

    return {
      name: columnName,
      type: questionType,
      isDemographic: Boolean(demographicMatch),
      demographicField: demographicMatch?.field,
      sampleValues: nonEmptyValues.slice(0, 5),
      uniqueValues,
      isRequired
    };
  });

  if (columns.length === 0) {
    warnings.push('No usable columns detected in the uploaded data.');
  }

  if (detectedDemographicsSet.size === 0) {
    warnings.push('No demographic fields detected. Digital twin creation may be limited.');
  }

  return {
    columns,
    detectedDemographics: Array.from(detectedDemographicsSet),
    warnings
  };
};
