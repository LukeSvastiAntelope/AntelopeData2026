import { NextRequest, NextResponse } from "next/server";
import { SurveyRepo } from "@/app/utils/database/survey-repo";
import { verifyConfirmationToken } from "@/app/utils/api/token";

// GET /api/surveys - surveys created by current user + featured examples
export async function GET(req: NextRequest) {
  const userIdHeader = req.headers.get('x-user-id');
  if (!userIdHeader) {
    return NextResponse.json({ status:false, message:'Unauthorized' }, { status:401 });
  }
  const userId = Number(userIdHeader);
  console.log('Fetching surveys for user ID:', userId);
  
  try {
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
        const userId = req.headers.get('x-user-id');
        
        if (!userId) {
            return NextResponse.json({ 
                error: 'User not authenticated' 
            }, { status: 401 });
        }

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