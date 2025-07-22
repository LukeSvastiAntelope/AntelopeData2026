import { CodebookEntry } from './codebook-parser';

export interface StandardMapping {
  variableName: string;
  questionText: string;
  valueLabels?: Record<string, string>;
  description?: string;
}

export class AutoCodebookGenerator {
  
  /**
   * Generate codebook entries for detected survey standards
   */
  static generateForStandard(standardName: string, availableColumns: string[]): CodebookEntry[] {
    switch (standardName) {
      case 'Pew Research Center':
        return this.generatePewResearchCodebook(availableColumns);
      default:
        return [];
    }
  }

  /**
   * Generate Pew Research standard mappings
   */
  private static generatePewResearchCodebook(availableColumns: string[]): CodebookEntry[] {
    const pewMappings: StandardMapping[] = [
      // Core Demographics
      {
        variableName: 'F_GENDER',
        questionText: 'Gender',
        valueLabels: {
          '1': 'Male',
          '2': 'Female',
          '99': 'Refused'
        }
      },
      {
        variableName: 'F_AGECAT',
        questionText: 'Age Category',
        valueLabels: {
          '1': '18-29',
          '2': '30-49', 
          '3': '50-64',
          '4': '65+',
          '99': 'Refused'
        }
      },
      {
        variableName: 'F_EDUCCAT',
        questionText: 'Education Level',
        valueLabels: {
          '1': 'Less than high school',
          '2': 'High school graduate',
          '3': 'Some college',
          '4': 'College graduate+',
          '99': 'Refused'
        }
      },
      {
        variableName: 'F_EDUCCAT2',
        questionText: 'Education Level (Detailed)',
        valueLabels: {
          '1': 'Less than high school',
          '2': 'High school graduate',
          '3': 'Some college',
          '4': 'Associate degree',
          '5': 'Bachelor degree',
          '6': 'Graduate degree',
          '99': 'Refused'
        }
      },
      {
        variableName: 'F_RACECMB',
        questionText: 'Race/Ethnicity',
        valueLabels: {
          '1': 'White, non-Hispanic',
          '2': 'Black, non-Hispanic',
          '3': 'Other, non-Hispanic',
          '4': 'Hispanic',
          '5': 'Asian, non-Hispanic',
          '99': 'Refused'
        }
      },
      {
        variableName: 'F_PARTY',
        questionText: 'Party Affiliation',
        valueLabels: {
          '1': 'Republican',
          '2': 'Democrat',
          '3': 'Independent',
          '4': 'Something else',
          '99': 'Refused'
        }
      },
      {
        variableName: 'F_IDEO',
        questionText: 'Political Ideology',
        valueLabels: {
          '1': 'Very conservative',
          '2': 'Conservative',
          '3': 'Moderate',
          '4': 'Liberal',
          '5': 'Very liberal',
          '99': 'Refused'
        }
      },
      {
        variableName: 'F_INCOME',
        questionText: 'Household Income',
        valueLabels: {
          '1': 'Less than $30,000',
          '2': '$30,000-$49,999',
          '3': '$50,000-$74,999',
          '4': '$75,000-$99,999',
          '5': '$100,000+',
          '99': 'Refused'
        }
      },
      {
        variableName: 'F_MARITAL',
        questionText: 'Marital Status',
        valueLabels: {
          '1': 'Married',
          '2': 'Living with partner',
          '3': 'Divorced',
          '4': 'Separated',
          '5': 'Widowed',
          '6': 'Never married',
          '99': 'Refused'
        }
      },
      {
        variableName: 'F_EMPLOY',
        questionText: 'Employment Status',
        valueLabels: {
          '1': 'Full-time',
          '2': 'Part-time',
          '3': 'Not employed for pay',
          '4': 'Retired',
          '99': 'Refused'
        }
      }
    ];

    // Common response scales
    const likertScales = {
      importance4: {
        '1': 'Very important',
        '2': 'Somewhat important',
        '3': 'Not too important',
        '4': 'Not at all important',
        '99': 'Refused'
      },
      agreement4: {
        '1': 'Strongly agree',
        '2': 'Somewhat agree',
        '3': 'Somewhat disagree',
        '4': 'Strongly disagree',
        '99': 'Refused'
      },
      satisfaction4: {
        '1': 'Very satisfied',
        '2': 'Somewhat satisfied',
        '3': 'Somewhat dissatisfied',
        '4': 'Very dissatisfied',
        '99': 'Refused'
      },
      frequency4: {
        '1': 'Very often',
        '2': 'Sometimes',
        '3': 'Hardly ever',
        '4': 'Never',
        '99': 'Refused'
      },
      yesNo: {
        '1': 'Yes',
        '2': 'No',
        '99': 'Refused'
      },
      comparison5: {
        '1': 'Much better',
        '2': 'Somewhat better',
        '3': 'About the same',
        '4': 'Somewhat worse',
        '5': 'Much worse',
        '99': 'Refused'
      }
    };

    // Convert standard mappings to codebook entries, but only for available columns
    const entries: CodebookEntry[] = pewMappings
      .filter(mapping => availableColumns.includes(mapping.variableName))
      .map(mapping => ({
        variableName: mapping.variableName,
        questionText: mapping.questionText,
        valueLabels: mapping.valueLabels,
        description: mapping.description
      }));

    // Add common scale mappings for other columns that match patterns
    availableColumns.forEach(columnName => {
      // Skip if already mapped
      if (entries.some(e => e.variableName === columnName)) return;

      // Apply common scales based on column patterns
      if (columnName.includes('IMPORTANT') || columnName.includes('IMP_')) {
        entries.push({
          variableName: columnName,
          questionText: this.extractQuestionFromColumnName(columnName),
          valueLabels: likertScales.importance4
        });
      } else if (columnName.includes('AGREE') || columnName.includes('AGR_')) {
        entries.push({
          variableName: columnName,
          questionText: this.extractQuestionFromColumnName(columnName),
          valueLabels: likertScales.agreement4
        });
      } else if (columnName.includes('SATISFIED') || columnName.includes('SAT_')) {
        entries.push({
          variableName: columnName,
          questionText: this.extractQuestionFromColumnName(columnName),
          valueLabels: likertScales.satisfaction4
        });
      } else if (columnName.includes('OFTEN') || columnName.includes('FREQ')) {
        entries.push({
          variableName: columnName,
          questionText: this.extractQuestionFromColumnName(columnName),
          valueLabels: likertScales.frequency4
        });
      } else if (columnName.includes('BETTER') || columnName.includes('COMPARE')) {
        entries.push({
          variableName: columnName,
          questionText: this.extractQuestionFromColumnName(columnName),
          valueLabels: likertScales.comparison5
        });
      } else if (columnName.endsWith('_YN') || columnName.includes('WHETHER')) {
        entries.push({
          variableName: columnName,
          questionText: this.extractQuestionFromColumnName(columnName),
          valueLabels: likertScales.yesNo
        });
      }
    });

    return entries;
  }

  /**
   * Extract a readable question from column name
   */
  private static extractQuestionFromColumnName(columnName: string): string {
    // Remove wave suffix and common prefixes
    const cleaned = columnName
      .replace(/_W\d+$/, '') // Remove wave suffix
      .replace(/^F_/, '') // Remove demographic prefix
      .replace(/_/g, ' ') // Replace underscores with spaces
      .toLowerCase();

    // Capitalize first letter and return
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }

  /**
   * Get auto-codebook summary for display
   */
  static getAutoCodebookSummary(standardName: string, entriesCount: number): string {
    switch (standardName) {
      case 'Pew Research Center':
        return `✅ **Auto-applied Pew Research mappings** for ${entriesCount} variables including demographics (gender, age, education, race, party) and common response scales. Upload a manual codebook to override or add additional mappings.`;
      default:
        return `✅ **Auto-applied ${standardName} mappings** for ${entriesCount} variables.`;
    }
  }
} 