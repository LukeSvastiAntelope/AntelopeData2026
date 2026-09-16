import { buildPublicDistrictBrief } from '@/lib/district-brief-public';
import type { CampaignTool } from './types';

type Input = {
  districtCode: string;
};

export const getDistrictDataTool: CampaignTool<Input> = {
  name: 'get_district_data',
  description:
    'Fetch public district brief data (demographics, PVI, incumbent signals) for a US House district code like NJ-5 or CA-12. Private to the campaign session; reversible read.',
  inputSchema: {
    type: 'object',
    properties: {
      districtCode: {
        type: 'string',
        description: 'US House district code, e.g. "NJ-5" or "CA-12"',
      },
    },
    required: ['districtCode'],
    additionalProperties: false,
  },
  risk: 'auto',
  async execute(input) {
    const code = String(input.districtCode || '').trim();
    if (!code) {
      throw new Error('districtCode is required (e.g. NJ-5)');
    }

    const result = await buildPublicDistrictBrief(code);
    if (result.ok === false) {
      throw new Error(result.error);
    }

    const d = result.data;
    return {
      summary: [
        `### District ${d.districtCode}`,
        d.headline,
        '',
        d.tagline,
        '',
        `- PVI: ${d.pvi ?? 'n/a'}`,
        `- Incumbent: ${d.incumbentName ?? 'n/a'} (${d.incumbentParty ?? 'n/a'})`,
        `- Population: ${d.demographics.totalPopulation ?? 'n/a'}`,
        `- Median HH income: ${d.demographics.medianHouseholdIncome ?? 'n/a'}`,
        '',
        d.narrative,
      ].join('\n'),
      data: {
        districtCode: d.districtCode,
        pvi: d.pvi,
        incumbentName: d.incumbentName,
        incumbentParty: d.incumbentParty,
        demographics: d.demographics,
        bullets: d.bullets,
        sources: {
          census: d.census.status,
          fec: d.fec.status,
          openStates: d.openStates.status,
        },
      },
    };
  },
};
