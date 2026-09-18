/**
 * D1 collation types — offline entity resolution → MySQL person_records.
 * Sources: public property, licensed consumer, first-party survey/canvass.
 * Excluded: person-level financial / banking (GLBA).
 */

export type SourceKind =
  | 'property'
  | 'consumer'
  | 'voter'
  | 'survey'
  | 'canvass'
  | 'mock'
  | 'other';

export type AgeBucket = '18-24' | '25-34' | '35-44' | '45-54' | '55-64' | '65+' | '';

export type StandardizedRow = {
  /** Stable id within a source file (row number or native id). */
  sourceRowKey: string;
  sourceName: string;
  sourceKind: SourceKind;
  firstName: string;
  lastName: string;
  fullNameNormalized: string;
  email: string;
  phone: string;
  street: string;
  unit: string;
  city: string;
  state: string;
  zip: string;
  birthdate: string | null;
  ageYears: number | null;
  ageBucket: AgeBucket;
  party: string;
  gender: string;
  voterStatus: string;
  district: string;
  ownerOccupied: boolean | null;
  propertyType: string;
  latitude: number | null;
  longitude: number | null;
  /** Phonetic last-name code for blocking. */
  phoneticLast: string;
  blockKey: string;
  raw: Record<string, string>;
};

export type FieldScore = {
  field: string;
  score: number;
  weight: number;
};

export type PairDecision = 'match' | 'maybe' | 'no';

export type ScoredPair = {
  a: number;
  b: number;
  score: number;
  decision: PairDecision;
  fields: FieldScore[];
};

export type FieldProvenance = {
  value: string | number | boolean | null;
  source: string;
  confidence: number;
};

export type UnifiedPerson = {
  clusterKey: string;
  firstName: string;
  lastName: string;
  fullNameNormalized: string;
  email: string;
  phone: string;
  birthdate: string | null;
  ageYears: number | null;
  ageBucket: AgeBucket;
  party: string;
  gender: string;
  voterStatus: string;
  district: string;
  city: string;
  state: string;
  zip: string;
  street: string;
  unit: string;
  ownerOccupied: boolean | null;
  propertyType: string;
  latitude: number | null;
  longitude: number | null;
  matchConfidence: number;
  fieldProvenance: Record<string, FieldProvenance>;
  sourceRowKeys: string[];
  sourceNames: string[];
};

export const FILTERABLE_FIELDS = [
  'party',
  'age_bucket',
  'voter_status',
  'district',
  'zip',
  'city',
  'state',
  'owner_occupied',
  'property_type',
  'match_confidence',
] as const;
