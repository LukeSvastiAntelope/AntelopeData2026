import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { createCompletion } from '@/app/utils/services/ai-service';

interface StepCodeRequest {
  step: {
    id: string;
    type: 'explore' | 'analyze' | 'visualize' | 'synthesize' | 'verify';
    description: string;
    dependencies?: string[];
    priority: number;
    estimated_complexity: 'low' | 'medium' | 'high';
  };
  context: {
    question: string;
    dataset_info: {
      columns: string[];
      types: Record<string, string>;
      sample_data: any[];
      codebook_mappings?: Record<string, any>;
    };
    discovered_variables: Record<string, string[]>;
    key_findings: string[];
    current_hypothesis: string[];
    gaps_identified: string[];
  };
  executedSteps: Array<{
    step: any;
    code: string;
    output: string;
    success: boolean;
    insights: string[];
  }>;
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const request: StepCodeRequest = await req.json();
    
    const systemPrompt = `You are an expert Python data analyst. Generate focused, executable code for a specific analysis step.

PYODIDE REQUIREMENTS:
- Use only: pandas, numpy, matplotlib (scipy sparingly)
- Dataset is pre-loaded as 'df'
- Write simple, direct code without nested try/except
- Use basic pandas operations only (no complex groupby)
- Include clear print statements to show results
- Avoid indentation issues - write clean, flat code structure

CRITICAL DATA VALIDATION:
- ALWAYS check if filtered data is empty before analysis: if filtered_df.empty: print("No data found for this filter")
- ALWAYS convert numeric columns before statistical operations: pd.to_numeric(df[col], errors='coerce')
- ALWAYS drop NaN values before correlation/statistical analysis: df.dropna(subset=[col1, col2])
- ALWAYS check column existence: if 'column_name' in df.columns:
- ALWAYS validate data types before operations: print(f"Data types: {df.dtypes}")
- NEVER perform operations on empty datasets - add explicit checks

ERROR PREVENTION:
- Print data shape and non-null counts before analysis: print(f"Data shape: {df.shape}, Non-null values: {df.count()}")
- Show actual column names: print(f"Available columns: {list(df.columns)}")
- Validate filter results: print(f"Filtered data size: {filtered_df.shape[0]} rows")
- Use .fillna(0) or .dropna() before statistical operations
- Check for sufficient data: if len(unique_values) < 2: print("Insufficient variation for analysis")

STATISTICAL OPERATIONS SAFETY:
- Before correlation: ensure both columns are numeric and have >1 unique value
- Before mean/median: check if column has numeric data after conversion
- Before groupby: verify grouping column exists and has valid values
- Always include sample sizes in results: print(f"Analysis based on N={len(data)} observations")

VISUALIZATION REQUIREMENTS:
- ALWAYS include matplotlib visualizations when analyzing data
- BEFORE plotting, ALWAYS print() the exact data being plotted (the counts, the
  crosstab, the computed series) so every charted number is visible in the text
  output and can be verified. A chart alone (with no printed numbers) is not enough.

PROFESSIONAL STYLING (Neutral Theme):
- Import and use seaborn for modern aesthetics: import seaborn as sns; sns.set_style("whitegrid")
- Use neutral grayscale palette: sns.color_palette("gray") or ["#2d3748", "#4a5568", "#718096", "#a0aec0"]
- Optimal figure sizing: plt.figure(figsize=(12, 8)) for single plots, plt.figure(figsize=(15, 6)) for wide comparisons
- Enhanced typography: plt.rcParams.update({'font.size': 12, 'font.weight': 'normal'})
- Better spacing: plt.tight_layout(pad=3.0) for adequate margins

CHART QUALITY:
- Clear, descriptive titles with context: "Gender Differences in Driving Opinions (N=156)"
- Informative axis labels with units where applicable
- Legends positioned optimally (avoid overlapping data)
- Neutral grayscale colors: dark gray (#2d3748) for primary, lighter grays for secondary data
- Grid styling: subtle, non-intrusive (already handled by seaborn whitegrid)
- Data labels on bars/points when space permits

CHART TYPES & BEST PRACTICES:
- Bar charts: Use sns.barplot() with confidence intervals for group comparisons
- Distributions: Use sns.histplot() with kde=True for smooth distributions  
- Correlations: Use sns.scatterplot() with regression lines (sns.regplot())
- Heatmaps: Use sns.heatmap() with annot=True and appropriate colormap
- Multiple categories: Use sns.catplot() or sns.FacetGrid() for clean layouts

OUTPUT REQUIREMENTS:
- Call plt.tight_layout(pad=3.0) before plt.show()
- Always call plt.show() to display the visualization
- Charts must directly illustrate key findings and support the analysis goal

STEP CONTEXT:
- Step Type: ${request.step.type}
- Description: ${request.step.description}
- Complexity: ${request.step.estimated_complexity}
- Main Question: ${request.context.question}

DATASET INFO:
- Columns (${request.context.dataset_info.columns.length} total): ${request.context.dataset_info.columns.join(', ')}

SURVEY DATA STRUCTURE — read carefully:
- Each row in df is ONE real survey respondent. Columns named Q1, Q2, ... map to
  survey questions (see codebook below); demo_* columns are demographics.
- SINGLE-CHOICE questions store the chosen option as a plain text label
  (e.g. df['Q7'] == 'White or European American'). Match on the EXACT label from
  the codebook options.
- MULTIPLE-CHOICE ("select all that apply") questions are encoded TWO ways:
  (1) the original Qn column is a comma-joined string of the selected options, and
  (2) one binary 0/1 INDICATOR column per option (see "indicatorColumns" in the
  codebook), e.g. Q1_Vanilla == 1 means the respondent selected Vanilla.
  -> For membership, counts, cross-tabs, chi-square, or regression on a
  multiple-choice question, ALWAYS use the 0/1 indicator columns. NEVER run
  value_counts() on the raw multi-select column (it buckets each combination).
- For the RELATIONSHIP between two questions, build pd.crosstab(...) and run
  scipy.stats.chi2_contingency on it; print the contingency table, chi2, p-value,
  dof, and Cramér's V (V = sqrt(chi2 / (n * (min(r,c)-1)))). For race x a flavor,
  crosstab race (Q7) against the flavor indicator (e.g. Q1_Vanilla).

ANTI-HALLUCINATION RULES (mandatory):
- Every number you report MUST come from code executed on df. NEVER invent,
  estimate, assume, or round-from-memory any count, percentage, or statistic.
- Always PRINT the raw computed objects (the crosstab, the value counts, the
  chi2 result) so the numbers are visible and verifiable.
- If a filter yields 0 rows or a column is missing, print that fact — do not
  fabricate a plausible-looking result.

${request.context.dataset_info.codebook_mappings ? `
**CODEBOOK (column -> question, type, options, and multi-select indicator columns):**
${JSON.stringify(request.context.dataset_info.codebook_mappings, null, 2)}

**CRITICAL**: Use the exact column names and value labels from this codebook. To map the user's natural-language question to variables, read each question's text and pick the matching column(s).
` : 'No codebook mappings available - working with raw column names only.'}

PREVIOUS CONTEXT:
${request.executedSteps.length > 0 ? `
Recent Steps Completed:
${request.executedSteps.map((step, i) => `
${i + 1}. ${step.step.description}
   Success: ${step.success}
   Key Output: ${step.output.substring(0, 150)}...
   Insights: ${step.insights.join('; ')}
`).join('\n')}

Current Findings:
${request.context.key_findings.map((finding, i) => `${i + 1}. ${finding}`).join('\n')}
` : 'This is the first step in the analysis.'}

CODE GENERATION PRINCIPLES:
1. **Single Purpose**: Focus only on this specific step
2. **Build on Previous**: Use insights from completed steps
3. **Professional Visual First**: Always include publication-quality seaborn charts with proper styling
4. **Clear Output**: Print descriptive results and progress with context
5. **Pyodide Compatible**: Use simple, robust operations (pandas, matplotlib, seaborn)
6. **Chart Excellence**: Every visualization must be professionally styled, clearly labeled, and directly support insights
7. **Visual Impact**: Charts should be immediately interpretable and visually appealing
8. **Data Validation**: ALWAYS validate data before operations to prevent NaN/empty results
9. **Error Prevention**: Include explicit checks for data existence and validity`;

