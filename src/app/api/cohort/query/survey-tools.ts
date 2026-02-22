import { SurveyRepo } from "@/app/utils/database/survey-repo";

export type SurveyToolName = "list_surveys" | "get_survey" | "create_survey_draft";

type ToolIntentNone = { kind: "none" };
type ToolIntentAmbiguous = { kind: "ambiguous"; clarification: string };
type ToolIntentTool = {
  kind: "tool";
  tool: SurveyToolName;
  confidence: number;
  rawArgs: Record<string, unknown>;
};

export type SurveyToolIntent = ToolIntentNone | ToolIntentAmbiguous | ToolIntentTool;

export type SurveyToolResult =
  | {
      ok: true;
      tool: SurveyToolName;
      summaryMarkdown: string;
      data: Record<string, unknown>;
    }
  | {
      ok: false;
      tool: SurveyToolName;
      summaryMarkdown: string;
      errorCode: "validation_error" | "not_found" | "unauthorized" | "disabled" | "internal_error";
      missingFields?: string[];
    };

export function detectSurveyToolIntent(question: string): SurveyToolIntent {
  const q = (question || "").trim();
  const lower = q.toLowerCase();
  if (!q) return { kind: "none" };

  const hasSurveyKeyword = /\bsurvey(s)?\b/.test(lower);
  const isCreate = /\b(create|make|build|draft)\b/.test(lower) && hasSurveyKeyword;
  const isList =
    /\b(list|show|which|what)\b/.test(lower) &&
    /\bsurveys\b/.test(lower) &&
    /\b(my|we|have|do i have|do we have|available)?\b/.test(lower);
  const isGetWithId =
    /\b(show|get|open|view|details?)\b/.test(lower) &&
    /\bsurvey\b/.test(lower) &&
    /\b\d+\b/.test(lower);

  if (isCreate) {
    return {
      kind: "tool",
      tool: "create_survey_draft",
      confidence: 0.9,
      rawArgs: parseCreateDraftArgs(q),
    };
  }
  if (isGetWithId) {
    return {
      kind: "tool",
      tool: "get_survey",
      confidence: 0.9,
      rawArgs: parseGetSurveyArgs(q),
    };
  }
  if (isList) {
    return {
      kind: "tool",
      tool: "list_surveys",
      confidence: 0.9,
      rawArgs: parseListSurveyArgs(q),
    };
  }

  if (hasSurveyKeyword && /\b(create|make|show|list|get|open|view|publish|delete|clone)\b/.test(lower)) {
    return {
      kind: "ambiguous",
      clarification:
        "I can help with survey actions. Tell me one of: `list surveys`, `show survey <id>`, or `create survey` and include a title plus at least one draft question.",
    };
  }

  return { kind: "none" };
}

type ExecuteArgs = {
  tool: SurveyToolName;
  rawArgs: Record<string, unknown>;
  userId: number;
  allowCreate: boolean;
};

