import { NextRequest, NextResponse } from 'next/server';
import {
  requireSuperAdmin,
  clientIp,
} from '@/app/utils/auth/require-super-admin';
import { writeAdminAuditLog } from '@/app/utils/database/admin-audit-repo';

// In-memory config (historical); mutations are audited.
let schedulerConfig = {
  confidenceThreshold: 15,
  maxBetsPerPrediction: 2,
  delayBetweenAgents: 5000,
  timezone: 'America/New_York',
  cronSchedule: '0 2 * * *',
  enabled: true,
};

export async function GET(req: NextRequest) {
  const gate = await requireSuperAdmin(req);
  if (gate instanceof NextResponse) return gate;

  await writeAdminAuditLog({
    actorUserId: gate.numericUserId,
    action: 'scheduler.config.read',
    targetType: 'scheduler',
    ip: clientIp(req),
  });

  return NextResponse.json({
    success: true,
    config: schedulerConfig,
  });
}

export async function POST(req: NextRequest) {
  try {
    const gate = await requireSuperAdmin(req);
    if (gate instanceof NextResponse) return gate;

    const newConfig = await req.json();

    if (
      typeof newConfig.confidenceThreshold !== 'number' ||
      newConfig.confidenceThreshold < 1 ||
      newConfig.confidenceThreshold > 100
    ) {
      return NextResponse.json(
        {
          success: false,
          message: 'Confidence threshold must be between 1 and 100',
        },
        { status: 400 }
      );
    }

    if (
      typeof newConfig.maxBetsPerPrediction !== 'number' ||
      newConfig.maxBetsPerPrediction < 1 ||
      newConfig.maxBetsPerPrediction > 10
    ) {
      return NextResponse.json(
        {
          success: false,
          message: 'Max bets per prediction must be between 1 and 10',
        },
        { status: 400 }
      );
    }

    if (
      typeof newConfig.delayBetweenAgents !== 'number' ||
      newConfig.delayBetweenAgents < 1000 ||
      newConfig.delayBetweenAgents > 60000
    ) {
      return NextResponse.json(
        {
          success: false,
          message: 'Delay between agents must be between 1000 and 60000 ms',
        },
        { status: 400 }
      );
    }

    schedulerConfig = { ...schedulerConfig, ...newConfig };

    await writeAdminAuditLog({
      actorUserId: gate.numericUserId,
      action: 'scheduler.config.write',
      targetType: 'scheduler',
      metadata: { config: schedulerConfig },
      ip: clientIp(req),
    });

    return NextResponse.json({
      success: true,
      message: 'Configuration updated successfully',
      config: schedulerConfig,
    });
  } catch (error) {
    console.error('Failed to update scheduler config:', error);
    return NextResponse.json(
      {
        success: false,
        message: 'Failed to update configuration',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
