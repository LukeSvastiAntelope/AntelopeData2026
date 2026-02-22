import { SetStateAction } from "react";

import { Dispatch } from "react";

export interface IPlatformAccount {
    platform_id: number;
    platform: string;
}

export interface IAgentProfile {
    id: number;
    name: string;
    description: string;
    image: string;
    interests: string[];
    principles: string;
    riskLevel: string;
    user_id: number;
    category: string;
    sport_preference?: string;
    maxTimelineLimit: number;
    wallet_balance: number;
    nft_address: string;
    trainCount: number;
    train_index: string;
    ipfs_hash?: string;
    platform_accounts: IPlatformAccount[];
    role?: "user" | "admin";
    model: string;
    plugins: string[];
    username?: string;
    created_at?: string;
    updated_at?: string;
    temperature?: number;
    top_p?: number;
    max_tokens?: number;
    frequency_penalty?: number;
    presence_penalty?: number;
    system_prompt?: string;
    telegram_chat_id?: string;
    telegram_username?: string;
    telegram_first_name?: string;
    telegram_last_name?: string;
    telegram_photo_url?: string;
    is_telegram_connected?: boolean;
    is_onboarded?: boolean;
}

export interface IFormDataAgentProfile {
    id: number;
    user_id: number;
    name: string;
    description: string;
    interests: string;
    riskLevel: string;
    principles: string;
    image: string;
    maxTimelineLimit: number;
    category: string;
    model: string;
    plugins: string;
    is_onboarded?: boolean;
}

export interface IPrinciple {
    title: string;
    description: string;
}

export interface UserDB {
    id: number;
    telegram_id: string;
    username: string;
    email: string;
    display_name: string;
    wallet_balance: number;
    total_winnings: number;
    escrow_balance: number;
    password: string;
    is_verified: number;
    is_first_login: number;
    role: "user" | "admin";
}

export interface UserOrganization {
    id: number;
    name: string;
    officeType: string | null;
    state: string | null;
    districtCode: string | null;
    candidateName: string | null;
    party: 'D' | 'R' | 'I' | 'L' | 'G' | 'O' | null;
    electionYear: number | null;
}

export interface AgentDB {
    id: number;
    name: string;
    description: string;
    image: string;
    interests: string | string[];
    principles: string;
    riskLevel: string;
    user_id: number;
    category: string;
    maxTimelineLimit: number;
    wallet_balance: number;
    nft_address: string;
    trainCount: number;
    train_index: string;
    ipfs_hash?: string;
    platform_accounts: IPlatformAccount[];
    role?: "user" | "admin";
    model: string;
    plugins: string | string[];
    username?: string;
}

export interface PaymentIntentDB {
    id: number;
    payment_id: string;
    user_id: number;
    platform_id: number;
    agent_id: number;
    amount: number;
    credit_amount: number;
    payment_method: string;
    from_address: string;
    status: string;
    expires_at: string;
}

export interface IAskAgentProps {
    agentProfile: IAgentProfile | null;
    setAgentProfile: Dispatch<SetStateAction<IAgentProfile | null>>;
}

export interface ChatMessage {
    role: "user" | "agent";
    content: string | React.ReactNode;
    type: "training" | "ask" | "strategy";
}

export interface IAgentContext {
    agent: IAgentProfile | null;
    setAgent: Dispatch<SetStateAction<IAgentProfile | null>>;
    user: UserDB | null;
    setUser: Dispatch<SetStateAction<UserDB | null>>;
    organization: UserOrganization | null;
    isAgentProfileLoading: boolean;
    setIsAgentProfileLoading: Dispatch<SetStateAction<boolean>>;
}

// ===== SURVEY & DIGITAL-TWIN INTERFACES =====

export type QuestionType = 'text' | 'single-choice' | 'multiple-choice' | 'rating' | 'yes-no' | 'email' | 'number';
export type SurveyStatus = 'draft' | 'scheduled' | 'active' | 'published' | 'closed' | 'archived';
export type EnrichmentStatus = 'pending' | 'processing' | 'completed' | 'failed';
export type AnonymityLevel = 'full' | 'semi_anonymous' | 'anonymous';
export type DemographicCategory = 'full_profile' | 'partial_profile' | 'minimal_profile' | 'imported_synthetic' | 'anonymous_profile';