export async function executeSurveyTool(args: ExecuteArgs): Promise<SurveyToolResult> {
  const { tool, rawArgs, userId, allowCreate } = args;
  try {
    if (tool === "list_surveys") {
      const normalized = validateListSurveysArgs(rawArgs);
      const rows = normalized.featured
        ? (await SurveyRepo.getSurveysForUser(userId)).allSurveys
        : await SurveyRepo.getSurveysByCreator(userId);
      const surveys = (rows || []).slice(0, 20).map((s: any) => ({
        id: Number(s.id),
        title: String(s.title || "Untitled"),
        status: String(s.status || "draft"),
        createdAt: s.created_at ? new Date(s.created_at).toISOString().slice(0, 10) : "unknown",
      }));
      return {
        ok: true,
        tool,
        data: { total: surveys.length, surveys },
        summaryMarkdown: formatSurveyListSummary(surveys),
      };
    }

    if (tool === "get_survey") {
      const normalized = validateGetSurveyArgs(rawArgs);
      const survey = await SurveyRepo.getSurveyById(normalized.surveyId, userId);
      if (!survey) {
        return {
          ok: false,
          tool,
          errorCode: "not_found",
          summaryMarkdown: `I could not find survey \`${normalized.surveyId}\` or you do not have access to it.`,
        };
      }
      const questionCount = Array.isArray((survey as any).questions) ? (survey as any).questions.length : 0;
      return {
        ok: true,
        tool,
        data: {
          id: Number((survey as any).id),
          title: String((survey as any).title || "Untitled"),
          status: String((survey as any).status || "draft"),
          slug: String((survey as any).slug || ""),
          questionCount,
        },
        summaryMarkdown: [
          `### Survey ${Number((survey as any).id)}`,
          `- Title: ${(survey as any).title || "Untitled"}`,
          `- Status: ${(survey as any).status || "draft"}`,
          `- Slug: ${(survey as any).slug || "n/a"}`,
          `- Questions: ${questionCount}`,
        ].join("\n"),
      };
    }

    if (!allowCreate) {
      return {
        ok: false,
        tool,
        errorCode: "disabled",
        summaryMarkdown:
          "Survey draft creation via chat is currently disabled by feature flag. Enable `CHAT_SURVEY_CREATE_ENABLED` to use this action.",
      };
    }

    const normalized = validateCreateSurveyDraftArgs(rawArgs);
    if (!normalized.valid) {
      return {
        ok: false,
        tool,
        errorCode: "validation_error",
        missingFields: normalized.missingFields,
        summaryMarkdown: [
          "I can create that draft, but I still need:",
          ...(normalized.missingFields || []).map((f) => `- ${f}`),
          "",
          "Example:",
          "`Create survey titled \"Volunteer Mobilization\" with questions: 1) Why do you support us? 2) Which volunteer task fits you best?`",
        ].join("\n"),
      };
    }

    const createdId = await SurveyRepo.createSurvey(
      {
        title: normalized.title,
        description: normalized.description || "",
        questions: normalized.questions,
        organizationId: normalized.organizationId || undefined,
        isPublic: false,
        autoPublish: false,
      },
      userId
    );

    const created = await SurveyRepo.getSurveyById(Number(createdId), userId);
    return {
      ok: true,
      tool,
      data: {
        id: Number(createdId),
        slug: (created as any)?.slug || null,
        status: (created as any)?.status || "draft",
      },
      summaryMarkdown: [
        "### Survey Draft Created",
        `- ID: ${Number(createdId)}`,
        `- Slug: ${(created as any)?.slug || "n/a"}`,
        `- Status: ${(created as any)?.status || "draft"}`,
        "",
        "Next commands:",
        `- \`show survey ${Number(createdId)}\``,
      ].join("\n"),
    };
  } catch (error) {
    return {
      ok: false,
      tool,
      errorCode: "internal_error",
      summaryMarkdown: `I ran into an error while running \`${tool}\`: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    };
  }
}

function parseListSurveyArgs(question: string): Record<string, unknown> {
  const lower = question.toLowerCase();
  return {
    featured: !/\b(only mine|my surveys only|without featured)\b/.test(lower),
  };
}

function parseGetSurveyArgs(question: string): Record<string, unknown> {
  const match = question.match(/\bsurvey\s*#?\s*(\d+)\b/i) || question.match(/\b(\d+)\b/);
  return { surveyId: match ? Number(match[1]) : undefined };
}

function parseCreateDraftArgs(question: string): Record<string, unknown> {
  const titleMatch =
    question.match(/(?:title|called|named)\s+["']([^"']+)["']/i) ||
    question.match(/["']([^"']{4,80})["']/);
  const organizationIdMatch = question.match(/\borganization\s*#?\s*(\d+)\b/i);

  const listQuestions = question
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^(\d+[\).\s-]+|- )/.test(line))
    .map((line) => line.replace(/^(\d+[\).\s-]+|- )/, "").trim())
    .filter(Boolean);

  return {
    title: titleMatch ? titleMatch[1].trim() : undefined,
    description: undefined,
    organizationId: organizationIdMatch ? Number(organizationIdMatch[1]) : undefined,
    questions: listQuestions,
  };
}

function validateListSurveysArgs(rawArgs: Record<string, unknown>): { featured: boolean } {
  return { featured: rawArgs.featured !== false };
}

function validateGetSurveyArgs(rawArgs: Record<string, unknown>): { surveyId: number } {
  const surveyId = Number(rawArgs.surveyId);
  if (!Number.isFinite(surveyId) || surveyId <= 0) {
    throw new Error("Invalid or missing survey ID. Use: show survey <id>");
  }
  return { surveyId };
}

function validateCreateSurveyDraftArgs(rawArgs: Record<string, unknown>):
  | {
      valid: true;
      title: string;
      description?: string;
      organizationId?: number;
      questions: Array<{ type: string; prompt: string; isRequired: boolean; order: number }>;
    }
  | {
      valid: false;
      missingFields: string[];
    } {
  const missingFields: string[] = [];
  const title = typeof rawArgs.title === "string" ? rawArgs.title.trim() : "";
  const questionPrompts = Array.isArray(rawArgs.questions)
    ? rawArgs.questions.map((q) => String(q).trim()).filter(Boolean)
    : [];

  if (!title) missingFields.push("title");
  if (questionPrompts.length === 0) missingFields.push("at least one question");

  if (missingFields.length > 0) {
    return { valid: false, missingFields };
  }

  return {
    valid: true,
    title,
    description: typeof rawArgs.description === "string" ? rawArgs.description.trim() : undefined,
    organizationId:
      rawArgs.organizationId !== undefined && Number.isFinite(Number(rawArgs.organizationId))
        ? Number(rawArgs.organizationId)
        : undefined,
    questions: questionPrompts.map((prompt, idx) => ({
      type: "text",
      prompt,
      isRequired: true,
      order: idx + 1,
    })),
  };
}

function formatSurveyListSummary(
  surveys: Array<{ id: number; title: string; status: string; createdAt: string }>
): string {
  if (!surveys.length) {
    return "No surveys found for your account.";
  }
  const lines = surveys.slice(0, 10).map((s) => `- #${s.id} | ${s.title} | ${s.status} | ${s.createdAt}`);
  return ["### Surveys", ...lines].join("\n");
}
