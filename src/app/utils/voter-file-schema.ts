/**
 * Voter File Schema Definitions
 * 
 * Maps column names from common voter file providers (L2, TargetSmart,
 * generic state rolls) to our internal demographic field names.
 */

import type { DemographicField } from './demographic-system-v2';

export interface VoterFileColumnMapping {
  /** Column name patterns to match (case-insensitive) */
  patterns: string[];
  /** Our internal demographic field */
  targetField: DemographicField | string;
  /** Human-readable label */
  label: string;
  /** Optional transform function for normalizing values */
  transform?: (value: string) => string;
}

export interface VoterFileFormat {
  id: string;
  name: string;
  description: string;
  /** Signature columns that identify this format */
  signatureColumns: string[];
  /** Column mappings for this format */
  mappings: VoterFileColumnMapping[];
}

// =========================================================================
// VALUE TRANSFORMS
// =========================================================================

function normalizePartyCode(value: string): string {
  const v = value.toUpperCase().trim();
  const map: Record<string, string> = {
    'D': 'Democrat', 'DEM': 'Democrat', 'DEMOCRAT': 'Democrat', 'DEMOCRATIC': 'Democrat',
    'R': 'Republican', 'REP': 'Republican', 'REPUBLICAN': 'Republican', 'GOP': 'Republican',
    'I': 'Independent', 'IND': 'Independent', 'INDEPENDENT': 'Independent', 'NPA': 'Independent',
    'U': 'Independent', 'UNA': 'Independent', 'UNAFFILIATED': 'Independent',
    'L': 'Libertarian', 'LIB': 'Libertarian', 'LIBERTARIAN': 'Libertarian',
    'G': 'Green', 'GRN': 'Green', 'GREEN': 'Green',
    'O': 'Other', 'OTH': 'Other', 'OTHER': 'Other',
  };
  return map[v] || value;
}

function normalizeRegistrationStatus(value: string): string {
  const v = value.toUpperCase().trim();
  if (['A', 'ACTIVE', 'REGISTERED', 'Y', 'YES'].includes(v)) return 'Registered';
  if (['I', 'INACTIVE', 'PURGED', 'CANCELLED', 'N', 'NO'].includes(v)) return 'Not registered';
  return 'Unsure';
}

function normalizeGender(value: string): string {
  const v = value.toUpperCase().trim();
  if (['M', 'MALE'].includes(v)) return 'Male';
  if (['F', 'FEMALE'].includes(v)) return 'Female';
  if (['N', 'NB', 'X', 'NON-BINARY', 'NONBINARY'].includes(v)) return 'Non-binary';
  return 'Prefer not to say';
}

function normalizeAge(value: string): string {
  const num = parseInt(value);
  if (isNaN(num)) return value;
  if (num < 18) return '18-24'; // Shouldn't happen in voter files
  if (num <= 24) return '18-24';
  if (num <= 34) return '25-34';
  if (num <= 44) return '35-44';
  if (num <= 54) return '45-54';
  if (num <= 64) return '55-64';
  return '65+';
}

function normalizeVotingFrequency(value: string): string {
  const num = parseInt(value);
  if (!isNaN(num)) {
    // Numeric vote history count (e.g., L2 general election count)
    if (num >= 5) return 'Every election';
    if (num >= 3) return 'Most elections';
    if (num >= 1) return 'Occasionally';
    return 'Never voted';
  }
  return value;
}

// =========================================================================
// L2 VOTER FILE FORMAT
// =========================================================================