export interface SurveyDB {
    id: number;
    title: string;
    description: string;
    slug: string;
    created_by: number;
    is_public: boolean;
    anonymity_level: AnonymityLevel;
    demographics_required: boolean;
    created_at: string;
    updated_at: string;
    start_at?: string | null;
    end_at?: string | null;
    archived_at?: string | null;
    status: SurveyStatus;
    // Tracking poll / wave support
    parent_survey_id?: number | null;
    wave_number?: number | null;
}

export interface SurveyQuestionDB {
    id: number;
    survey_id: number;
    type: QuestionType;
    prompt: string;
    options: string[] | null; // JSON parsed to array
    is_required: boolean;
    question_order: number;
    created_at: string;
}

export interface SurveyResponseDB {
    id: number;
    survey_id: number;
    responder_id: number | null;
    submitted_at: string;
    demographics: Record<string, any>; // JSON parsed
    anonymity_level: AnonymityLevel;
    ip_address: string;
    user_agent: string;
}

export interface SurveyAnswerDB {
    id: number;
    response_id: number;
    question_id: number;
    answer_value: string;
    created_at: string;
}

export interface ResponderAgentDB {
    id: number;
    base_profile: Record<string, any>; // JSON parsed
    enrichment_status: EnrichmentStatus;
    created_from_response_id: number;
    completion_percentage: number;
    demographic_category: DemographicCategory;
    agent_token: string;
    created_at: string;
    updated_at: string;
    last_queried_at: string | null;
    query_count: number;
}

export interface AgentQueryDB {
    id: number;
    responder_agent_id: number;
    query_text: string;
    response_text: string;
    queried_by: number | null;
    created_at: string;
    response_time_ms: number;
}

// Frontend interfaces (cleaner versions)
export interface Survey {
    id: number;
    title: string;
    description: string;
    slug: string;
    createdBy: number;
    isPublic: boolean;
    anonymityLevel: AnonymityLevel;
    demographicsRequired: boolean;
    createdAt: string;
    updatedAt: string;
    startAt?: string;
    endAt?: string;
    archivedAt?: string;
    status: SurveyStatus;
    questions?: SurveyQuestion[];
    responseCount?: number;
}

export interface SurveyQuestion {
    id: number;
    surveyId: number;
    type: QuestionType;
    prompt: string;
    options?: string[];
    isRequired: boolean;
    order: number;
}

export interface SurveyResponse {
    id: number;
    surveyId: number;
    responderId?: number;
    submittedAt: string;
    demographics: Record<string, any>;
    answers: SurveyAnswer[];
}

export interface SurveyAnswer {
    id: number;
    responseId: number;
    questionId: number;
    value: string;
}

export interface ResponderAgent {
    id: number;
    baseProfile: Record<string, any>;
    enrichmentStatus: EnrichmentStatus;
    createdFromResponseId: number;
    completionPercentage: number;
    demographicCategory: DemographicCategory;
    agentToken: string;
    createdAt: string;
    updatedAt: string;
    lastQueriedAt?: string;
    queryCount: number;
}

// Form interfaces for creating/editing
export interface CreateSurveyInput {
    title: string;
    description: string;
    isPublic: boolean;
    questions: CreateQuestionInput[];
}

export interface CreateQuestionInput {
    type: QuestionType;
    prompt: string;
    options?: string[];
    isRequired: boolean;
    order: number;
}

export interface SubmitSurveyInput {
    surveyId: number;
    demographics: Record<string, any>;
    answers: SubmitAnswerInput[];
}

export interface SubmitAnswerInput {
    questionId: number;
    value: string;
}

export interface QueryAgentInput {
    agentToken: string;
    query: string;
}

export interface QueryAgentResponse {
    response: string;
    responseTimeMs: number;
    agentProfile: Record<string, any>;
}

// At the end before export statements or near other DB interfaces, add CohortDB and Cohort types
export interface CohortDB {
    id: number;
    name: string;
    description?: string;
    filter_json: Record<string, any>[]; // JSON parsed array of filter rules
    visibility: 'private' | 'org' | 'public';
    created_by: number;
    survey_id?: number; // Optional survey association
    created_at: string;
    updated_at: string;
}

export interface Cohort {
    id: number;
    name: string;
    description?: string;
    filter: CohortFilterRule[];
    visibility: 'private' | 'org' | 'public';
    createdBy: number;
    surveyId?: number; // Optional survey association
    createdAt: string;
    updatedAt: string;
}

