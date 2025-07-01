# Survey Schema Analysis & Statistical Fact Sheet System

## Overview
This document outlines a system for automatically analyzing survey schemas and generating statistical fact sheets to overcome LLM token limitations when working with large datasets. The system creates intelligent summaries and enables dynamic query construction based on survey structure.

## Problem Statement

### Current Challenge
- Large survey datasets exceed LLM token limits
- Raw data is inefficient for AI analysis
- Manual statistical analysis is time-consuming
- Cross-demographic insights require complex queries

### Solution Approach
1. **Survey Schema Analysis**: Understand survey structure and question types
2. **Statistical Fact Sheets**: Pre-computed numerical summaries
3. **Dynamic Query Construction**: AI-generated SQL based on user questions
4. **Graceful Fallback**: Pre-computed stats when dynamic queries fail

## System Architecture

### Phase 1: Schema Extraction & Analysis

#### 1.1 Survey Metadata Extraction
```json
{
  "survey_meta": {
    "id": 49,
    "title": "Social Media Use in 2021 (Pew Research - Synthetic)",
    "total_respondents": 200,
    "question_count": 5,
    "demographics_available": ["age", "gender", "race", "education", "location"],
    "response_completion_rate": 100.0,
    "data_quality_score": 0.95
  }
}
```

#### 1.2 Question Schema Analysis
```json
{
  "questions": [
    {
      "id": "platforms_used",
      "type": "text",
      "prompt": "Which social media platforms do you use?",
      "detected_type": "multi_select",
      "detection_confidence": 0.95,
      "unique_values": ["YouTube", "Facebook", "Instagram", "Pinterest", "LinkedIn", "Snapchat", "Twitter", "WhatsApp", "TikTok", "Reddit"],
      "value_count": 10,
      "response_patterns": {
        "array_responses": 180,
        "single_responses": 20,
        "null_responses": 0
      },
      "analysis_potential": {
        "adoption_rates": true,
        "platform_combinations": true,
        "demographic_breakdowns": true,
        "usage_intensity": false
      }
    },
    {
      "id": "daily_usage_hours",
      "type": "text", 
      "prompt": "How many hours per day do you spend on social media?",
      "detected_type": "numeric",
      "detection_confidence": 1.0,
      "data_range": [1, 8],
      "distribution": "normal",
      "mean": 4.2,
      "median": 4.0,
      "analysis_potential": {
        "usage_segmentation": true,
        "demographic_correlations": true,
        "behavioral_patterns": true
      }
    }
  ]
}
```

#### 1.3 Demographic Schema
```json
{
  "demographics": {
    "age": {
      "type": "numeric",
      "range": [18, 85],
      "distribution": {
        "18-29": 26.0,
        "30-49": 24.0, 
        "50-64": 25.5,
        "65+": 24.5
      },
      "analysis_value": "high"
    },
    "gender": {
      "type": "categorical",
      "values": ["Male", "Female"],
      "distribution": {
        "Male": 48.5,
        "Female": 51.5
      },
      "analysis_value": "high"
    },
    "education": {
      "type": "ordinal",
      "values": ["High school or less", "Some college", "College graduate", "Postgraduate"],
      "analysis_value": "medium"
    }
  }
}
```

### Phase 2: Automatic Question Type Detection

#### Detection Methods
1. **Response Pattern Analysis**
   - Array detection: Multiple comma-separated values
   - Numeric detection: All responses are numbers
   - Categorical detection: Limited unique values with repetition
   - Binary detection: Only two distinct values

2. **Statistical Analysis**
   - Value distribution patterns
   - Response length analysis
   - Data type consistency
   - Missing value patterns

#### Detection Rules
```json
{
  "detection_rules": {
    "multi_select": {
      "indicators": ["array_responses > 70%", "avg_values_per_response > 1.5"],
      "confidence_threshold": 0.8
    },
    "numeric": {
      "indicators": ["all_numeric_responses", "range_detected", "statistical_distribution"],
      "confidence_threshold": 0.9
    },
    "likert_scale": {
      "indicators": ["numeric_range_1_to_5", "ordinal_pattern", "response_distribution"],
      "confidence_threshold": 0.85
    },
    "binary": {
      "indicators": ["exactly_2_values", "yes_no_pattern", "true_false_pattern"],
      "confidence_threshold": 0.95
    }
  }
}
```

### Phase 3: Statistical Fact Sheet Generation

