import { NextRequest } from "next/server";
import { UserRepo } from "@/app/utils/database/user-repo";
import { verifyConfirmationToken } from "@/app/utils/api/token";

// Simple in-memory cache to prevent duplicate requests
interface CacheEntry {
    data: any;
    timestamp: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_DURATION = 30 * 1000; // 30 seconds

function getCacheKey(agentId: number | null, page: number, limit: number, type: string): string {
    return `predictions_${type}_${agentId || 'all'}_${page}_${limit}`;
}

function getCachedData(key: string): any | null {
    const entry = cache.get(key);
    if (!entry) return null;
    
    // Check if cache is still valid
    if (Date.now() - entry.timestamp > CACHE_DURATION) {
        cache.delete(key);
        return null;
    }
    
    return entry.data;
}

function setCachedData(key: string, data: any): void {
    cache.set(key, {
        data,
        timestamp: Date.now()
    });
    
    // Clean up old cache entries (simple cleanup)
    if (cache.size > 100) {
        const oldestKey = cache.keys().next().value;
        cache.delete(oldestKey);
    }
}

export async function GET(req: NextRequest) {
    const token = req.headers.get('Authorization')?.split(' ')[1];
    try {
        const jwtPayload = await verifyConfirmationToken(token as string);
        if (!jwtPayload) {
            return Response.json({ error: 'Invalid token' }, { status: 401 });
        }        
        const agent = await UserRepo.getAgentByUserId(jwtPayload.email as string);
        if (!agent) {
            return Response.json({ error: 'Agent not found' }, { status: 404 });
        }
        
        // Get pagination parameters from URL
        const url = new URL(req.url);
        const page = parseInt(url.searchParams.get('page') || '1');
        const limit = parseInt(url.searchParams.get('limit') || '50');
        const type = url.searchParams.get('type') || 'marketplace'; // 'marketplace' or 'excluding_agent'
        const source = url.searchParams.get('source'); // NEW: filter by specific source
        
        // Determine which function to use
        const isMarketplace = type === 'marketplace';
        const cacheKey = getCacheKey(isMarketplace ? null : agent.id, page, limit, type + (source ? `_${source}` : ''));
        
        // CLEAR CACHE for debugging
        cache.delete(cacheKey);
        console.log(`🗑️ Cleared cache for ${cacheKey}`);
        
        const cachedData = getCachedData(cacheKey);
        
        if (cachedData) {
            console.log(`Cache hit for ${cacheKey}`);
            return Response.json(cachedData);
        }
        
        console.log(`🔄 Cache miss for ${cacheKey}, fetching from database using ${isMarketplace ? 'getAllPredictions' : 'getPredictionsWithoutAgentId'}`);
        console.log(`📋 Parameters: page=${page}, limit=${limit}, type=${type}, source=${source || 'all'}, agentId=${agent.id}`);
        
        // Use different functions based on type, and pass source filter
        const result = isMarketplace 
            ? await UserRepo.getAllPredictions(page, limit, source)
            : await UserRepo.getPredictionsWithoutAgentId(agent.id, page, limit);
        
        console.log(`📊 Database result:`, {
            predictionsCount: result.predictions.length,
            total: result.total,
            hasMore: result.hasMore,
            page: result.page,
            source: source || 'all',
            samplePrediction: result.predictions[0] ? {
                id: (result.predictions[0] as any).id,
                source: (result.predictions[0] as any).source,
                description: (result.predictions[0] as any).description?.substring(0, 30) + '...'
            } : 'NO_PREDICTIONS'
        });
        
        const responseData = {
            status: true, 
            agent: agent, 
            predictions: result.predictions,
            pagination: {
                page: result.page,
                limit: result.limit,
                total: result.total,
                hasMore: result.hasMore
            },
            type: isMarketplace ? 'marketplace' : 'excluding_agent',
            source: source || 'all'
        };
        
        // Cache the result
        setCachedData(cacheKey, responseData);
        
        return Response.json(responseData);
    } catch (error) {
        console.error("Error in getPredictions: ", error);
        return Response.json({ 
            status: false, 
            message: error instanceof Error ? error.message : 'Internal server error' 
        });
    }
}