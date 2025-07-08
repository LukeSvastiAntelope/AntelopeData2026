import { NextRequest, NextResponse } from "next/server";
import { CodebookParser, type CodebookParseResult } from '@/app/utils/survey/codebook-parser';

export async function POST(req: NextRequest) {
  try {
    const userIdHeader = req.headers.get('x-user-id');
    if (!userIdHeader) {
      return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 });
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

    console.log(`Processing codebook: ${codebookFile.name} (${codebookFile.size} bytes)`);
    console.log(`Original columns count: ${originalColumns.length}`);

    // Parse the codebook
    const parseResult: CodebookParseResult = await CodebookParser.parseCodebook(codebookFile);
    
    console.log(`Parse result: success=${parseResult.success}, entries=${parseResult.entries.length}`);
    if (parseResult.debugInfo) {
      console.log('Debug info:', JSON.stringify(parseResult.debugInfo, null, 2));
    }
    
    if (!parseResult.success) {
      console.log('Parse errors:', parseResult.errors);
      return NextResponse.json({ 
        status: false, 
        message: 'Failed to parse codebook',
        errors: parseResult.errors,
        debugInfo: parseResult.debugInfo
      }, { status: 400 });
    }

    // Apply codebook mappings to original columns
    const mappings = CodebookParser.applyCodebookMappings(originalColumns, parseResult.entries);
    
    // Validate the codebook format
    const validation = CodebookParser.validateCodebookFormat(parseResult.entries);
    
    // Calculate coverage statistics
    const mappedCount = mappings.filter(m => m.hasMapping).length;
    const totalCount = mappings.length;
    const coveragePercent = Math.round((mappedCount / totalCount) * 100);
    
    console.log(`Coverage: ${mappedCount}/${totalCount} (${coveragePercent}%)`);
    
    const response = {
      status: true,
      codebook: {
        fileName: codebookFile.name,
        totalEntries: parseResult.totalEntries,
        detectedFormat: parseResult.detectedFormat,
        columnMapping: parseResult.columnMapping,
        validation,
        errors: parseResult.errors,
        warnings: parseResult.warnings,
        debugInfo: parseResult.debugInfo
      },
      mappings,
      coverage: {
        mapped: mappedCount,
        total: totalCount,
        percentage: coveragePercent,
        unmappedColumns: mappings.filter(m => !m.hasMapping).map(m => m.originalName)
      }
    };

    return NextResponse.json(response);

  } catch (error) {
    console.error('Error processing codebook:', error);
    return NextResponse.json({ 
      status: false, 
      message: 'Internal server error during codebook processing',
      error: error.message
    }, { status: 500 });
  }
} 