const L2_FORMAT: VoterFileFormat = {
  id: 'l2',
  name: 'L2 Political',
  description: 'L2 Inc. national voter file format',
  signatureColumns: ['LALVOTERID', 'Voters_FIPS', 'Parties_Description'],
  mappings: [
    { patterns: ['LALVOTERID', 'L2_VOTER_ID'], targetField: 'voter_file_id', label: 'Voter ID' },
    { patterns: ['Voters_FirstName', 'FIRST_NAME'], targetField: 'name', label: 'First Name' },
    { patterns: ['Voters_LastName', 'LAST_NAME'], targetField: 'last_name', label: 'Last Name' },
    { patterns: ['Parties_Description', 'PARTY_CODE', 'Voters_PartyCode'], targetField: 'party_affiliation', label: 'Party', transform: normalizePartyCode },
    { patterns: ['Voters_Gender', 'GENDER'], targetField: 'gender', label: 'Gender', transform: normalizeGender },
    { patterns: ['Voters_Age', 'AGE'], targetField: 'age', label: 'Age', transform: normalizeAge },
    { patterns: ['Voters_BirthDate', 'DOB', 'BIRTH_DATE'], targetField: 'birth_date', label: 'Birth Date' },
    { patterns: ['Residence_Addresses_State', 'STATE'], targetField: 'state', label: 'State' },
    { patterns: ['Residence_Addresses_County', 'COUNTY'], targetField: 'county', label: 'County' },
    { patterns: ['Residence_Addresses_City', 'CITY'], targetField: 'location', label: 'City' },
    { patterns: ['Residence_Addresses_Zip', 'ZIP', 'ZIPCODE'], targetField: 'zip', label: 'ZIP Code' },
    { patterns: ['US_Congressional_District', 'CONGRESSIONAL_DIST', 'CD'], targetField: 'congressional_district', label: 'Congressional District' },
    { patterns: ['Voters_RegistrationDate', 'REG_DATE'], targetField: 'registration_date', label: 'Registration Date' },
    { patterns: ['Voters_Active', 'STATUS'], targetField: 'voter_registration_status', label: 'Registration Status', transform: normalizeRegistrationStatus },
    { patterns: ['General_2024', 'GeneralElection_2024'], targetField: 'voted_2024_general', label: 'Voted 2024 General' },
    { patterns: ['General_2022', 'GeneralElection_2022'], targetField: 'voted_2022_general', label: 'Voted 2022 General' },
    { patterns: ['General_2020', 'GeneralElection_2020'], targetField: 'voted_2020_general', label: 'Voted 2020 General' },
    { patterns: ['Primary_2024', 'PrimaryElection_2024'], targetField: 'voted_2024_primary', label: 'Voted 2024 Primary' },
    { patterns: ['ElectionCount', 'GENERAL_ELECTIONS_VOTED'], targetField: 'voting_frequency', label: 'Elections Voted', transform: normalizeVotingFrequency },
    { patterns: ['EthnicGroups_EthnicGroup1Desc', 'ETHNICITY'], targetField: 'ethnicity', label: 'Ethnicity' },
    { patterns: ['CommercialData_Education', 'EDUCATION'], targetField: 'education', label: 'Education' },
    { patterns: ['CommercialData_EstimatedHHIncome', 'HH_INCOME'], targetField: 'income', label: 'Household Income' },
    { patterns: ['Voters_OfficialRegEmail', 'EMAIL'], targetField: 'email', label: 'Email' },
    { patterns: ['Voters_Phone', 'PHONE'], targetField: 'phone_number', label: 'Phone' },
  ],
};

// =========================================================================
// TARGETSMART VOTER FILE FORMAT
// =========================================================================

