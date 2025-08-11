export type AvailableField = { name: string; label: string; type: string };

export function extractAvailableFields(surveyData: any): AvailableField[] {
  if (!surveyData) return [];

  const fields: AvailableField[] = [];

  const commonDemographics = [
    { name: 'age', label: 'Age', type: 'demographic' },
    { name: 'gender', label: 'Gender', type: 'demographic' },
    { name: 'location', label: 'Location', type: 'demographic' },
    { name: 'occupation', label: 'Occupation', type: 'demographic' },
    { name: 'education', label: 'Education', type: 'demographic' },
    { name: 'income', label: 'Income', type: 'demographic' },
  ];

  fields.push(...commonDemographics);

  if (surveyData.questions) {
    surveyData.questions.forEach((question: any, index: number) => {
      const fieldName = question.field_name || `question_${index + 1}`;
      const label = question.prompt || question.title || `Question ${index + 1}`;
      const shortLabel = label.length > 30 ? label.substring(0, 30) + '...' : label;

      fields.push({ name: fieldName, label: shortLabel, type: question.type || 'question' });
    });
  }

  return fields;
}



