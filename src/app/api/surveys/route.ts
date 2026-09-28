import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from '@/app/utils/auth/require-user';
import { SurveyRepo } from "@/app/utils/database/survey-repo";
import { verifyConfirmationToken } from "@/app/utils/api/token";
import {
  assertSupportAllowsMutation,
  resolveSupportSession,
} from '@/app/utils/auth/support-session';
import { getConnection } from '@/app/utils/database/db';
import { isSuperAdminEmail } from '@/app/utils/auth/super-admin';
import { UserRepo } from '@/app/utils/database/user-repo';

// GET /api/surveys - surveys created by current user + featured examples
// Admin A4: support session returns the target campaign's org surveys (read-first).
export async function GET(req: NextRequest) {
  const auth = requireUserId(req);
  if (typeof auth !== 'string') return auth;
  const userId = Number(auth);
  console.log('Fetching surveys for user ID:', userId);
  
  try {
    const support = await resolveSupportSession(req, { actorUserId: userId });
    if (support) {
      const user = await UserRepo.getUserById(String(userId));
      if (user && isSuperAdminEmail(user.email)) {
        const db = await getConnection();
        const [rows]: any = await db.execute(
          `SELECT s.*, COUNT(sr.id) as response_count, o.name as organization_name
           FROM surveys s
           LEFT JOIN survey_responses sr ON s.id = sr.survey_id
           LEFT JOIN organizations o ON s.organization_id = o.id
           WHERE s.organization_id = ?
              OR s.created_by IN (
                SELECT user_id FROM organization_members
                WHERE organization_id = ? AND status = 'active'
              )
           GROUP BY s.id
           ORDER BY s.created_at DESC`,
          [support.targetOrganizationId, support.targetOrganizationId]
        );
        const editable = support.mode === 'write';
        const surveys = (rows || []).map((s: any) => ({
          id: s.id,
          title: s.title,
          description: s.description,
          slug: s.slug,
          status: s.status,
          is_public: s.is_public,
          created_at: s.created_at,
          response_count: s.response_count || 0,
          source: s.source || 'native',
          source_metadata: s.source_metadata || null,
          start_at: s.start_at,
          end_at: s.end_at,
          organization_id: s.organization_id || support.targetOrganizationId,
          organization_name:
            s.organization_name || support.targetOrganizationName,
          survey_type: 'org',
          is_featured: false,
          is_editable: editable,
        }));
        return NextResponse.json({
          status: true,
          surveys,
          supportSession: {
            active: true,
            mode: support.mode,
            sessionId: support.id,
          },
        });
      }
    }

    // Check if user wants only their own surveys or all (including featured)
    const { searchParams } = new URL(req.url);
    const includeFeatures = searchParams.get('featured') !== 'false'; // Default to true
    
    if (includeFeatures) {
      // Get user surveys + featured examples
      const { userSurveys, featuredSurveys, orgSurveys, allSurveys } = await SurveyRepo.getSurveysForUser(userId);
      
      console.log('Found surveys for user:', userSurveys.length);
      console.log('Found org surveys:', orgSurveys.length);
      console.log('Found featured surveys:', featuredSurveys.length);
      
      // Format all surveys with proper categorization
      const surveysWithFullData = allSurveys.map((s: any) => ({
        id: s.id,
        title: s.title,
        description: s.description,
        slug: s.slug,
        status: s.status,
        is_public: s.is_public,
        created_at: s.created_at,
        response_count: s.response_count || 0,
        source: s.source || 'native',
        source_metadata: s.source_metadata || null,
        start_at: s.start_at,
        end_at: s.end_at,
        organization_id: s.organization_id || null,
        organization_name: s.organization_name || null,
        survey_type: s.survey_type, // 'own', 'org', or 'featured'
        is_featured: s.survey_type === 'featured',
        is_editable: s.survey_type === 'own' || s.survey_type === 'org'
      }));
      
      return NextResponse.json({ 
        status: true, 
        surveys: surveysWithFullData,
        categorized: {
          userSurveys: userSurveys.map((s: any) => ({
            id: s.id,
            title: s.title,
            description: s.description,
            slug: s.slug,
            status: s.status,
            is_public: s.is_public,
            created_at: s.created_at,
            response_count: s.response_count || 0,
            source: s.source || 'native',
            source_metadata: s.source_metadata || null,
            start_at: s.start_at,
            end_at: s.end_at,
            survey_type: 'own',
            is_featured: false,
            is_editable: true
          })),
          orgSurveys: orgSurveys.map((s: any) => ({
            id: s.id,
            title: s.title,
            description: s.description,
            slug: s.slug,
            status: s.status,
            is_public: s.is_public,
            created_at: s.created_at,
            response_count: s.response_count || 0,
            source: s.source || 'native',
            source_metadata: s.source_metadata || null,
            start_at: s.start_at,
            end_at: s.end_at,
            organization_id: s.organization_id,
            organization_name: s.organization_name,
            survey_type: 'org',
            is_featured: false,
            is_editable: true
          })),
          featuredSurveys: featuredSurveys.map((s: any) => ({
            id: s.id,
            title: s.title,
            description: s.description,
            slug: s.slug,
            status: s.status,
            is_public: s.is_public,
            created_at: s.created_at,
            response_count: s.response_count || 0,
            source: s.source || 'native',
            source_metadata: s.source_metadata || null,
            start_at: s.start_at,
            end_at: s.end_at,
            survey_type: 'featured',
            is_featured: true,
            is_editable: false
          }))
        }
      });
    } else {
      // Original behavior - only user's own surveys
      const surveys = await SurveyRepo.getSurveysByCreator(userId);
      console.log('Found surveys for user:', surveys.length);
      console.log('Survey titles:', surveys.map((s: any) => s.title));
      
      const surveysWithFullData = surveys.map((s:any) => ({
        id: s.id,
        title: s.title,
        description: s.description,
        slug: s.slug,
        status: s.status,
        is_public: s.is_public,
        created_at: s.created_at,
        response_count: s.response_count || 0,
        source: s.source || 'native',
        source_metadata: s.source_metadata || null,
        start_at: s.start_at,
        end_at: s.end_at,
        survey_type: 'own',
        is_featured: false,
        is_editable: true
      }));
      
      return NextResponse.json({ status:true, surveys: surveysWithFullData });
    }
  } catch (err) {
    console.error('Error fetching user surveys', err);
    return NextResponse.json({ status:false, message:'Internal error' }, { status:500 });
  }
}

