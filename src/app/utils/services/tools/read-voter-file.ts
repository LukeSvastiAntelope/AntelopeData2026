import { openSql } from '@/app/utils/database/db';
import type { CampaignTool } from './types';

type Input = {
  listId?: number;
  limit?: number;
};

/**
 * Read stored contact/voter list metadata for the authenticated user.
 * Does not mutate data. Full CSV re-parse lives in /api/voter-file/import.
 */
export const readVoterFileTool: CampaignTool<Input> = {
  name: 'read_voter_file',
  description:
    'List or inspect the campaign\'s uploaded contact/voter lists (metadata and counts). Private read; does not send or publish anything.',
  inputSchema: {
    type: 'object',
    properties: {
      listId: {
        type: 'number',
        description: 'Optional contact list id. If omitted, returns recent lists for the user.',
      },
      limit: {
        type: 'number',
        description: 'Max lists to return when listing (default 20, max 50).',
      },
    },
    additionalProperties: false,
  },
  risk: 'auto',
  async execute(input, ctx) {
    const db = await openSql();
    const listId =
      input.listId !== undefined && Number.isFinite(Number(input.listId))
        ? Number(input.listId)
        : null;

    if (listId) {
      const [rows]: any = await db.execute(
        `SELECT id, name, description, source_file, contact_count, created_at, filter_prompt
         FROM contact_lists WHERE id = ? AND user_id = ? LIMIT 1`,
        [listId, ctx.userId]
      );
      const row = rows?.[0];
      if (!row) {
        throw new Error(`Contact list ${listId} not found or not accessible.`);
      }
      return {
        summary: [
          `### Contact list #${row.id}`,
          `- Name: ${row.name || 'Untitled'}`,
          `- Contacts: ${row.contact_count ?? 0}`,
          `- Source: ${row.source_file || 'n/a'}`,
          row.description ? `- Description: ${row.description}` : null,
        ]
          .filter(Boolean)
          .join('\n'),
        data: {
          id: Number(row.id),
          name: row.name,
          description: row.description,
          sourceFile: row.source_file,
          contactCount: Number(row.contact_count || 0),
          createdAt: row.created_at,
          filterPrompt: row.filter_prompt,
        },
      };
    }

    const limit = Math.min(Math.max(Number(input.limit) || 20, 1), 50);
    const [rows]: any = await db.execute(
      `SELECT id, name, description, source_file, contact_count, created_at
       FROM contact_lists WHERE user_id = ? ORDER BY created_at DESC LIMIT ${limit}`,
      [ctx.userId]
    );
    const lists = (rows || []).map((r: any) => ({
      id: Number(r.id),
      name: String(r.name || 'Untitled'),
      contactCount: Number(r.contact_count || 0),
      sourceFile: r.source_file || null,
      createdAt: r.created_at,
    }));

    if (!lists.length) {
      return {
        summary:
          'No contact/voter lists found for this account yet. Import a file under Voter Files to create one.',
        data: { total: 0, lists: [] },
      };
    }

    return {
      summary: [
        '### Contact / voter lists',
        ...lists.map(
          (l: { id: number; name: string; contactCount: number }) =>
            `- #${l.id} | ${l.name} | ${l.contactCount} contacts`
        ),
      ].join('\n'),
      data: { total: lists.length, lists },
    };
  },
};