const TARGETSMART_FORMAT: VoterFileFormat = {
  id: 'targetsmart',
  name: 'TargetSmart',
  description: 'TargetSmart voter file format',
  signatureColumns: ['vb.voterbase_id', 'vb.tsmart_state', 'ts.tsmart_partisan_score'],
  mappings: [
    { patterns: ['vb.voterbase_id', 'voterbase_id'], targetField: 'voter_file_id', label: 'Voter ID' },
    { patterns: ['vb.tsmart_first_name', 'tsmart_first_name'], targetField: 'name', label: 'First Name' },
    { patterns: ['vb.tsmart_last_name', 'tsmart_last_name'], targetField: 'last_name', label: 'Last Name' },
    { patterns: ['vb.voterbase_registration_status', 'registration_status'], targetField: 'voter_registration_status', label: 'Registration Status', transform: normalizeRegistrationStatus },
    { patterns: ['vb.voterbase_gender', 'tsmart_gender'], targetField: 'gender', label: 'Gender', transform: normalizeGender },
    { patterns: ['vb.voterbase_age', 'tsmart_age'], targetField: 'age', label: 'Age', transform: normalizeAge },
    { patterns: ['vb.voterbase_dob', 'tsmart_dob'], targetField: 'birth_date', label: 'Date of Birth' },
    { patterns: ['vb.tsmart_state', 'tsmart_state'], targetField: 'state', label: 'State' },
    { patterns: ['vb.tsmart_county', 'tsmart_county_name'], targetField: 'county', label: 'County' },
    { patterns: ['vb.tsmart_city', 'tsmart_city'], targetField: 'location', label: 'City' },
    { patterns: ['vb.tsmart_zip', 'tsmart_zip'], targetField: 'zip', label: 'ZIP Code' },
    { patterns: ['vb.tsmart_congressional_district', 'tsmart_cd'], targetField: 'congressional_district', label: 'Congressional District' },
    { patterns: ['vb.voterbase_party', 'tsmart_partisan_score'], targetField: 'party_affiliation', label: 'Party', transform: normalizePartyCode },
    { patterns: ['ts.tsmart_partisan_score', 'partisan_score'], targetField: 'partisan_score', label: 'Partisan Score' },
    { patterns: ['ts.tsmart_presidential_general_turnout_score'], targetField: 'turnout_score', label: 'Turnout Score' },
    { patterns: ['vb.voterbase_race', 'tsmart_race'], targetField: 'ethnicity', label: 'Race/Ethnicity' },
    { patterns: ['vb.voterbase_email', 'tsmart_email'], targetField: 'email', label: 'Email' },
    { patterns: ['vb.voterbase_phone', 'tsmart_phone'], targetField: 'phone_number', label: 'Phone' },
  ],
};

// =========================================================================
// GENERIC STATE VOTER ROLL FORMAT
// =========================================================================

const GENERIC_STATE_FORMAT: VoterFileFormat = {
  id: 'generic',
  name: 'Generic State Voter Roll',
  description: 'Common format used by state secretary of state voter rolls',
  signatureColumns: [], // Fallback -- no specific signature
  mappings: [
    { patterns: ['voter_id', 'voterid', 'id', 'registration_number', 'reg_num'], targetField: 'voter_file_id', label: 'Voter ID' },
    { patterns: ['first_name', 'firstname', 'first', 'name_first', 'fname'], targetField: 'name', label: 'First Name' },
    { patterns: ['last_name', 'lastname', 'last', 'name_last', 'lname', 'surname'], targetField: 'last_name', label: 'Last Name' },
    { patterns: ['middle_name', 'middle', 'middlename', 'name_middle', 'mname'], targetField: 'middle_name', label: 'Middle Name' },
    { patterns: ['party', 'party_code', 'party_affiliation', 'political_party', 'party_name'], targetField: 'party_affiliation', label: 'Party', transform: normalizePartyCode },
    { patterns: ['gender', 'sex'], targetField: 'gender', label: 'Gender', transform: normalizeGender },
    { patterns: ['age', 'voter_age'], targetField: 'age', label: 'Age', transform: normalizeAge },
    { patterns: ['dob', 'date_of_birth', 'birth_date', 'birthdate', 'birthday'], targetField: 'birth_date', label: 'Date of Birth' },
    { patterns: ['state', 'res_state', 'state_code'], targetField: 'state', label: 'State' },
    { patterns: ['county', 'county_name', 'res_county'], targetField: 'county', label: 'County' },
    { patterns: ['city', 'res_city', 'municipality'], targetField: 'location', label: 'City' },
    { patterns: ['zip', 'zipcode', 'zip_code', 'postal_code', 'res_zip'], targetField: 'zip', label: 'ZIP Code' },
    { patterns: ['congressional_district', 'cd', 'cong_district', 'us_cong_dist'], targetField: 'congressional_district', label: 'Congressional District' },
    { patterns: ['status', 'voter_status', 'registration_status', 'reg_status'], targetField: 'voter_registration_status', label: 'Registration Status', transform: normalizeRegistrationStatus },
    { patterns: ['registration_date', 'reg_date', 'date_registered'], targetField: 'registration_date', label: 'Registration Date' },
    { patterns: ['race', 'ethnicity', 'race_code'], targetField: 'ethnicity', label: 'Race/Ethnicity' },
    { patterns: ['email', 'email_address', 'voter_email'], targetField: 'email', label: 'Email' },
    { patterns: ['phone', 'phone_number', 'telephone'], targetField: 'phone_number', label: 'Phone' },
    { patterns: ['precinct', 'precinct_id', 'precinct_name'], targetField: 'precinct', label: 'Precinct' },
    { patterns: ['state_house', 'state_house_district', 'sldl'], targetField: 'state_house_district', label: 'State House District' },
    { patterns: ['state_senate', 'state_senate_district', 'sldu'], targetField: 'state_senate_district', label: 'State Senate District' },
  ],
};

