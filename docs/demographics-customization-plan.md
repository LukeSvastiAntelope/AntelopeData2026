# Demographics Customization Plan

## Overview
This document outlines the implementation plan for allowing survey creators to customize demographics collection in their surveys. The system will support both simple (pre-defined) and advanced (custom) demographic configurations.

## Current State Analysis
- Survey system exists with AI-generated survey creation
- Demographics partially implemented (migration file exists: `20240614_add_demographic_columns.sql`)
- Digital twins system connected to survey responses
- User authentication with role-based access
- Survey creators and responders with response storage

## Requirements

### Functional Requirements
1. **Survey creators** can choose between simple and advanced demographics modes
2. **Simple mode**: Select from pre-defined demographic fields
3. **Advanced mode**: Create custom demographic fields with various input types
4. **Survey responders** can add, edit, and remove their demographic information
5. **Flexible field types**: text, select, multi-select, number ranges, dates, boolean
6. **Validation rules**: configurable per field
7. **Privacy controls**: clear consent and opt-in/opt-out mechanisms

### Non-Functional Requirements
- **Performance**: Fast loading of demographic forms
- **Scalability**: Support for surveys with high response volumes
- **Privacy**: GDPR compliance and data protection
- **Usability**: Intuitive interface for both creators and responders
- **Integration**: Seamless integration with existing digital twins system

## Technical Architecture

### Database Schema Changes

