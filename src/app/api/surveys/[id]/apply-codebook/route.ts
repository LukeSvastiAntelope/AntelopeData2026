import { NextRequest, NextResponse } from "next/server";
import { CodebookParser, type CodebookParseResult } from '@/app/utils/survey/codebook-parser';
import { openSql } from '@/app/utils/database/db';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const userIdHeader = req.headers.get('x-user-id');
    if (!userIdHeader) {
      return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 });
    }

    const surveyId = parseInt(id);
    const formData = await req.formData();
    const codebookFile = formData.get('codebook') as File;
    
    if (!codebookFile) {
      return NextResponse.json({ 
        status: false, 
        message: 'No codebook file provided' 
      }, { status: 400 });
    }

    console.log(`Applying codebook to survey ${surveyId}: ${codebookFile.name}`);

    // Parse the codebook
    const parseResult: CodebookParseResult = await CodebookParser.parseCodebook(codebookFile);
    
    if (!parseResult.success) {
      return NextResponse.json({ 
        status: false, 
        message: 'Failed to parse codebook',
        errors: parseResult.errors 
      }, { status: 400 });
    }

    // Get current survey questions
    const db = await openSql();
    const [questionsResult] = await db.execute(
      'SELECT id, prompt, question_order FROM survey_questions WHERE survey_id = ? ORDER BY question_order ASC',
      [surveyId]
    );
    const questions = questionsResult as any[];

    console.log(`Found ${questions.length} questions to potentially update`);

    // Create mapping from variable names to question text
    const variableMapping: Record<string, string> = {};
    for (const entry of parseResult.entries) {
      variableMapping[entry.variableName] = entry.questionText;
      // Also create lowercase mapping for case-insensitive lookup
      variableMapping[entry.variableName.toLowerCase()] = entry.questionText;
    }

    console.log(`Created ${Object.keys(variableMapping).length / 2} variable mappings`);

    // Update questions
    let updatedCount = 0;
    const updates = [];

    for (const question of questions) {
      const originalPrompt = question.prompt;
      const newPrompt = variableMapping[originalPrompt] || 
                       variableMapping[originalPrompt.toLowerCase()];
      
      if (newPrompt && newPrompt !== originalPrompt) {
        updates.push({
          id: question.id,
          order: question.question_order,
          from: originalPrompt,
          to: newPrompt
        });

        // Update the question prompt
        await db.execute(
          'UPDATE survey_questions SET prompt = ? WHERE id = ?',
          [newPrompt, question.id]
        );
        
        updatedCount++;
      }
    }

    console.log(`Updated ${updatedCount} questions with codebook mappings`);

    // Calculate coverage
    const totalQuestions = questions.length;
    const coveragePercent = Math.round((updatedCount / totalQuestions) * 100);

    const response = {
      status: true,
      result: {
        surveyId,
        totalQuestions,
        updatedQuestions: updatedCount,
        coveragePercent,
        codebookEntries: parseResult.entries.length,
        updates: updates.slice(0, 10), // Show first 10 updates as examples
        summary: `Successfully updated ${updatedCount} of ${totalQuestions} questions (${coveragePercent}% coverage)`
      }
    };

    return NextResponse.json(response);

  } catch (error) {
    console.error('Error applying codebook:', error);
    return NextResponse.json({ 
      status: false, 
      message: 'Internal server error while applying codebook',
      error: error.message
    }, { status: 500 });
  }
} 