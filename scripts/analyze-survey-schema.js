require('dotenv').config();
const mysql = require('mysql2/promise');

// Database connection (matching the app's connection setup)
const connectionParams = {
    host: process.env.MYSQL_HOST,
    port: parseInt(process.env.MYSQL_PORT || '3306'),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

let pool = null;

const getConnection = async () => {
    if (!pool) {
        pool = mysql.createPool(connectionParams);
    }
    return pool;
};

// Main schema analysis function - can accept existing db connection
const analyzeSurveySchema = async (surveyId, existingDb = null) => {
    let pool = null;
    let db = existingDb;
    
    try {
        console.log(`🔍 Starting schema analysis for survey ${surveyId}...`);
        
        // Get database connection only if not provided
        if (!db) {
            pool = await getConnection();
            db = pool;
        }
        
        // Step 1: Extract survey metadata
        const surveyMeta = await extractSurveyMetadata(db, surveyId);
        console.log(`📊 Survey: "${surveyMeta.title}" with ${surveyMeta.total_respondents} respondents`);
        
        // Step 2: Analyze questions
        const questionsAnalysis = await analyzeQuestions(db, surveyId);
        console.log(`❓ Analyzed ${questionsAnalysis.length} questions`);
        
        // Step 3: Analyze demographics
        const demographicsAnalysis = await analyzeDemographics(db, surveyId);
        console.log(`👥 Analyzed ${Object.keys(demographicsAnalysis).length} demographic fields`);
        
        // Step 4: Generate statistical fact sheet
        const factSheet = await generateFactSheet(db, surveyId, questionsAnalysis, demographicsAnalysis);
        console.log(`📈 Generated fact sheet with ${Object.keys(factSheet.question_stats).length} question analyses`);
        
        // Step 5: Compile complete schema
        const schema = {
            survey_meta: surveyMeta,
            questions: questionsAnalysis,
            demographics: demographicsAnalysis,
            fact_sheet: factSheet,
            analysis_metadata: {
                analyzed_at: new Date().toISOString(),
                version: "1.0",
                total_data_points: surveyMeta.total_respondents * questionsAnalysis.length
            }
        };
        
        console.log(`\n🎉 Schema analysis completed!`);
        console.log(`📋 Summary:`);
        console.log(`   - Questions analyzed: ${questionsAnalysis.length}`);
        console.log(`   - Demographics: ${Object.keys(demographicsAnalysis).length}`);
        console.log(`   - Statistical insights: ${Object.keys(factSheet.question_stats).length}`);
        console.log(`   - Cross-tabulations: ${Object.keys(factSheet.cross_tabulations || {}).length}`);
        
        return schema;
        
    } catch (error) {
        console.error('💥 Schema analysis failed:', error);
        throw error;
    } finally {
        // Only close pool if we created it (not if using existing connection)
        if (pool && !existingDb) {
            await pool.end();
        }
    }
};

// Extract basic survey metadata
const extractSurveyMetadata = async (db, surveyId) => {
    // Get survey details
    const [surveyRows] = await db.execute(`
        SELECT s.*, COUNT(sr.id) as response_count 
        FROM surveys s 
        LEFT JOIN survey_responses sr ON s.id = sr.survey_id 
        WHERE s.id = ? 
        GROUP BY s.id
    `, [surveyId]);
    
    if (!surveyRows[0]) {
        throw new Error(`Survey ${surveyId} not found`);
    }
    
    const survey = surveyRows[0];
    
    // Get question count
    const [questionRows] = await db.execute(`
        SELECT COUNT(*) as question_count 
        FROM survey_questions 
        WHERE survey_id = ?
    `, [surveyId]);
    
    // Analyze demographics availability
    const [responseRows] = await db.execute(`
        SELECT demographics 
        FROM survey_responses 
        WHERE survey_id = ? 
        LIMIT 1
    `, [surveyId]);
    
    let demographicsAvailable = [];
    if (responseRows[0] && responseRows[0].demographics) {
        try {
            const demographics = responseRows[0].demographics;
            const sampleDemo = typeof demographics === 'string' ? JSON.parse(demographics) : demographics;
            demographicsAvailable = Object.keys(sampleDemo);
        } catch (error) {
            console.warn('Could not parse demographics:', error.message);
            demographicsAvailable = [];
        }
    }
    
    return {
        id: survey.id,
        title: survey.title,
        description: survey.description,
        total_respondents: survey.response_count,
        question_count: questionRows[0].question_count,
        demographics_available: demographicsAvailable,
        response_completion_rate: 100.0, // Calculate actual rate later
        data_quality_score: 0.95, // Calculate based on missing values, etc.
        status: survey.status,
        created_at: survey.created_at
    };
};

// Analyze individual questions and detect types
const analyzeQuestions = async (db, surveyId) => {
    // Get all questions for this survey
    const [questions] = await db.execute(`
        SELECT * 
        FROM survey_questions 
        WHERE survey_id = ? 
        ORDER BY question_order ASC
    `, [surveyId]);
    
    const questionsAnalysis = [];
    
    for (const question of questions) {
        console.log(`   🔍 Analyzing question: "${question.prompt}"`);
        
        // Get all responses for this question
        const [responses] = await db.execute(`
            SELECT sa.answer_value 
            FROM survey_answers sa
            JOIN survey_responses sr ON sa.response_id = sr.id
            WHERE sr.survey_id = ? AND sa.question_id = ?
        `, [surveyId, question.id]);
        
        // Analyze response patterns
        const responseAnalysis = analyzeResponsePatterns(responses.map(r => r.answer_value));
        
        let parsedOptions = null;
        if (question.options) {
            try {
                parsedOptions = typeof question.options === 'string' ? JSON.parse(question.options) : question.options;
            } catch (error) {
                console.warn(`Could not parse options for question "${question.prompt}":`, error.message);
                parsedOptions = question.options; // Keep as string if parsing fails
            }
        }

        const questionAnalysis = {
            id: question.id,
            type: question.type,
            prompt: question.prompt,
            options: parsedOptions,
            detected_type: responseAnalysis.detected_type,
            detection_confidence: responseAnalysis.confidence,
            unique_values: responseAnalysis.unique_values,
            value_count: responseAnalysis.unique_values.length,
            response_patterns: responseAnalysis.patterns,
            analysis_potential: determineAnalysisPotential(responseAnalysis),
            statistical_summary: responseAnalysis.statistics
        };
        
        questionsAnalysis.push(questionAnalysis);
    }
    
    return questionsAnalysis;
};

// Analyze response patterns to detect question types
const analyzeResponsePatterns = (responses) => {
    if (!responses || responses.length === 0) {
        return {
            detected_type: 'unknown',
            confidence: 0,
            unique_values: [],
            patterns: {},
            statistics: {}
        };
    }
    
    // Parse responses (handle JSON strings and comma-separated values)
    const parsedResponses = responses.map(r => {
        try {
            // First try JSON parsing
            return typeof r === 'string' ? JSON.parse(r) : r;
        } catch {
            // If JSON parsing fails, check if it's a comma-separated string
            if (typeof r === 'string' && r.includes(',')) {
                return r.split(',').map(item => item.trim());
            }
            return r;
        }
    });
    
    // Count different response patterns
    const arrayResponses = parsedResponses.filter(r => Array.isArray(r)).length;
    const numericResponses = parsedResponses.filter(r => !isNaN(Number(r))).length;
    const stringResponses = parsedResponses.filter(r => typeof r === 'string').length;
    
    // Get unique values
    const uniqueValues = [...new Set(parsedResponses.flatMap(r => 
        Array.isArray(r) ? r : [r]
    ))].filter(v => v !== null && v !== undefined);
    
    // Detection logic
    let detectedType = 'text';
    let confidence = 0.5;
    
    if (arrayResponses > responses.length * 0.7) {
        detectedType = 'multi_select';
        confidence = 0.9;
    } else if (numericResponses > responses.length * 0.8) {
        detectedType = 'numeric';
        confidence = 0.9;
        
        // Check for Likert scale pattern
        const numbers = parsedResponses.map(r => Number(r)).filter(n => !isNaN(n));
        const min = Math.min(...numbers);
        const max = Math.max(...numbers);
        if (min >= 1 && max <= 5 && uniqueValues.length <= 5) {
            detectedType = 'likert_scale';
            confidence = 0.95;
        }
    } else if (uniqueValues.length === 2) {
        detectedType = 'binary';
        confidence = 0.9;
    } else if (uniqueValues.length <= 10 && stringResponses > responses.length * 0.8) {
        detectedType = 'categorical';
        confidence = 0.8;
    }
    
    // Calculate statistics for numeric data
    let statistics = {};
    if (detectedType === 'numeric' || detectedType === 'likert_scale') {
        const numbers = parsedResponses.map(r => Number(r)).filter(n => !isNaN(n));
        if (numbers.length > 0) {
            const mean = numbers.reduce((a, b) => a + b, 0) / numbers.length;
            statistics = {
                mean: parseFloat(mean.toFixed(2)),
                median: numbers.sort((a, b) => a - b)[Math.floor(numbers.length / 2)],
                min: Math.min(...numbers),
                max: Math.max(...numbers),
                std_dev: parseFloat(Math.sqrt(numbers.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / numbers.length).toFixed(2))
            };
        }
    }
    
    return {
        detected_type: detectedType,
        confidence: confidence,
        unique_values: uniqueValues.slice(0, 20), // Limit to first 20 for display
        patterns: {
            array_responses: arrayResponses,
            numeric_responses: numericResponses,
            string_responses: stringResponses,
            null_responses: responses.length - parsedResponses.filter(r => r !== null && r !== undefined).length
        },
        statistics: statistics
    };
};

// Determine what types of analysis are possible for each question
const determineAnalysisPotential = (responseAnalysis) => {
    const potential = {
        adoption_rates: false,
        platform_combinations: false,
        demographic_breakdowns: true, // Always possible with demographics
        usage_intensity: false,
        usage_segmentation: false,
        demographic_correlations: true,
        behavioral_patterns: false
    };
    
    switch (responseAnalysis.detected_type) {
        case 'multi_select':
            potential.adoption_rates = true;
            potential.platform_combinations = true;
            potential.behavioral_patterns = true;
            break;
        case 'numeric':
        case 'likert_scale':
            potential.usage_intensity = true;
            potential.usage_segmentation = true;
            potential.behavioral_patterns = true;
            break;
        case 'binary':
        case 'categorical':
            potential.adoption_rates = true;
            potential.behavioral_patterns = true;
            break;
    }
    
    return potential;
};

// Analyze demographics data
const analyzeDemographics = async (db, surveyId) => {
    // Get all demographics data
    const [responses] = await db.execute(`
        SELECT demographics 
        FROM survey_responses 
        WHERE survey_id = ?
    `, [surveyId]);
    
    if (!responses.length) {
        return {};
    }
    
    // Parse all demographics
    const allDemographics = responses.map(r => {
        try {
            return typeof r.demographics === 'string' ? JSON.parse(r.demographics) : r.demographics;
        } catch (error) {
            console.warn('Could not parse demographics for response:', error.message);
            return {};
        }
    }).filter(d => d && Object.keys(d).length > 0);
    
    // Analyze each demographic field
    const demographicsAnalysis = {};
    const sampleDemo = allDemographics[0];
    
    for (const field of Object.keys(sampleDemo)) {
        if (field === 'source') continue; // Skip metadata fields
        
        const values = allDemographics.map(d => d[field]).filter(v => v !== null && v !== undefined && v !== '');
        
        if (values.length === 0) continue;
        
        const uniqueValues = [...new Set(values)];
        const isNumeric = values.every(v => !isNaN(Number(v)));
        
        let analysis = {
            type: isNumeric ? 'numeric' : 'categorical',
            sample_size: values.length,
            unique_count: uniqueValues.length,
            analysis_value: uniqueValues.length > 1 ? 'high' : 'low'
        };
        
        if (isNumeric) {
            const numbers = values.map(v => Number(v));
            analysis.range = [Math.min(...numbers), Math.max(...numbers)];
            
            // Create age groups for age field
            if (field === 'age') {
                const ageGroups = {
                    '18-29': numbers.filter(n => n >= 18 && n <= 29).length,
                    '30-49': numbers.filter(n => n >= 30 && n <= 49).length,
                    '50-64': numbers.filter(n => n >= 50 && n <= 64).length,
                    '65+': numbers.filter(n => n >= 65).length
                };
                analysis.distribution = Object.fromEntries(
                    Object.entries(ageGroups).map(([group, count]) => [
                        group, 
                        { count, percentage: parseFloat((count / values.length * 100).toFixed(1)) }
                    ])
                );
            }
        } else {
            // Calculate distribution for categorical data
            const distribution = {};
            uniqueValues.forEach(value => {
                const count = values.filter(v => v === value).length;
                distribution[value] = {
                    count,
                    percentage: parseFloat((count / values.length * 100).toFixed(1))
                };
            });
            analysis.distribution = distribution;
            analysis.values = uniqueValues;
        }
        
        demographicsAnalysis[field] = analysis;
    }
    
    return demographicsAnalysis;
};

// Generate comprehensive statistical fact sheet
const generateFactSheet = async (db, surveyId, questionsAnalysis, demographicsAnalysis) => {
    console.log(`📊 Generating statistical fact sheet...`);
    
    const factSheet = {
        core_stats: await generateCoreStats(db, surveyId, demographicsAnalysis),
        question_stats: await generateQuestionStats(db, surveyId, questionsAnalysis)
    };
    
    return factSheet;
};

// Generate core statistics
const generateCoreStats = async (db, surveyId, demographicsAnalysis) => {
    const [responseCount] = await db.execute(`
        SELECT COUNT(*) as total 
        FROM survey_responses 
        WHERE survey_id = ?
    `, [surveyId]);
    
    const coreStats = {
        response_overview: {
            total_respondents: responseCount[0].total,
            completion_rate: 100.0, // Assume 100% for now
            data_quality_score: 0.95
        },
        demographic_distribution: {}
    };
    
    // Add demographic distributions
    Object.entries(demographicsAnalysis).forEach(([field, analysis]) => {
        if (analysis.distribution) {
            coreStats.demographic_distribution[field] = analysis.distribution;
        }
    });
    
    return coreStats;
};

// Generate question-specific statistics
const generateQuestionStats = async (db, surveyId, questionsAnalysis) => {
    const questionStats = {};
    
    for (const question of questionsAnalysis) {
        console.log(`   📈 Generating stats for: ${question.prompt.substring(0, 50)}...`);
        
        // Get responses for this question
        const [responses] = await db.execute(`
            SELECT sa.answer_value 
            FROM survey_answers sa
            JOIN survey_responses sr ON sa.response_id = sr.id
            WHERE sr.survey_id = ? AND sa.question_id = ?
        `, [surveyId, question.id]);
        
        const stats = await analyzeQuestionResponses(question, responses);
        if (stats) {
            // Create a clean question key
            const questionKey = question.prompt.toLowerCase()
                .replace(/[^a-z0-9\s]/g, '')
                .replace(/\s+/g, '_')
                .substring(0, 30);
            
            questionStats[questionKey] = stats;
        }
    }
    
    return questionStats;
};

// Analyze responses for a specific question
const analyzeQuestionResponses = async (question, responses) => {
    if (!responses || responses.length === 0) return null;
    
    const parsedResponses = responses.map(r => {
        try {
            return typeof r.answer_value === 'string' ? JSON.parse(r.answer_value) : r.answer_value;
        } catch {
            // If JSON parsing fails, check if it's a comma-separated string
            if (typeof r.answer_value === 'string' && r.answer_value.includes(',')) {
                return r.answer_value.split(',').map(item => item.trim());
            }
            return r.answer_value;
        }
    });
    
    let stats = {};
    
    if (question.detected_type === 'multi_select') {
        // Platform/option adoption analysis
        const allOptions = parsedResponses.flatMap(r => Array.isArray(r) ? r : [r]);
        const optionCounts = {};
        
        allOptions.forEach(option => {
            if (option && option !== null) {
                optionCounts[option] = (optionCounts[option] || 0) + 1;
            }
        });
        
        const sortedOptions = Object.entries(optionCounts)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 10); // Top 10 options
        
        stats.adoption_rates = Object.fromEntries(
            sortedOptions.map(([option, count], index) => [
                option,
                {
                    users: count,
                    percentage: parseFloat((count / responses.length * 100).toFixed(1)),
                    rank: index + 1
                }
            ])
        );
        
        stats.usage_patterns = {
            average_selections_per_user: parseFloat((allOptions.length / responses.length).toFixed(1)),
            single_selection_users: parsedResponses.filter(r => Array.isArray(r) ? r.length === 1 : true).length,
            multi_selection_users: parsedResponses.filter(r => Array.isArray(r) && r.length > 1).length
        };
        
    } else if (question.detected_type === 'numeric' || question.detected_type === 'likert_scale') {
        // Numeric analysis
        const numbers = parsedResponses.map(r => Number(r)).filter(n => !isNaN(n));
        
        if (numbers.length > 0) {
            const sorted = numbers.sort((a, b) => a - b);
            const mean = numbers.reduce((a, b) => a + b, 0) / numbers.length;
            
            stats.statistics = {
                mean: parseFloat(mean.toFixed(2)),
                median: sorted[Math.floor(sorted.length / 2)],
                min: Math.min(...numbers),
                max: Math.max(...numbers),
                std_dev: parseFloat(Math.sqrt(numbers.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / numbers.length).toFixed(2))
            };
            
            // Create distribution buckets
            const min = Math.min(...numbers);
            const max = Math.max(...numbers);
            const bucketSize = Math.max(1, Math.floor((max - min) / 4));
            
            const distribution = {};
            for (let i = 0; i < 4; i++) {
                const bucketMin = min + (i * bucketSize);
                const bucketMax = i === 3 ? max : min + ((i + 1) * bucketSize) - 1;
                const bucketKey = `${bucketMin}-${bucketMax}_hours`;
                const count = numbers.filter(n => n >= bucketMin && n <= bucketMax).length;
                
                distribution[bucketKey] = {
                    count,
                    percentage: parseFloat((count / numbers.length * 100).toFixed(1))
                };
            }
            
            stats.distribution = distribution;
        }
        
    } else if (question.detected_type === 'binary' || question.detected_type === 'categorical') {
        // Categorical analysis
        const valueCounts = {};
        parsedResponses.forEach(response => {
            if (response && response !== null) {
                valueCounts[response] = (valueCounts[response] || 0) + 1;
            }
        });
        
        stats.distribution = Object.fromEntries(
            Object.entries(valueCounts).map(([value, count]) => [
                value,
                {
                    count,
                    percentage: parseFloat((count / responses.length * 100).toFixed(1))
                }
            ])
        );
    }
    
    return stats;
};

// Run the analysis if called directly
if (require.main === module) {
    const surveyId = process.argv[2] || 49; // Default to Pew Research survey
    
    analyzeSurveySchema(parseInt(surveyId))
        .then(schema => {
            console.log('\n📄 Complete Schema Analysis:');
            console.log(JSON.stringify(schema, null, 2));
        })
        .catch(error => {
            console.error('Analysis failed:', error);
            process.exit(1);
        });
}

module.exports = {
    analyzeSurveySchema,
    extractSurveyMetadata,
    analyzeQuestions,
    analyzeDemographics,
    generateFactSheet
}; 