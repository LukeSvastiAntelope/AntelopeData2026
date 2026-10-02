/**
 * Aggregate-only guard — re-export shared module for python-analysis client.
 */

export {
  findIdentifyingColumns,
  assertAggregateOnly,
  extractSourceColumnsFromCode,
} from '@/app/utils/services/aggregate-only-guard';
