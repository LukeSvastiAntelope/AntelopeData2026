import cron from 'node-cron';
import {
    getTrackedOrganizationStates,
    refreshCensusDistrictDemographics,
    refreshDistrictPoliticalDataFromCsv,
    refreshOpenFecDistrictDonations,
    type DistrictRefreshSummary,
    type ExternalRefreshSummary,
} from '@/app/utils/political-data-refresh';
import { runCampaignNewsDigest, type CampaignNewsDigestSummary } from '@/app/utils/campaign-news';

let lastRunAt: string | null = null;
let lastRunStatus: 'success' | 'error' | 'never' = 'never';
let lastRunSummary: DailyTaskSummary | null = null;
let lastRunError: string | null = null;

interface SourceResult<T> {
    status: 'success' | 'error' | 'skipped';
    data?: T;
    error?: string;
}

export interface DailyTaskSummary {
    tasksRun: number;
    states: string[];
    csv: SourceResult<DistrictRefreshSummary>;
    openfec: SourceResult<ExternalRefreshSummary[]>;
    census: SourceResult<ExternalRefreshSummary[]>;
    campaignNewsDigest: SourceResult<CampaignNewsDigestSummary>;
}

async function runPerStateRefresh(
    states: string[],
    source: 'openfec' | 'census',
    runner: (state: string) => Promise<ExternalRefreshSummary>
): Promise<SourceResult<ExternalRefreshSummary[]>> {
    if (!states.length) {
        return {
            status: 'skipped',
            error: 'No organization states found; skipping state-scoped refresh',
        };
    }

    const summaries: ExternalRefreshSummary[] = [];
    let hasError = false;

    for (const state of states) {
        try {
            summaries.push(await runner(state));
        } catch (error) {
            hasError = true;
            summaries.push({
                source,
                state,
                processedRows: 0,
                matchedRows: 0,
                upsertedRows: 0,
                skippedRows: 0,
                errors: [error instanceof Error ? error.message : 'Unknown error'],
            });
        }
    }

    return {
        status: hasError ? 'error' : 'success',
        data: summaries,
        error: hasError ? 'One or more states failed to refresh' : undefined,
    };
}

export async function runDailyPlatformTasks() {
    console.log('⏰ Running daily platform tasks...');

    try {
        const states = await getTrackedOrganizationStates();

        let csv: SourceResult<DistrictRefreshSummary>;
        try {
            const summary = await refreshDistrictPoliticalDataFromCsv();
            csv = { status: 'success', data: summary };
        } catch (error) {
            csv = {
                status: 'error',
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }

        const openfec = await runPerStateRefresh(states, 'openfec', refreshOpenFecDistrictDonations);
        const census = await runPerStateRefresh(states, 'census', refreshCensusDistrictDemographics);
        let campaignNewsDigest: SourceResult<CampaignNewsDigestSummary>;
        try {
            const digestSummary = await runCampaignNewsDigest();
            campaignNewsDigest = { status: 'success', data: digestSummary };
        } catch (error) {
            campaignNewsDigest = {
                status: 'error',
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }

        const summary: DailyTaskSummary = {
            tasksRun: 4,
            states,
            csv,
            openfec,
            census,
            campaignNewsDigest,
        };

        const hasSourceError =
            csv.status === 'error' ||
            openfec.status === 'error' ||
            census.status === 'error' ||
            campaignNewsDigest.status === 'error';

        lastRunAt = new Date().toISOString();
        lastRunStatus = hasSourceError ? 'error' : 'success';
        lastRunSummary = summary;
        lastRunError = hasSourceError ? 'One or more data sources failed' : null;

        console.log(
            `✅ Daily data refresh completed. states=${states.length}, csv=${csv.status}, openfec=${openfec.status}, census=${census.status}, campaignNewsDigest=${campaignNewsDigest.status}`
        );

        return summary;
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        lastRunAt = new Date().toISOString();
        lastRunStatus = 'error';
        lastRunError = message;
        console.error('Error in daily cron job:', error);
        throw error;
    }
}

export function getDailyTaskRuntimeStats() {
    return {
        lastRunAt,
        lastRunStatus,
        lastRunSummary,
        lastRunError,
    };
}

/**
 * Schedule daily platform tasks.
 * 
 * The previous prediction/bet analysis tasks have been removed.
 * This scheduler can be extended with new political survey tasks
 * (e.g., closing expired surveys, sending reminders, etc.)
 */
export function scheduleDailyTasks() {
    // Schedule to run every day at 2:00 AM (server time)
    cron.schedule('0 2 * * *', async () => {
        await runDailyPlatformTasks();
    }, {
        timezone: "America/New_York"
    });

    console.log('📅 Daily tasks scheduled to run at 2:00 AM (America/New_York)');
}
