import { openSql as getMySQLConnection } from './db';
import { RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import {
    DemographicTemplateDB,
    DemographicTemplate,
    SurveyDemographicsConfigDB,
    SurveyDemographicsConfig
} from '../interface';

function mapTemplate(row: DemographicTemplateDB): DemographicTemplate {
    return {
        id: row.id,
        fieldName: row.field_name,
        fieldType: row.field_type,
        fieldLabel: row.field_label,
        fieldOptions: row.field_options ?? undefined,
        validationRules: row.validation_rules ?? undefined,
        category: row.category,
        sortOrder: row.sort_order,
        isActive: !!row.is_active,
        helpText: row.help_text ?? undefined,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

function mapConfig(row: SurveyDemographicsConfigDB): SurveyDemographicsConfig {
    return {
        surveyId: row.survey_id,
        demographicType: row.demographic_type,
        selectedFields: typeof row.selected_fields === 'string' ? JSON.parse(row.selected_fields) : row.selected_fields,
        isRequired: !!row.is_required,
        consentText: row.consent_text ?? undefined,
    };
}

export const DemographicsRepo = {
    /**
     * Fetch all active demographic templates ordered by category & sort_order
     */
    getActiveTemplates: async (): Promise<DemographicTemplate[]> => {
        const db = await getMySQLConnection();
        const [rows] = await db.execute<RowDataPacket[]>(
            `SELECT * FROM demographic_templates WHERE is_active = 1 ORDER BY category, sort_order`
        );
        // @ts-ignore – rows comes back as any[] when using RowDataPacket
        return rows.map(mapTemplate);
    },

    /**
     * Retrieve a survey's demographics configuration, if any.
     */
    getSurveyConfig: async (surveyId: number): Promise<SurveyDemographicsConfig | null> => {
        const db = await getMySQLConnection();
        const [rows] = await db.execute<RowDataPacket[]>(
            `SELECT * FROM survey_demographics_config WHERE survey_id = ? LIMIT 1`,
            [surveyId]
        );
        if (!rows[0]) return null;
        // @ts-ignore
        return mapConfig(rows[0]);
    },

    /**
     * Insert or update a survey's demographics configuration.
     */
    upsertSurveyConfig: async (surveyId: number, config: SurveyDemographicsConfig) => {
        const db = await getMySQLConnection();
        const selectedFieldsJson = JSON.stringify(config.selectedFields);
        await db.execute<ResultSetHeader>(
            `INSERT INTO survey_demographics_config (survey_id, demographic_type, selected_fields, is_required, consent_text)
             VALUES (?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE demographic_type = VALUES(demographic_type), selected_fields = VALUES(selected_fields), is_required = VALUES(is_required), consent_text = VALUES(consent_text)`,
            [
                surveyId,
                config.demographicType,
                selectedFieldsJson,
                config.isRequired ? 1 : 0,
                config.consentText ?? null,
            ]
        );
    },
}; 