#### 3.1 Pre-computed Core Statistics
```json
{
  "core_stats": {
    "response_overview": {
      "total_respondents": 200,
      "completion_rate": 100.0,
      "average_response_time": "8.5 minutes",
      "data_quality_score": 0.95
    },
    "demographic_distribution": {
      "age_groups": {
        "18-29": {"count": 52, "percentage": 26.0},
        "30-49": {"count": 48, "percentage": 24.0},
        "50-64": {"count": 51, "percentage": 25.5},
        "65+": {"count": 49, "percentage": 24.5}
      },
      "gender": {
        "Male": {"count": 97, "percentage": 48.5},
        "Female": {"count": 103, "percentage": 51.5}
      }
    }
  }
}
```

#### 3.2 Question-Specific Statistics
```json
{
  "question_stats": {
    "platforms_used": {
      "platform_adoption": {
        "YouTube": {"users": 165, "percentage": 82.5, "rank": 1},
        "Facebook": {"users": 142, "percentage": 71.0, "rank": 2},
        "Instagram": {"users": 89, "percentage": 44.5, "rank": 3},
        "TikTok": {"users": 67, "percentage": 33.5, "rank": 4}
      },
      "usage_patterns": {
        "average_platforms_per_user": 3.2,
        "single_platform_users": 15,
        "multi_platform_users": 185,
        "heavy_users_5plus": 42
      }
    },
    "daily_usage_hours": {
      "distribution": {
        "1-2_hours": {"count": 45, "percentage": 22.5},
        "3-4_hours": {"count": 78, "percentage": 39.0},
        "5-6_hours": {"count": 52, "percentage": 26.0},
        "7-8_hours": {"count": 25, "percentage": 12.5}
      },
      "statistics": {
        "mean": 4.2,
        "median": 4.0,
        "mode": 3,
        "std_dev": 1.8
      }
    }
  }
}
```

#### 3.3 Cross-Tabulation Analysis
```json
{
  "cross_tabulations": {
    "platform_usage_by_age": {
      "YouTube": {
        "18-29": 95.2,
        "30-49": 91.7,
        "50-64": 82.4,
        "65+": 49.0
      },
      "TikTok": {
        "18-29": 48.1,
        "30-49": 22.9,
        "50-64": 13.7,
        "65+": 4.1
      }
    },
    "privacy_concerns_by_demographics": {
      "by_age": {
        "18-29": {"yes": 67.3, "no": 32.7},
        "65+": {"yes": 78.6, "no": 21.4}
      },
      "by_education": {
        "college_graduate": {"yes": 75.2, "no": 24.8},
        "high_school": {"yes": 58.9, "no": 41.1}
      }
    }
  }
}
```

### Phase 4: Dynamic Query Construction

#### 4.1 Query Mapping System
```json
{
  "query_patterns": {
    "platform_comparison": {
      "trigger_phrases": ["compare platforms", "which platform", "platform differences"],
      "required_data": ["platforms_used"],
      "sql_template": "SELECT platform, COUNT(*) FROM responses WHERE platform IN ({platforms}) GROUP BY platform",
      "demographic_enhancement": true
    },
    "demographic_analysis": {
      "trigger_phrases": ["by age", "gender differences", "education level"],
      "required_data": ["demographics"],
      "sql_template": "SELECT {demographic}, {metric} FROM responses GROUP BY {demographic}",
      "cross_tab_enabled": true
    },
    "usage_intensity": {
      "trigger_phrases": ["heavy users", "usage hours", "time spent"],
      "required_data": ["daily_usage_hours"],
      "sql_template": "SELECT usage_category, COUNT(*) FROM (SELECT CASE WHEN hours > 5 THEN 'heavy' ELSE 'light' END as usage_category FROM responses)",
      "segmentation_enabled": true
    }
  }
}
```

#### 4.2 AI Query Construction Process
1. **Question Analysis**: Parse user question for intent and entities
2. **Schema Mapping**: Match question elements to available survey data
3. **Query Generation**: Construct appropriate SQL based on detected patterns
4. **Validation**: Check if query is feasible with available data
5. **Execution**: Run query and format results
6. **Fallback**: Use pre-computed stats if query fails

### Phase 5: Integration with AI Survey Creator

#### 5.1 Optimized Survey Design
```json
{
  "ai_survey_optimization": {
    "question_recommendations": {
      "topic": "social_media_usage",
      "suggested_questions": [
        {
          "type": "multi_select",
          "prompt": "Which platforms do you use?",
          "options": "standardized_platform_list",
          "analysis_benefit": "Clean adoption rates, cross-platform analysis"
        },
        {
          "type": "numeric_scale",
          "prompt": "Daily usage hours",
          "range": [0, 12],
          "analysis_benefit": "Usage segmentation, intensity analysis"
        }
      ],
      "demographic_recommendations": ["age", "gender", "education"],
      "rationale": "High correlation with platform preferences"
    }
  }
}
```