export interface CohortFilterRule {
    field: string;
    op: '=' | 'IN' | 'CONTAINS';
    value: string | string[];
}

export interface DemographicTemplateDB {
    id: number;
    field_name: string;
    field_type: 'text' | 'select' | 'multi-select' | 'number' | 'date' | 'boolean' | 'rating';
    field_label: string;
    field_options: any | null; // JSON parsed array or null
    validation_rules: any | null; // JSON parsed rules
    category: 'basic' | 'professional' | 'personal' | 'social';
    sort_order: number;
    is_active: boolean;
    help_text?: string;
    created_at: string;
    updated_at: string;
}

export interface DemographicTemplate {
    id: number;
    fieldName: string;
    fieldType: 'text' | 'select' | 'multi-select' | 'number' | 'date' | 'boolean' | 'rating';
    fieldLabel: string;
    fieldOptions?: any[];
    validationRules?: Record<string, any>;
    category: 'basic' | 'professional' | 'personal' | 'social';
    sortOrder: number;
    isActive: boolean;
    helpText?: string;
    createdAt: string;
    updatedAt: string;
}

export interface SurveyDemographicsConfigDB {
    id: number;
    survey_id: number;
    demographic_type: 'simple' | 'advanced';
    selected_fields: any; // JSON parsed array or config
    is_required: boolean;
    consent_text?: string | null;
    created_at: string;
    updated_at: string;
}

export interface SurveyDemographicsConfig {
    surveyId: number;
    demographicType: 'simple' | 'advanced';
    selectedFields: number[] | any; // IDs or full field config
    isRequired: boolean;
    consentText?: string | null;
}

export interface CustomDemographicFieldDB {
    id: number;
    survey_id: number;
    field_name: string;
    field_type: 'text' | 'select' | 'multi-select' | 'number' | 'date' | 'boolean' | 'rating';
    field_label: string;
    field_options: any | null;
    validation_rules: any | null;
    sort_order: number;
    is_required: boolean;
    help_text?: string;
    created_at: string;
}

export interface SurveyDemographicResponseDB {
    id: number;
    survey_response_id: number;
    field_name: string;
    field_value: any; // JSON parsed value
    field_type: 'text' | 'select' | 'multi-select' | 'number' | 'date' | 'boolean' | 'rating';
    created_at: string;
}

// ===== ANONYMITY SYSTEM INTERFACES =====

export interface SurveyAnonymityAuditDB {
    id: number;
    survey_id: number;
    old_anonymity_level: AnonymityLevel | null;
    new_anonymity_level: AnonymityLevel;
    changed_by: number;
    change_reason?: string;
    changed_at: string;
}

export interface AnonymityConfiguration {
    level: AnonymityLevel;
    fieldsToCollect: string[];
    fieldsToExclude: string[];
    description: string;
    privacyNote: string;
}

export interface DigitalTwinAnalytics {
    demographic_category: DemographicCategory;
    twin_count: number;
    avg_completion: number;
    min_completion: number;
    max_completion: number;
    high_quality_count: number;
    medium_quality_count: number;
    low_quality_count: number;
}

export interface CompletionCalculationResult {
    percentage: number;
    category: DemographicCategory;
    missingFields: string[];
    availableFields: string[];
}

// Demographics form variants for different anonymity levels
export interface DemographicsFormConfig {
    anonymityLevel: AnonymityLevel;
    requiredFields: string[];
    optionalFields: string[];
    excludedFields: string[];
    privacyNotice: string;
    consentText?: string;
}

// =====================================================================
// ORGANIZATION / TEAM TYPES
// =====================================================================

export type OrgRole = 'owner' | 'admin' | 'analyst' | 'viewer';
export type OrgMemberStatus = 'pending' | 'active' | 'removed';

export interface OrganizationDB {
    id: number;
    name: string;
    slug: string;
    description: string | null;
    created_by: number;
    created_at: string;
    updated_at: string;
}

export interface OrganizationMemberDB {
    id: number;
    organization_id: number;
    user_id: number;
    role: OrgRole;
    invited_by: number | null;
    invited_at: string;
    accepted_at: string | null;
    status: OrgMemberStatus;
}

export interface OrganizationActivityDB {
    id: number;
    organization_id: number;
    user_id: number;
    action: string;
    resource_type: string | null;
    resource_id: number | null;
    details: any;
    created_at: string;
}