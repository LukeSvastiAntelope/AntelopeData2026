import { NextResponse } from 'next/server';

/**
 * POST /api/admin/scheduler/trigger/[agentId]
 * 
 * Manual trigger for per-agent tasks (placeholder).
 * The previous bet analysis logic has been removed.
 */
export async function POST(
    request: Request,
    { params }: { params: Promise<{ agentId: string }> }
) {
    try {
        const resolvedParams = await params;
        const agentId = parseInt(resolvedParams.agentId);
        
        if (isNaN(agentId)) {
            return NextResponse.json({
                success: false,
                message: 'Invalid agent ID'
            }, { status: 400 });
        }

        return NextResponse.json({
            success: true,
            message: `No scheduled tasks configured for agent ${agentId}.`,
            agentId,
        });
    } catch (error) {
        const resolvedParams = await params;
        console.error(`Failed to trigger tasks for agent ${resolvedParams.agentId}:`, error);
        return NextResponse.json({
            success: false,
            message: `Failed to trigger tasks for agent ${resolvedParams.agentId}`,
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}