#### New Tables
```sql
-- Pre-defined demographic templates
CREATE TABLE demographic_templates (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  field_type VARCHAR(50) NOT NULL, -- 'text', 'select', 'number', 'date', 'boolean'
  options JSONB, -- For select fields
  validation_rules JSONB,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Survey-specific demographic configuration
CREATE TABLE survey_demographics_config (
  id SERIAL PRIMARY KEY,
  survey_id INTEGER REFERENCES surveys(id) ON DELETE CASCADE,
  mode VARCHAR(20) NOT NULL, -- 'simple' or 'advanced'
  selected_templates JSONB, -- Array of template IDs for simple mode
  custom_fields JSONB, -- Custom field definitions for advanced mode
  is_required BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Demographic responses (flexible JSON storage)
CREATE TABLE survey_demographic_responses (
  id SERIAL PRIMARY KEY,
  survey_response_id INTEGER REFERENCES survey_responses(id) ON DELETE CASCADE,
  demographic_data JSONB NOT NULL,
  consent_given BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

#### Indexes
```sql
CREATE INDEX idx_survey_demographics_config_survey_id ON survey_demographics_config(survey_id);
CREATE INDEX idx_demographic_responses_survey_response_id ON survey_demographic_responses(survey_response_id);
CREATE INDEX idx_demographic_data_gin ON survey_demographic_responses USING GIN (demographic_data);
```

### API Endpoints

#### Demographics Templates
- `GET /api/demographics/templates` - Fetch available simple demographics
- `POST /api/admin/demographics/templates` - Create new template (admin only)
- `PUT /api/admin/demographics/templates/{id}` - Update template (admin only)
- `DELETE /api/admin/demographics/templates/{id}` - Delete template (admin only)

#### Survey Demographics Configuration
- `GET /api/surveys/{id}/demographics/config` - Get survey's demographic configuration
- `POST /api/surveys/{id}/demographics/config` - Create demographic configuration
- `PUT /api/surveys/{id}/demographics/config` - Update demographic configuration
- `DELETE /api/surveys/{id}/demographics/config` - Remove demographic configuration

#### Demographics Responses
- `GET /api/surveys/{slug}/demographics` - Get demographic requirements for responders
- `POST /api/surveys/{slug}/demographics/response` - Submit demographic response
- `PUT /api/surveys/{slug}/demographics/response/{responseId}` - Update demographic response
- `GET /api/surveys/{id}/demographics/analytics` - Get demographic analytics (creator only)

### Frontend Components

#### Survey Creator Interface
- **DemographicsConfigModal**: Main configuration interface
- **SimpleModeSelector**: Checkbox selection of pre-defined fields
- **AdvancedModeBuilder**: Drag-and-drop custom field builder
- **FieldTypeSelector**: Component for selecting field types
- **ValidationRulesEditor**: Interface for setting validation rules
- **DemographicsPreview**: Preview how demographics will appear to responders

#### Survey Responder Interface
- **DemographicsForm**: Dynamic form based on survey configuration
- **FieldRenderer**: Renders different field types dynamically
- **ConsentCheckbox**: Privacy consent component
- **ProgressIndicator**: Shows completion progress
- **SaveDraftButton**: Allows saving partial responses

#### Analytics Interface
- **DemographicsAnalytics**: Dashboard showing demographic breakdowns
- **CrossTabulation**: Cross-reference demographics with survey responses
- **ExportControls**: Export options with demographic filters
- **PrivacyControls**: Anonymization options for exports

## Implementation Phases

### Phase 1: Foundation (Week 1-2)
- [ ] Database schema implementation
- [ ] Basic API endpoints for templates and configuration
- [ ] Simple demographics templates seeding
- [ ] Unit tests for core functionality

### Phase 2: Simple Demographics Mode (Week 3-4)
- [ ] Simple mode UI for survey creators
- [ ] Pre-defined demographics selection interface
- [ ] Basic demographic response collection
- [ ] Integration with existing survey creation flow

### Phase 3: Advanced Demographics Mode (Week 5-6)
- [ ] Custom field builder interface
- [ ] Field type components (text, select, number, etc.)
- [ ] Validation rules configuration
- [ ] Dynamic form rendering for responders

### Phase 4: User Experience & Analytics (Week 7-8)
- [ ] Demographics preview functionality
- [ ] Response editing capabilities for survey responders
- [ ] Basic analytics dashboard
- [ ] Export functionality with demographic filters

### Phase 5: Privacy & Compliance (Week 9-10)
- [ ] Consent management system
- [ ] Data anonymization features
- [ ] GDPR compliance tools (data deletion, portability)
- [ ] Privacy policy integration

### Phase 6: Integration & Polish (Week 11-12)
- [ ] Digital twins integration
- [ ] Performance optimizations
- [ ] Advanced analytics features
- [ ] User testing and refinements

## Pre-defined Demographics Templates

### Basic Demographics
- **Age**: Number range (18-100)
- **Gender**: Select (Male, Female, Non-binary, Prefer not to say, Other)
- **Location**: Text (City, State/Province, Country)
- **Education**: Select (High School, Bachelor's, Master's, PhD, Other)
- **Employment Status**: Select (Employed, Unemployed, Student, Retired, Self-employed)
- **Income Range**: Select (predefined ranges)

### Extended Demographics
- **Industry**: Select (Technology, Healthcare, Finance, Education, etc.)
- **Company Size**: Select (1-10, 11-50, 51-200, 201-1000, 1000+)
- **Years of Experience**: Number range
- **Language**: Multi-select
- **Household Size**: Number
- **Marital Status**: Select

## Data Privacy & Security

### Privacy Controls
- **Explicit Consent**: Clear opt-in for demographic collection
- **Granular Control**: Responders can choose which demographics to share
- **Data Minimization**: Only collect necessary demographic data
- **Retention Policies**: Configurable data retention periods

### Security Measures
- **Encryption**: Sensitive demographic data encrypted at rest
- **Access Control**: Role-based access to demographic data
- **Audit Logging**: Track access to demographic information
- **Anonymization**: Remove identifying information from analytics

### GDPR Compliance
- **Right to Access**: Users can view their demographic data
- **Right to Rectification**: Users can edit their demographic responses
- **Right to Erasure**: Users can delete their demographic data
- **Data Portability**: Export demographic data in machine-readable format

## Integration Points

### Digital Twins System
- Incorporate demographic data into digital twin profiles
- Use demographics for enhanced matching and recommendations
- Maintain demographic consistency across survey responses

### Survey Analytics
- Cross-reference survey responses with demographics
- Demographic segmentation in analytics dashboards
- Export capabilities with demographic breakdowns

### Email Service
- Demographic-based email targeting for survey invitations
- Personalized follow-up based on demographic segments

## Success Metrics

### Usage Metrics
- Percentage of surveys using demographics collection
- Average number of demographic fields per survey
- Response rates for surveys with vs. without demographics

### Quality Metrics
- Completion rates for demographic sections
- Data quality scores (completeness, accuracy)
- User satisfaction scores for demographics experience

### Technical Metrics
- API response times for demographic endpoints
- Database query performance for demographic analytics
- Error rates in demographic data processing

## Risk Mitigation

### Technical Risks
- **Performance**: Implement caching and optimization for large datasets
- **Data Integrity**: Comprehensive validation and error handling
- **Scalability**: Design for horizontal scaling of demographic data

### Privacy Risks
- **Data Breach**: Implement strong encryption and access controls
- **Compliance**: Regular audits and compliance checks
- **User Trust**: Transparent privacy policies and data usage explanations

### User Experience Risks
- **Complexity**: Progressive disclosure and intuitive interfaces
- **Survey Fatigue**: Optional demographics and clear value proposition
- **Accessibility**: WCAG compliance for all demographic interfaces

## Future Enhancements

### Advanced Features
- **AI-Powered Demographics**: Suggest relevant demographics based on survey content
- **Dynamic Demographics**: Conditional demographics based on previous responses
- **Demographic Matching**: Match survey responders based on demographic similarity

### Integration Opportunities
- **CRM Integration**: Sync demographic data with external CRM systems
- **Analytics Platforms**: Export to advanced analytics tools
- **Research Tools**: Integration with academic research platforms

## Conclusion

This plan provides a comprehensive roadmap for implementing customizable demographics in the survey system. The phased approach ensures manageable development cycles while building toward a robust, privacy-compliant, and user-friendly demographics collection system.

The implementation will enhance the value of survey data while respecting user privacy and providing flexibility for both survey creators and responders. 