    let userPrompt = '';

    switch (request.step.type) {
      case 'explore':
        userPrompt = `Generate Python code to explore the dataset with MANDATORY visualizations.

${request.context.dataset_info.codebook_mappings ? `
**WITH CODEBOOK AVAILABLE** - Focus on:
- Print dataset shape and column names  
- Extract and display actual survey questions from the codebook
- Show question text for key variables
- Create bar charts showing distribution of key categorical variables
- Display sample value labels (e.g., 1=Male, 2=Female)
- Visualize missing data patterns if any
` : `
**WITHOUT CODEBOOK** - Focus on:
- Print dataset shape and column names
- Create histograms for numeric columns
- Create bar charts for categorical columns
- Show data type distributions visually
- Simple data exploration with charts
`}

REQUIRED PROFESSIONAL VISUALIZATIONS:
- Start with: import seaborn as sns; sns.set_style("whitegrid"); plt.rcParams.update({'font.size': 12})
- Create 1-2 professional seaborn charts showing data distributions
- Use sns.barplot() or sns.histplot() with appealing color palettes
- Figure sizing: plt.figure(figsize=(12, 8)) for clear readability
- Descriptive titles with sample size: "Dataset Overview (N=XXX)" 
- Proper axis labels and legends
- Call plt.tight_layout(pad=3.0) before plt.show()

STYLING REQUIREMENTS:
- Use neutral colors: sns.color_palette("gray") or custom ["#2d3748", "#4a5568", "#718096", "#a0aec0"]
- Include data labels on bars when space permits
- Professional typography and spacing
- Charts must be publication-quality and immediately interpretable

Requirements:
- Direct code, no try/except blocks
- Use pandas + seaborn for professional visualizations
- Include both print statements AND styled charts
- Maximum 25 lines of code (including visualization setup)

Return ONLY executable Python code.`;
        break;

      case 'analyze':
        userPrompt = `Generate Python code to perform statistical analysis with MANDATORY visualizations.

Focus on:
- Computing relevant statistics for the identified variables
- Performing correlation analysis or statistical tests
- Calculating key metrics that answer the main question
- Building on findings from exploration steps

CRITICAL: DATA VALIDATION FIRST
\`\`\`python
# ALWAYS start with these validation steps:
print(f"Dataset shape: {df.shape}")
print(f"Available columns: {list(df.columns)}")
print(f"Data types:\\n{df.dtypes}")

# For numeric analysis, convert and validate:
# numeric_col = pd.to_numeric(df['column_name'], errors='coerce')
# valid_data = df.dropna(subset=['col1', 'col2'])
# if valid_data.empty:
#     print("No valid data for analysis")
# else:
#     print(f"Valid data for analysis: {len(valid_data)} rows")
\`\`\`

STATISTICAL OPERATIONS:
- NEVER calculate correlation on empty or single-value data
- ALWAYS check: if len(data.dropna()) < 2: print("Insufficient data for correlation")
- For group comparisons: ALWAYS verify groups exist and have data
- Include sample sizes in all results: f"Mean = {mean:.2f} (N={count})"

REQUIRED PROFESSIONAL VISUALIZATIONS for Analysis:
- Setup: import seaborn as sns; sns.set_style("whitegrid"); plt.rcParams.update({'font.size': 12})
- Use sns.barplot() with confidence intervals for categorical comparisons
- Use sns.scatterplot() with regression lines for correlations  
- Use sns.boxplot() or sns.violinplot() for distribution comparisons
- Use sns.heatmap(annot=True, cmap='RdYlBu_r') for correlation matrices
- Figure sizing: plt.figure(figsize=(12, 8)) or (15, 6) for wide comparisons

PROFESSIONAL STYLING:
- Neutral color palette: sns.color_palette("gray") for categorical, "gray" for continuous data
- Descriptive titles with statistical context: "Gender Differences in Opinion (p<0.05, N=156)"
- Include statistical annotations (p-values, effect sizes) when relevant
- Proper axis labels with units
- Call plt.tight_layout(pad=3.0) before plt.show()

ANALYSIS EXAMPLES:
- Group comparisons: sns.barplot() with error bars + significance markers
- Correlations: sns.scatterplot() + sns.regplot() with R² annotation
- Distributions: sns.histplot() with kde=True for smooth curves

ERROR PREVENTION TEMPLATE:
\`\`\`python
# Check if columns exist
if 'target_col' in df.columns and 'group_col' in df.columns:
    # Convert to numeric if needed
    df['target_col'] = pd.to_numeric(df['target_col'], errors='coerce')
    
    # Remove missing values
    clean_data = df.dropna(subset=['target_col', 'group_col'])
    
    if not clean_data.empty and len(clean_data['group_col'].unique()) > 1:
        # Proceed with analysis
        print(f"Analysis based on {len(clean_data)} valid observations")
    else:
        print("Insufficient data for meaningful analysis")
else:
    print("Required columns not found")
\`\`\`

Return executable Python code (25-35 lines max including professional styling and validation).`;
        break;

      case 'visualize':
        userPrompt = `Generate Python code to create comprehensive visualizations.

Focus on:
- Creating multiple complementary charts that tell a complete story
- Visualizing key relationships identified in previous analysis steps
- Using appropriate chart types for different data aspects
- Including proper labels, titles, and legends
- Making insights immediately clear to stakeholders

ADVANCED PROFESSIONAL VISUALIZATIONS:
- Setup: import seaborn as sns; sns.set_style("whitegrid"); plt.rcParams.update({'font.size': 12})
- Create multi-panel layouts with fig, axes = plt.subplots(2, 2, figsize=(16, 12))
- Use consistent neutral color schemes across all subplots: sns.color_palette("gray")
- Dashboard-style layouts showing different perspectives of the data
- Professional subplot titles and overall figure title (fig.suptitle())

MULTI-CHART REQUIREMENTS:
- Each subplot should use seaborn functions (sns.barplot, sns.scatterplot, etc.)
- Consistent styling across all charts in the layout
- Clear subplot titles that build a narrative
- Appropriate chart types for each data aspect being shown
- Color-coded categories with shared legends where possible

LAYOUT EXAMPLES:
- 2x2 grid: Overview + Demographics + Correlations + Key Finding
- Side-by-side comparisons with sns.catplot(col="variable")
- Multi-category breakdowns using sns.FacetGrid()
- Summary dashboard combining different chart types

PROFESSIONAL FINISHING:
- fig.suptitle() for overall title with context and sample size
- plt.tight_layout(pad=4.0) for proper spacing in multi-plot layouts
- Consistent color palettes and fonts across all subplots
- Clear narrative flow from subplot to subplot

Return comprehensive Python code (30-45 lines max including multi-chart layout).`;
        break;

      case 'synthesize':
        userPrompt = `Generate Python code to synthesize findings with a SUMMARY visualization.

Focus on:
- Summarizing key findings from all previous steps
- Identifying the strongest evidence for/against relationships
- Quantifying the strength of relationships found
- Providing clear answers to the main question

REQUIRED PUBLICATION-READY SUMMARY VISUALIZATION:
- Setup: import seaborn as sns; sns.set_style("whitegrid"); plt.rcParams.update({'font.size': 14, 'font.weight': 'bold'})
- Create ONE definitive chart that answers the main question
- Use sns.barplot() or sns.pointplot() for clear comparisons with confidence intervals
- Figure sizing: plt.figure(figsize=(14, 8)) for maximum impact and readability
- Neutral color palette: ["#2d3748", "#4a5568", "#718096"] for professional grayscale appearance

SUMMARY CHART REQUIREMENTS:
- Clear, compelling title with key finding: "Women Rate Driving Safety 23% Higher Than Men (p<0.001)"
- Statistical annotations directly on the chart (percentages, p-values, effect sizes)
- Data labels on bars/points showing exact values
- Professional typography with larger, bold fonts for final presentation
- Minimal but informative - focus on the single most important finding

PUBLICATION QUALITY:
- sns.despine() to remove unnecessary chart borders
- Strategic use of neutral grays to highlight key differences
- Clear legend and axis labels appropriate for stakeholder presentation
- Include sample size and significance in title or subtitle
- Call plt.tight_layout(pad=3.0) before plt.show()

Return focused, executable Python code (20-30 lines max including publication styling).`;
        break;

      case 'verify':
        userPrompt = `Generate Python code to verify or validate previous findings.

Focus on:
- Double-checking key calculations
- Testing alternative approaches
- Validating assumptions made in previous steps
- Confirming the robustness of conclusions

Return concise, executable Python code (10-20 lines max).`;
        break;
    }

    const completion = await createCompletion({
      model: 'gpt-4o-mini', // Fast model for focused code generation
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.2,
      maxTokens: 800
    });

    let code = completion.content?.trim() || '';
    
    // Clean up any markdown formatting
    if (code.startsWith('```python')) {
      code = code.replace(/^```python\s*/, '').replace(/```\s*$/, '');
    } else if (code.startsWith('```')) {
      code = code.replace(/^```\s*/, '').replace(/```\s*$/, '');
    }

    // Add step identification comment
    const stepComment = `# STEP: ${request.step.type.toUpperCase()} - ${request.step.description}\n`;
    code = stepComment + code;

    // Don't add automatic try/except wrapping - let the code be direct and simple

    console.log(`Generated ${code.split('\n').length} lines of code for step: ${request.step.description}`);

    return NextResponse.json({
      code,
      model: 'gpt-4o-mini',
      step_id: request.step.id
    });

  } catch (error) {
    console.error('Step code generation error:', error);
    return NextResponse.json({ 
      error: 'Failed to generate step code' 
    }, { status: 500 });
  }
} 