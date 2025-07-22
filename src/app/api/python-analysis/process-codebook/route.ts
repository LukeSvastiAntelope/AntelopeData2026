import { NextRequest, NextResponse } from "next/server";
import { auth } from '@/auth';
import { CodebookParser, type CodebookParseResult } from '@/app/utils/survey/codebook-parser';

export async function POST(req: NextRequest) {
  try {
    // Check authentication
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ 
        status: false, 
        message: 'Unauthorized' 
      }, { status: 401 });
    }

    const formData = await req.formData();
    const codebookFile = formData.get('codebook') as File;
    const originalColumnsStr = formData.get('originalColumns') as string;
    
    if (!codebookFile) {
      return NextResponse.json({ 
        status: false, 
        message: 'No codebook file provided' 
      }, { status: 400 });
    }

    if (!originalColumnsStr) {
      return NextResponse.json({ 
        status: false, 
        message: 'No original columns provided' 
      }, { status: 400 });
    }

    let originalColumns: string[];
    try {
      originalColumns = JSON.parse(originalColumnsStr);
    } catch (error) {
      return NextResponse.json({ 
        status: false, 
        message: 'Invalid original columns format' 
      }, { status: 400 });
    }

    console.log(`[Python Analysis] Processing codebook: ${codebookFile.name} (${codebookFile.size} bytes)`);
    console.log(`[Python Analysis] Original columns count: ${originalColumns.length}`);

    // Parse the codebook using the existing parser
    const parseResult: CodebookParseResult = await CodebookParser.parseCodebook(codebookFile);
    
    console.log(`[Python Analysis] Parse result: success=${parseResult.success}, entries=${parseResult.entries.length}`);
    
    if (!parseResult.success) {
      console.log('[Python Analysis] Parse errors:', parseResult.errors);
      return NextResponse.json({ 
        status: false, 
        message: 'Failed to parse codebook',
        errors: parseResult.errors,
        debugInfo: parseResult.debugInfo
      }, { status: 400 });
    }

    // Apply codebook mappings to original columns
    const mappings = CodebookParser.applyCodebookMappings(originalColumns, parseResult.entries);
    
    // Calculate coverage statistics
    const mappedCount = mappings.filter(m => m.hasMapping).length;
    const totalCount = mappings.length;
    const coveragePercent = Math.round((mappedCount / totalCount) * 100);
    
    console.log(`[Python Analysis] Coverage: ${mappedCount}/${totalCount} (${coveragePercent}%)`);
    
    // Transform mappings to the format expected by the Python analysis system
    const pythonAnalysisMappings = mappings
      .filter(m => m.hasMapping)
      .map(m => {
        // Find the original codebook entry for additional details
        const entry = parseResult.entries.find(e => 
          e.variableName === m.originalName || 
          e.variableName.toLowerCase() === m.originalName.toLowerCase()
        );
        
        return {
          variableName: m.originalName,
          questionText: m.mappedName || m.originalName,
          valueLabels: m.valueLabels || {},
          description: entry?.description || undefined
        };
      });

    const response = {
      status: true,
      codebook: {
        fileName: codebookFile.name,
        totalEntries: parseResult.totalEntries,
        detectedFormat: parseResult.detectedFormat,
        columnMapping: parseResult.columnMapping,
        errors: parseResult.errors,
        warnings: parseResult.warnings
      },
      mappings: pythonAnalysisMappings,
      coverage: {
        mapped: mappedCount,
        total: totalCount,
        percentage: coveragePercent,
        unmappedColumns: mappings.filter(m => !m.hasMapping).map(m => m.originalName)
      },
      warnings: parseResult.warnings || []
    };

    console.log(`[Python Analysis] Successfully processed codebook: ${coveragePercent}% coverage`);
    return NextResponse.json(response);

  } catch (error) {
    console.error('[Python Analysis] Error processing codebook:', error);
    return NextResponse.json({ 
      status: false, 
      message: 'Internal server error during codebook processing',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
} 