#### 5.2 Schema Pre-optimization
- **Standardized question types** for better analysis
- **Consistent demographic fields** across surveys
- **Pre-defined response formats** for clean data
- **Built-in statistical templates** ready at survey completion

## Implementation Plan

### Phase 1: Schema Analysis Foundation (Week 1-2)
1. **Database Schema Analysis**
   - Extract survey questions and response patterns
   - Analyze demographic data structure
   - Build question type detection algorithms

2. **Basic Fact Sheet Generation**
   - Core statistics calculation
   - Simple cross-tabulations
   - JSON output format

### Phase 2: Advanced Analytics (Week 3-4)
1. **Enhanced Question Type Detection**
   - Machine learning-based pattern recognition
   - Confidence scoring system
   - Edge case handling

2. **Dynamic Query Construction**
   - Natural language to SQL mapping
   - Query validation and optimization
   - Result formatting and presentation

### Phase 3: AI Survey Integration (Week 5-6)
1. **Survey Creator Enhancement**
   - Question type recommendations
   - Analytics-optimized survey templates
   - Real-time schema analysis

2. **End-to-End Testing**
   - Full pipeline testing with various survey types
   - Performance optimization
   - User experience refinement

## Technical Specifications

### Database Schema Extensions
```sql
-- Survey schema metadata table
CREATE TABLE survey_schemas (
    survey_id INT PRIMARY KEY,
    schema_json JSON,
    fact_sheet_json JSON,
    analysis_metadata JSON,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);

-- Question analysis cache
CREATE TABLE question_analysis (
    question_id INT PRIMARY KEY,
    detected_type VARCHAR(50),
    confidence_score DECIMAL(3,2),
    analysis_metadata JSON,
    unique_values JSON,
    statistical_summary JSON
);
```

### API Endpoints
```javascript
// Schema analysis
GET /api/surveys/{id}/schema
POST /api/surveys/{id}/analyze-schema

// Fact sheet generation  
GET /api/surveys/{id}/fact-sheet
POST /api/surveys/{id}/generate-facts

// Dynamic queries
POST /api/surveys/{id}/query
{
  "question": "How do young people use TikTok compared to older adults?",
  "format": "statistical_summary"
}
```

## Success Metrics

### Phase 1 Success Criteria
- [ ] Accurately detect question types with >90% confidence
- [ ] Generate comprehensive fact sheets for all survey types
- [ ] Reduce LLM token usage by 80% while maintaining insight quality

### Phase 2 Success Criteria  
- [ ] Successfully construct SQL queries for 70% of user questions
- [ ] Provide meaningful fallback responses for failed queries
- [ ] Enable cross-demographic analysis for any survey

### Phase 3 Success Criteria
- [ ] AI survey creator generates analytics-optimized surveys
- [ ] End-to-end pipeline processes new surveys automatically
- [ ] User satisfaction with generated insights >85%

## Risk Mitigation

### Data Quality Risks
- **Detection Accuracy**: Multiple validation methods for question type detection
- **Edge Cases**: Comprehensive testing with various survey formats
- **Data Consistency**: Standardization through AI survey creator

### Performance Risks
- **Query Complexity**: Timeout handling and query optimization
- **Scalability**: Caching strategies for frequently requested statistics
- **Resource Usage**: Efficient SQL generation and execution

### User Experience Risks
- **Query Ambiguity**: Clear error messages and suggestion system
- **Result Interpretation**: Contextual explanations for statistical outputs
- **Fallback Quality**: High-quality pre-computed statistics as backup

## Future Enhancements

### Advanced Analytics
- **Predictive Modeling**: Identify trends and patterns across surveys
- **Sentiment Analysis**: Automated text response analysis
- **Comparative Analysis**: Cross-survey and longitudinal comparisons

### Machine Learning Integration
- **Pattern Recognition**: Improve question type detection with ML
- **Query Optimization**: Learn from successful query patterns
- **Insight Generation**: Automatically surface interesting findings

### Visualization Integration
- **Chart Generation**: Automatic visualization based on data types
- **Interactive Dashboards**: Real-time exploration of survey insights
- **Export Capabilities**: Professional reporting formats

---

**Document Status**: ✅ DESIGN COMPLETE  
**Last Updated**: January 2025  
**Next Phase**: Implementation Planning  
**Priority**: High - Critical for handling large datasets efficiently 