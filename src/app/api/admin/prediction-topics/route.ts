import { NextRequest, NextResponse } from "next/server";
import { UserRepo } from "@/app/utils/database/user-repo";
import { AgentDB } from "@/app/utils/interface";

interface TopicUser {
    id: number;
    name: string | null;
    username: string | null;
}

interface FormattedInterest {
    interestName: string;
    originalName: string; // Store original name for display purposes
    isDisabled: boolean;
    userCount: number;
    users: TopicUser[];
}

interface FormattedCategory {
    categoryName: string;
    originalName: string; // Store original name for display purposes
    isDisabled: boolean; // For the category itself
    associatedUserCountForCategory: number;
    interests: FormattedInterest[];
}

// Helper function to normalize strings (lowercase, trim)
function normalizeString(str: string): string {
    return str.toLowerCase().trim();
}

export async function GET() {
    try {
        const agents: (AgentDB & { username?: string })[] = await UserRepo.getAgents();
        const topicConfigs = await UserRepo.getPredictionTopicConfigs();

        const categoriesMap = new Map<string, {
            categoryConfig: { isDisabled: boolean, originalName: string };
            interestsMap: Map<string, { 
                interestConfig: { isDisabled: boolean, originalName: string }, 
                usersSet: Set<number>, 
                usersList: TopicUser[] 
            }>;
            usersAssociatedWithCategory: Set<number>; // To count unique users for the category
        }>();

        agents.forEach(agent => {
            const originalCategory = agent.category || "Uncategorized"; // Default if no category
            const normalizedCategory = normalizeString(originalCategory);

            if (!categoriesMap.has(normalizedCategory)) {
                const catConfig = topicConfigs.find(c => 
                    c.topic_type === 'category' && normalizeString(c.topic_value) === normalizedCategory
                );
                categoriesMap.set(normalizedCategory, {
                    categoryConfig: { 
                        isDisabled: catConfig ? catConfig.is_disabled : false,
                        originalName: originalCategory 
                    },
                    interestsMap: new Map(),
                    usersAssociatedWithCategory: new Set()
                });
            }
            const categoryData = categoriesMap.get(normalizedCategory)!;
            categoryData.usersAssociatedWithCategory.add(agent.user_id);

            let interestsArray: string[] = [];
            if (typeof agent.interests === 'string' && agent.interests.trim() !== '') {
                interestsArray = agent.interests.split(',').map(i => i.trim()).filter(i => i);
            } else if (Array.isArray(agent.interests)) {
                interestsArray = agent.interests.filter(i => typeof i === 'string' && i.trim() !== '');
            }

            interestsArray.forEach(originalInterest => {
                const normalizedInterest = normalizeString(originalInterest);
                
                if (!categoryData.interestsMap.has(normalizedInterest)) {
                    const intConfig = topicConfigs.find(c => 
                        c.topic_type === 'interest' && normalizeString(c.topic_value) === normalizedInterest
                    );
                    categoryData.interestsMap.set(normalizedInterest, {
                        interestConfig: { 
                            isDisabled: intConfig ? intConfig.is_disabled : false,
                            originalName: originalInterest
                        },
                        usersSet: new Set(),
                        usersList: []
                    });
                }
                const interestData = categoryData.interestsMap.get(normalizedInterest)!;
                if (!interestData.usersSet.has(agent.user_id)) {
                    interestData.usersSet.add(agent.user_id);
                    interestData.usersList.push({ id: agent.user_id, name: agent.name, username: agent.username || null });
                }
            });
        });

        // Add categories from config that might not have agents yet
        topicConfigs.forEach(config => {
            if (config.topic_type === 'category') {
                const normalizedCategory = normalizeString(config.topic_value);
                if (!categoriesMap.has(normalizedCategory)) {
                    categoriesMap.set(normalizedCategory, {
                        categoryConfig: { 
                            isDisabled: config.is_disabled,
                            originalName: config.topic_value 
                        },
                        interestsMap: new Map(),
                        usersAssociatedWithCategory: new Set()
                    });
                }
            }
        });

        const formattedResult: FormattedCategory[] = [];
        // Iterate using Array.from to avoid downlevelIteration error
        Array.from(categoriesMap.entries()).forEach(([normalizedCategory, data]) => {
            const interests: FormattedInterest[] = [];
            Array.from(data.interestsMap.entries()).forEach(([normalizedInterest, interestData]) => {
                interests.push({
                    interestName: interestData.interestConfig.originalName,
                    originalName: interestData.interestConfig.originalName,
                    isDisabled: interestData.interestConfig.isDisabled,
                    userCount: interestData.usersList.length,
                    users: interestData.usersList.sort((a: TopicUser, b: TopicUser) => 
                        (a.name || '').localeCompare(b.name || '')
                    ),
                });
            });
            interests.sort((a: FormattedInterest, b: FormattedInterest) => 
                a.interestName.toLowerCase().localeCompare(b.interestName.toLowerCase())
            );

            formattedResult.push({
                categoryName: data.categoryConfig.originalName,
                originalName: data.categoryConfig.originalName,
                isDisabled: data.categoryConfig.isDisabled,
                associatedUserCountForCategory: data.usersAssociatedWithCategory.size,
                interests,
            });
        });
        
        formattedResult.sort((a: FormattedCategory, b: FormattedCategory) => 
            a.categoryName.toLowerCase().localeCompare(b.categoryName.toLowerCase())
        );

        return NextResponse.json({ status: true, topics: formattedResult });
    } catch (error) {
        console.error("Error fetching structured prediction topics:", error);
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
        return NextResponse.json({ status: false, message: "Failed to fetch structured prediction topics", error: errorMessage }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { topic_type, topic_value, is_disabled } = body;

        if (!topic_type || !topic_value || typeof is_disabled !== 'boolean') {
            return NextResponse.json({ status: false, message: "Missing required fields: topic_type, topic_value, is_disabled" }, { status: 400 });
        }

        if (topic_type !== 'category' && topic_type !== 'interest') {
            return NextResponse.json({ status: false, message: "Invalid topic_type. Must be 'category' or 'interest'." }, { status: 400 });
        }

        const result = await UserRepo.upsertPredictionTopicConfig(topic_type, topic_value, is_disabled);
        return NextResponse.json({ status: true, message: "Topic configuration updated successfully", data: result });

    } catch (error) {
        console.error("Error updating prediction topic configuration:", error);
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
        return NextResponse.json({ status: false, message: "Failed to update topic configuration", error: errorMessage }, { status: 500 });
    }
} 