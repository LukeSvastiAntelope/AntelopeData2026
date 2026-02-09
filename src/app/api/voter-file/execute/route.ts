import { NextRequest, NextResponse } from 'next/server';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { openSql } from '@/app/utils/database/db';
import {
  detectVoterFileFormat,
  transformVoterRow,
} from '@/app/utils/voter-file-schema';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes for large files

interface MatchResult {
  responderId: number;
  agentToken: string;
  matchType: 'email' | 'name_state' | 'name_zip';
  confidence: number;
}

/**
 * POST /api/voter-file/execute
 *
 * Execute a voter file import. For each row:
 *  1. Attempt to match to an existing voter profile by email or name + geography
 *  2. Enrich the matched profile's demographics
 *  3. Track the enrichment source
 *
 * Expects multipart form with the file + optional column mapping overrides.
 */
export async function POST(req: NextRequest) {
  try {
    const userId = req.headers.get('x-user-id');
    if (!userId) {
      return NextResponse.json(
        { status: false, message: 'Unauthorized' },
        { status: 401 }
      );
    }

    const formData = await req.formData();
    const file = formData.get('file') as File;
    const columnMappingJson = formData.get('columnMapping') as string | null;

    if (!file) {
      return NextResponse.json(
        { status: false, message: 'No file provided' },
        { status: 400 }
      );
    }

    // Parse file
    const fileName = file.name.toLowerCase();
    let rows: Record<string, string>[] = [];
    let headers: string[] = [];

    if (
      fileName.endsWith('.csv') ||
      fileName.endsWith('.tsv') ||
      fileName.endsWith('.txt')
    ) {
      const text = await file.text();
      const delimiter = fileName.endsWith('.tsv') ? '\t' : undefined;
      const result = Papa.parse<Record<string, string>>(text, {
        header: true,
        skipEmptyLines: 'greedy' as const,
        delimiter,
        transformHeader: (h: string, i: number) => h.trim() || `Column_${i}`,
      });
      rows = result.data;
      headers = result.meta.fields || [];
    } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      rows = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, {
        defval: '',
        raw: false,
      });
      if (rows.length > 0) headers = Object.keys(rows[0]);
    } else {
      return NextResponse.json(
        { status: false, message: 'Unsupported file format' },
        { status: 400 }
      );
    }

    // Detect format and get mappings
    const detection = detectVoterFileFormat(headers);

    // Allow user overrides of column mapping
    let mappedColumns = detection.mappedColumns;
    if (columnMappingJson) {
      try {
        mappedColumns = JSON.parse(columnMappingJson);
      } catch {
        // Ignore bad JSON, use auto-detected
      }
    }

    const db = await openSql();

    // Pre-fetch existing responder agents for matching
    const [existingAgents]: any = await db.execute(
      `SELECT ra.id, ra.name, ra.agent_token, ra.email, ra.voter_file_id,
              sr.id as response_id, sr.demographics
       FROM responder_agents ra
       LEFT JOIN survey_responses sr ON sr.responder_agent_id = ra.id
       WHERE ra.created_by = ?
       ORDER BY ra.id DESC`,
      [userId]
    );

    // Build lookup indexes
    const emailIndex = new Map<string, typeof existingAgents[0]>();
    const nameStateIndex = new Map<string, typeof existingAgents[0]>();

    for (const agent of existingAgents) {
      if (agent.email) {
        emailIndex.set(agent.email.toLowerCase().trim(), agent);
      }

      let demographics;
      try {
        demographics =
          typeof agent.demographics === 'string'
            ? JSON.parse(agent.demographics)
            : agent.demographics;
      } catch {
        continue;
      }

      if (demographics && agent.name) {
        const nameNorm = agent.name.toLowerCase().trim();
        const state = (demographics.state || '').toLowerCase().trim();
        const zip = (demographics.zip || '').toLowerCase().trim();
        if (state) nameStateIndex.set(`${nameNorm}|${state}`, agent);
        if (zip) nameStateIndex.set(`${nameNorm}|${zip}`, agent);
      }
    }

    // Process rows
    let matched = 0;
    let enriched = 0;
    let skipped = 0;
    let newVoterIds = 0;
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      try {
        const transformed = transformVoterRow(rows[i], mappedColumns);
        if (!transformed.name && !transformed.email) {
          skipped++;
          continue;
        }

        // Attempt match
        let match: MatchResult | null = null;

        // 1. Email match (highest confidence)
        if (transformed.email) {
          const agent = emailIndex.get(transformed.email.toLowerCase().trim());
          if (agent) {
            match = {
              responderId: agent.id,
              agentToken: agent.agent_token,
              matchType: 'email',
              confidence: 0.95,
            };
          }
        }

        // 2. Name + state match
        if (!match && transformed.name && transformed.state) {
          const key = `${transformed.name.toLowerCase().trim()}|${transformed.state.toLowerCase().trim()}`;
          const agent = nameStateIndex.get(key);
          if (agent) {
            match = {
              responderId: agent.id,
              agentToken: agent.agent_token,
              matchType: 'name_state',
              confidence: 0.7,
            };
          }
        }

        // 3. Name + zip match
        if (!match && transformed.name && transformed.zip) {
          const key = `${transformed.name.toLowerCase().trim()}|${transformed.zip.toLowerCase().trim()}`;
          const agent = nameStateIndex.get(key);
          if (agent) {
            match = {
              responderId: agent.id,
              agentToken: agent.agent_token,
              matchType: 'name_zip',
              confidence: 0.8,
            };
          }
        }

        if (match) {
          matched++;

          // Enrich demographics on the matched survey response
          const [matchedResponses]: any = await db.execute(
            'SELECT id, demographics FROM survey_responses WHERE responder_agent_id = ? ORDER BY id DESC LIMIT 1',
            [match.responderId]
          );

          if (matchedResponses.length > 0) {
            const response = matchedResponses[0];
            let existingDemographics: Record<string, unknown> = {};
            try {
              existingDemographics =
                typeof response.demographics === 'string'
                  ? JSON.parse(response.demographics)
                  : response.demographics || {};
            } catch {
              existingDemographics = {};
            }

            // Merge: voter file data fills in blanks, doesn't overwrite existing
            const mergedDemographics = { ...existingDemographics };
            for (const [key, value] of Object.entries(transformed)) {
              if (
                key === 'voter_file_id' ||
                key === 'last_name' ||
                key === 'middle_name'
              )
                continue;
              if (!mergedDemographics[key] || mergedDemographics[key] === '') {
                mergedDemographics[key] = value;
              }
            }

            const enrichmentSource = {
              file: file.name,
              format: detection.format.id,
              matchType: match.matchType,
              confidence: match.confidence,
              voterFileId: transformed.voter_file_id || null,
              importedAt: new Date().toISOString(),
            };

            await db.execute(
              `UPDATE survey_responses 
               SET demographics = ?, enrichment_source = ?
               WHERE id = ?`,
              [
                JSON.stringify(mergedDemographics),
                JSON.stringify(enrichmentSource),
                response.id,
              ]
            );
            enriched++;
          }

          // Update voter_file_id on the responder agent
          if (transformed.voter_file_id) {
            await db.execute(
              'UPDATE responder_agents SET voter_file_id = ? WHERE id = ?',
              [transformed.voter_file_id, match.responderId]
            );
            newVoterIds++;
          }
        } else {
          skipped++;
        }
      } catch (rowError) {
        errors.push(
          `Row ${i + 1}: ${rowError instanceof Error ? rowError.message : 'Unknown error'}`
        );
      }
    }

    return NextResponse.json({
      status: true,
      summary: {
        totalRows: rows.length,
        matched,
        enriched,
        skipped,
        voterIdsLinked: newVoterIds,
        format: detection.format.name,
        errors: errors.slice(0, 20), // Cap error list
      },
    });
  } catch (error) {
    console.error('Voter file execute error:', error);
    return NextResponse.json(
      {
        status: false,
        message:
          error instanceof Error
            ? error.message
            : 'Failed to execute voter file import',
      },
      { status: 500 }
    );
  }
}