// =========================================================================
// FORMAT REGISTRY
// =========================================================================

export const VOTER_FILE_FORMATS: VoterFileFormat[] = [
  L2_FORMAT,
  TARGETSMART_FORMAT,
  GENERIC_STATE_FORMAT,
];

/**
 * Auto-detect voter file format from column headers.
 * Returns the best matching format and the mapped columns.
 */
export function detectVoterFileFormat(headers: string[]): {
  format: VoterFileFormat;
  confidence: number;
  mappedColumns: Array<{
    originalColumn: string;
    targetField: string;
    label: string;
    transform?: (value: string) => string;
  }>;
  unmappedColumns: string[];
} {
  const normalizedHeaders = headers.map(h => h.trim().toLowerCase());
  
  let bestFormat = GENERIC_STATE_FORMAT;
  let bestScore = 0;

  // Check signature columns for L2 and TargetSmart
  for (const format of [L2_FORMAT, TARGETSMART_FORMAT]) {
    const matchCount = format.signatureColumns.filter(sig =>
      normalizedHeaders.some(h => h === sig.toLowerCase())
    ).length;
    
    const score = matchCount / format.signatureColumns.length;
    if (score > bestScore) {
      bestScore = score;
      bestFormat = format;
    }
  }

  // Map columns
  const mappedColumns: Array<{
    originalColumn: string;
    targetField: string;
    label: string;
    transform?: (value: string) => string;
  }> = [];
  const mappedOriginals = new Set<string>();

  for (const mapping of bestFormat.mappings) {
    for (const header of headers) {
      const normalizedHeader = header.trim().toLowerCase();
      if (mappedOriginals.has(normalizedHeader)) continue;

      const matched = mapping.patterns.some(p => 
        normalizedHeader === p.toLowerCase() ||
        normalizedHeader.replace(/[_\-\s.]/g, '') === p.toLowerCase().replace(/[_\-\s.]/g, '')
      );

      if (matched) {
        mappedColumns.push({
          originalColumn: header,
          targetField: mapping.targetField,
          label: mapping.label,
          transform: mapping.transform,
        });
        mappedOriginals.add(normalizedHeader);
        break;
      }
    }
  }

  // If specific format didn't map well, try generic as fallback
  if (bestFormat.id !== 'generic' && mappedColumns.length < 3) {
    const genericResult = detectVoterFileFormat(headers);
    if (genericResult.mappedColumns.length > mappedColumns.length) {
      return genericResult;
    }
  }

  const unmappedColumns = headers.filter(h => !mappedOriginals.has(h.trim().toLowerCase()));

  return {
    format: bestFormat,
    confidence: headers.length > 0 ? mappedColumns.length / headers.length : 0,
    mappedColumns,
    unmappedColumns,
  };
}

/**
 * Apply column mappings to transform a voter file row into our demographic format.
 */
export function transformVoterRow(
  row: Record<string, string>,
  mappedColumns: Array<{
    originalColumn: string;
    targetField: string;
    transform?: (value: string) => string;
  }>
): Record<string, string> {
  const result: Record<string, string> = {};

  for (const mapping of mappedColumns) {
    const rawValue = row[mapping.originalColumn];
    if (rawValue && rawValue.trim()) {
      result[mapping.targetField] = mapping.transform
        ? mapping.transform(rawValue.trim())
        : rawValue.trim();
    }
  }

  // Combine first + last name if both exist
  if (result.name && result.last_name) {
    result.name = `${result.name} ${result.last_name}`;
    delete result.last_name;
  } else if (result.last_name) {
    result.name = result.last_name;
    delete result.last_name;
  }

  return result;
}
