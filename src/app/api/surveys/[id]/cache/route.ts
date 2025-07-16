import { NextRequest, NextResponse } from 'next/server';
import { openSql } from '../../../../utils/database/db';

// GET /api/surveys/[id]/cache - Get cache information
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const surveyId = parseInt(id);
    
    if (isNaN(surveyId)) {
      return NextResponse.json({ 
        error: 'Invalid survey ID' 
      }, { status: 400 });
    }

    const db = await openSql();
    
    // Get cache information using the fixed two-step approach
    const [latestRecord] = await db.execute(`
      SELECT id, created_at, expires_at, status, response_count
      FROM survey_analytics_cache 
      WHERE survey_id = ? 
      ORDER BY created_at DESC 
      LIMIT 1
    `, [surveyId]) as any[];

    if (!latestRecord || latestRecord.length === 0) {
      return NextResponse.json({
        hasCachedAnalytics: false,
        surveyId,
        message: 'No cached analytics found'
      });
    }

    const cache = latestRecord[0];
    const now = new Date();
    const expiresAt = cache.expires_at ? new Date(cache.expires_at) : null;
    const isExpired = expiresAt && expiresAt < now;
    
    // Get analytics data size
    const [dataInfo] = await db.execute(`
      SELECT CHAR_LENGTH(analytics_data) as data_size
      FROM survey_analytics_cache 
      WHERE id = ?
    `, [cache.id]) as any[];

    const dataSize = dataInfo && dataInfo.length > 0 ? dataInfo[0].data_size : 0;

    return NextResponse.json({
      hasCachedAnalytics: true,
      surveyId,
      cache: {
        status: cache.status,
        createdAt: cache.created_at,
        expiresAt: cache.expires_at,
        isExpired,
        responseCount: cache.response_count,
        dataSizeKB: Math.round(dataSize / 1024),
        hoursUntilExpiry: expiresAt ? Math.round((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60)) : null,
        ageHours: Math.round((now.getTime() - new Date(cache.created_at).getTime()) / (1000 * 60 * 60))
      },
      actions: {
        refresh: `POST /api/surveys/${surveyId}/ai-analytics`,
        clearCache: `DELETE /api/surveys/${surveyId}/cache`,
        setPermanent: `PUT /api/surveys/${surveyId}/cache`
      }
    });

  } catch (error) {
    console.error('Error getting cache info:', error);
    return NextResponse.json({ 
      error: 'Failed to get cache information',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// PUT /api/surveys/[id]/cache - Update cache settings (make permanent, extend TTL, etc.)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const surveyId = parseInt(id);
    
    if (isNaN(surveyId)) {
      return NextResponse.json({ 
        error: 'Invalid survey ID' 
      }, { status: 400 });
    }

    const body = await request.json();
    const { action, expirationDays } = body;

    const db = await openSql();

    if (action === 'makePermanent') {
      // Set expiration to NULL for permanent cache
      await db.execute(`
        UPDATE survey_analytics_cache 
        SET expires_at = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE survey_id = ? AND status = 'completed'
      `, [surveyId]);

      return NextResponse.json({
        success: true,
        message: `Analytics cache for survey ${surveyId} is now permanent`,
        action: 'made_permanent'
      });

    } else if (action === 'extendTTL' && expirationDays) {
      // Extend expiration by specified days
      const newExpirationDate = new Date();
      newExpirationDate.setDate(newExpirationDate.getDate() + parseInt(expirationDays));

      await db.execute(`
        UPDATE survey_analytics_cache 
        SET expires_at = ?, updated_at = CURRENT_TIMESTAMP
        WHERE survey_id = ? AND status = 'completed'
      `, [newExpirationDate, surveyId]);

      return NextResponse.json({
        success: true,
        message: `Analytics cache for survey ${surveyId} extended to ${newExpirationDate.toISOString()}`,
        action: 'extended_ttl',
        newExpirationDate: newExpirationDate.toISOString()
      });

    } else {
      return NextResponse.json({
        error: 'Invalid action. Use "makePermanent" or "extendTTL" with expirationDays'
      }, { status: 400 });
    }

  } catch (error) {
    console.error('Error updating cache settings:', error);
    return NextResponse.json({ 
      error: 'Failed to update cache settings',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// DELETE /api/surveys/[id]/cache - Clear cache for manual refresh
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const surveyId = parseInt(id);
    
    if (isNaN(surveyId)) {
      return NextResponse.json({ 
        error: 'Invalid survey ID' 
      }, { status: 400 });
    }

    const db = await openSql();
    
    // Clear the cache
    await db.execute('DELETE FROM survey_analytics_cache WHERE survey_id = ?', [surveyId]);
    
    return NextResponse.json({
      success: true,
      message: `Analytics cache cleared for survey ${surveyId}`,
      nextSteps: {
        regenerate: `POST /api/surveys/${surveyId}/ai-analytics`,
        checkStatus: `GET /api/surveys/${surveyId}/cache`
      }
    });

  } catch (error) {
    console.error('Error clearing cache:', error);
    return NextResponse.json({ 
      error: 'Failed to clear cache',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
} 