// POST /api/surveys - Create new survey
export async function POST(req: NextRequest) {
    try {
        // Get user ID from the request (set by middleware)
        const auth = requireUserId(req);
        if (typeof auth !== 'string') return auth;
        const userId = Number(auth);

        const blocked = await assertSupportAllowsMutation(req, userId, {
          path: '/api/surveys',
          method: 'POST',
        });
        if (blocked) return blocked;

        const body = await req.json();
        
        // Basic validation
        if (!body.title || !body.questions || !Array.isArray(body.questions)) {
            return NextResponse.json({ 
                error: 'Missing required fields: title, questions' 
            }, { status: 400 });
        }

        if (body.questions.length === 0) {
            return NextResponse.json({ 
                error: 'At least one question is required' 
            }, { status: 400 });
        }

        // If organizationId is provided, verify user is a member
        if (body.organizationId) {
            const { openSql } = await import('@/app/utils/database/db');
            const db = await openSql();
            const [membership]: any = await db.execute(
                `SELECT role FROM organization_members WHERE organization_id = ? AND user_id = ? AND status = 'active'`,
                [body.organizationId, parseInt(userId)]
            );
            if (!membership || membership.length === 0) {
                return NextResponse.json({ 
                    error: 'You are not a member of the selected organization' 
                }, { status: 403 });
            }
            // Viewers can't create surveys for an org
            if (membership[0].role === 'viewer') {
                return NextResponse.json({ 
                    error: 'Viewers cannot create surveys for an organization' 
                }, { status: 403 });
            }
        }

        // Create the survey
        const result = await SurveyRepo.createSurvey(body, parseInt(userId));
        
        // Get the created survey to return the actual slug
        const survey = await SurveyRepo.getSurveyById(result, parseInt(userId));
        
        return NextResponse.json({ 
            status: true, 
            id: result,
            slug: (survey as any)?.slug,
            message: 'Survey created successfully' 
        }, { status: 201 });

    } catch (error) {
        console.error("Error in POST /api/surveys:", error);
        return NextResponse.json({ 
            status: false, 
            message: error instanceof Error ? error.message : 'Internal server error' 
        }, { status: 500 });
    }
} 