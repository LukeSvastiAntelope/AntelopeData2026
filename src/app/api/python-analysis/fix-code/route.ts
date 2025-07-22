import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { createCompletion } from '@/app/utils/services/ai-service';

interface CodeFixRequest {
  originalCode: string;
  errorMessage: string;
  dataSchema: {
    columns: string[];
    types: Record<string, string>;
    sampleData: any[];
  };
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const request: CodeFixRequest = await req.json();
    
    const systemPrompt = `You are an expert Python debugger specializing in data analysis with Pyodide. Your job is to fix broken Python code.

AVAILABLE ENVIRONMENT:
- Pyodide (browser-based Python)
- pandas, numpy, matplotlib, scipy
- Dataset available as 'df'
- Columns: ${request.dataSchema.columns.join(', ')}

COMMON PYODIDE ISSUES:
1. Missing imports (always add: import pandas as pd, import numpy as np, import matplotlib.pyplot as plt)
2. Variable name errors (check actual column names)
3. Data type issues (use simple operations)
4. Complex operations that fail (simplify)
5. Plotting errors (add try/except around plt.show())

FIXES TO APPLY:
- Add missing imports
- Fix variable names using actual column names
- Simplify complex operations
- Add error handling
- Use basic pandas operations only`;

    const userPrompt = `Fix this broken Python code:

ORIGINAL CODE:
\`\`\`python
${request.originalCode}
\`\`\`

ERROR MESSAGE:
${request.errorMessage}

REQUIREMENTS:
1. Fix the specific error mentioned
2. Keep the same analysis intent
3. Use only simple pandas operations
4. Add proper error handling
5. Include debug print statements

Return ONLY the fixed Python code, no explanations.`;

    const completion = await createCompletion({
      model: 'gpt-4o-mini', // Fast model for quick fixes
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.1,
      maxTokens: 800
    });

    let fixedCode = completion.content?.trim() || '';
    
    // Clean up any markdown formatting
    if (fixedCode.startsWith('```python')) {
      fixedCode = fixedCode.replace(/^```python\s*/, '').replace(/```\s*$/, '');
    } else if (fixedCode.startsWith('```')) {
      fixedCode = fixedCode.replace(/^```\s*/, '').replace(/```\s*$/, '');
    }

    return NextResponse.json({
      fixedCode,
      model: 'gpt-4o-mini'
    });

  } catch (error) {
    console.error('Code fix error:', error);
    return NextResponse.json({ 
      error: 'Failed to fix code' 
    }, { status: 500 });
  }
} 