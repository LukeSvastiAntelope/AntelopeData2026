'use client'

import { useState, useEffect } from "react";
import { Button } from "@heroui/button";
import { Spinner } from "@heroui/spinner";
import { Switch } from "@heroui/switch";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from "@heroui/modal";
import { IPrediction, IAgentProfile } from "@/app/utils/interface";
import { useFetch } from "@/app/utils/lib";
import toast from "react-hot-toast";
import { Tooltip } from "@heroui/tooltip";
import { formatDate } from "date-fns";
import { useRouter } from "next/navigation";
import { handleAuthError } from '../../utils/lib';

interface TopicUser {
    id: number;
    name: string | null;
    username: string | null;
}

interface FormattedInterest {
    interestName: string;
    isDisabled: boolean;
    userCount: number;
    users: TopicUser[];
}

interface FormattedCategory {
    categoryName: string;
    isDisabled: boolean;
    associatedUserCountForCategory: number;
    interests: FormattedInterest[];
}

const AdminPage = () => {
    const fetch = useFetch();
    const router = useRouter();

    const [activeTab, setActiveTab] = useState<"overview" | "open" | "upcoming" | "resolved" | "users" | "topics">("overview");
    const [predictions, setPredictions] = useState<IPrediction[]>([]);
    const [displayedPredictions, setDisplayedPredictions] = useState<IPrediction[]>([]);
    const [isLoadingPredictions, setIsLoadingPredictions] = useState<boolean>(false);
    const [pagePredictions, setPagePredictions] = useState<number>(1);
    const [hasMorePredictions, setHasMorePredictions] = useState<boolean>(true);

    const [openPredictions, setOpenPredictions] = useState<IPrediction[]>([]);
    const [upcomingPredictions, setUpcomingPredictions] = useState<IPrediction[]>([]);
    const [resolvedPredictions, setResolvedPredictions] = useState<IPrediction[]>([]);

    const [displayedOpenPredictions, setDisplayedOpenPredictions] = useState<IPrediction[]>([]);
    const [displayedUpcomingPredictions, setDisplayedUpcomingPredictions] = useState<IPrediction[]>([]);
    const [displayedResolvedPredictions, setDisplayedResolvedPredictions] = useState<IPrediction[]>([]);

    const [isLoadingOpenPredictions, setIsLoadingOpenPredictions] = useState<boolean>(false);
    const [isLoadingUpcomingPredictions, setIsLoadingUpcomingPredictions] = useState<boolean>(false);
    const [isLoadingResolvedPredictions, setIsLoadingResolvedPredictions] = useState<boolean>(false);

    const [pageOpenPredictions, setPageOpenPredictions] = useState<number>(1);
    const [pageUpcomingPredictions, setPageUpcomingPredictions] = useState<number>(1);
    const [pageResolvedPredictions, setPageResolvedPredictions] = useState<number>(1);

    const [hasMoreOpenPredictions, setHasMoreOpenPredictions] = useState<boolean>(true);
    const [hasMoreUpcomingPredictions, setHasMoreUpcomingPredictions] = useState<boolean>(true);
    const [hasMoreResolvedPredictions, setHasMoreResolvedPredictions] = useState<boolean>(true);

    const [users, setUsers] = useState<any[]>([]);
    const [isLoadingUsers, setIsLoadingUsers] = useState<boolean>(false);

    const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
    const [selectedUserForDeletion, setSelectedUserForDeletion] = useState<IAgentProfile | null>(null);

    const [structuredTopics, setStructuredTopics] = useState<FormattedCategory[]>([]);
    const [isLoadingTopics, setIsLoadingTopics] = useState<boolean>(false);

    const ITEMS_PER_PAGE_PREDICTIONS = 50;

    const fetchAdminPredictions = async () => {
        if (isLoadingPredictions) return;
        setIsLoadingPredictions(true);
        setIsLoadingOpenPredictions(true);
        setIsLoadingUpcomingPredictions(true);
        setIsLoadingResolvedPredictions(true);
        try {
            const response = await fetch.get('/api/admin/getPredictions');
            if (response.status) {
                setPredictions(response.predictions);
                setDisplayedPredictions(response.predictions.slice(0, ITEMS_PER_PAGE_PREDICTIONS));
                setHasMorePredictions(response.predictions.length > ITEMS_PER_PAGE_PREDICTIONS);
                const openPredictionsData = response.predictions.filter((prediction: IPrediction) => prediction.status === "open");
                const upcomingPredictionsData = response.predictions.filter((prediction: IPrediction) => prediction.status === "awaiting_confirmation");
                const resolvedPredictionsData = response.predictions.filter((prediction: IPrediction) => prediction.status === "resolved");
                setOpenPredictions(openPredictionsData);
                setUpcomingPredictions(upcomingPredictionsData);
                setResolvedPredictions(resolvedPredictionsData);
                setDisplayedOpenPredictions(openPredictionsData.slice(0, ITEMS_PER_PAGE_PREDICTIONS));
                setDisplayedUpcomingPredictions(upcomingPredictionsData.slice(0, ITEMS_PER_PAGE_PREDICTIONS));
                setDisplayedResolvedPredictions(resolvedPredictionsData.slice(0, ITEMS_PER_PAGE_PREDICTIONS));
                setHasMoreOpenPredictions(openPredictionsData.length > ITEMS_PER_PAGE_PREDICTIONS);
                setHasMoreUpcomingPredictions(upcomingPredictionsData.length > ITEMS_PER_PAGE_PREDICTIONS);
                setHasMoreResolvedPredictions(resolvedPredictionsData.length > ITEMS_PER_PAGE_PREDICTIONS);
            } else {
                toast.error(response.message);
            }
        } catch (error) {
            console.error("Error in fetchAdminPredictions: ", error);
            toast.error('Failed to fetch predictions');
        } finally {
            setIsLoadingPredictions(false);
            setIsLoadingOpenPredictions(false);
            setIsLoadingUpcomingPredictions(false);
            setIsLoadingResolvedPredictions(false);
        }
    }

    useEffect(() => {
        fetchAdminPredictions();
    }, [])

    const fetchUsers = async () => {
        if (isLoadingUsers) return;
        setIsLoadingUsers(true);
        try {
            const response = await fetch.get('/api/admin/users');
            if (response.status) {
                setUsers(response.users);
            } else {
                toast.error(response.message);
            }
        } catch (error) {
            console.error("Error fetching users:", error);
            toast.error("Failed to fetch users");
        } finally {
            setIsLoadingUsers(false);
        }
    };

    const fetchStructuredTopics = async () => {
        if (isLoadingTopics) return;
        setIsLoadingTopics(true);
        try {
            const response = await fetch.get('/api/admin/prediction-topics');
            if (response.status) {
                setStructuredTopics(response.topics);
            } else {
                toast.error(response.message || "Failed to fetch topics");
            }
        } catch (error) {
            console.error("Error fetching prediction topics:", error);
            toast.error("Failed to fetch prediction topics");
        } finally {
            setIsLoadingTopics(false);
        }
    };

    useEffect(() => {
        if (activeTab === 'users') {
            fetchUsers();
        } else if (activeTab === 'topics') {
            fetchStructuredTopics();
        }
    }, [activeTab]);

    const handleToggleTopic = async (type: 'category' | 'interest', value: string, currentIsDisabled: boolean) => {
        const newIsDisabled = !currentIsDisabled;
        try {
            const response = await fetch.post('/api/admin/prediction-topics', {
                topic_type: type,
                topic_value: value,
                is_disabled: newIsDisabled,
            });
            if (response.status) {
                toast.success(`${type === 'category' ? 'Category' : 'Interest'} '${value}' ${newIsDisabled ? 'disabled' : 'enabled'}.`);
                setStructuredTopics(prevCategories => 
                    prevCategories.map(cat => {
                        if (type === 'category' && cat.categoryName === value) {
                            return { ...cat, isDisabled: newIsDisabled };
                        }
                        if (type === 'interest') {
                            return {
                                ...cat,
                                interests: cat.interests.map(interest => 
                                    interest.interestName === value ? { ...interest, isDisabled: newIsDisabled } : interest
                                )
                            };
                        }
                        return cat;
                    })
                );
            } else {
                toast.error(response.message || "Failed to update status.");
            }
        } catch (error) {
            toast.error("Error updating status.");
            console.error("Error toggling topic:", error);
        }
    };

    const handleConfirmDelete = async () => {
        if (!selectedUserForDeletion) return;

        // Get JWT token (assuming it's stored in localStorage)
        const token = typeof window !== 'undefined' ? localStorage.getItem("token") ?? "" : "";
        if (!token && process.env.NODE_ENV !== 'development') { // Allow no token in dev for easier testing if middleware is off
            handleAuthError(undefined, false); // Use centralized handler without toast
            setIsDeleteConfirmOpen(false);
            setSelectedUserForDeletion(null);
            return;
        }

        try {
            // Note: useFetch might not support DELETE method directly or might need specific config.
            // Using standard fetch for DELETE here for clarity.
            const response = await window.fetch(`/api/admin/deleteUser/${selectedUserForDeletion.user_id}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            const result = await response.json();

            if (response.ok && result.status) {
                toast.success(`User ${selectedUserForDeletion.name || selectedUserForDeletion.username} deleted successfully.`);
                setUsers(prevUsers => prevUsers.filter(u => u.user_id !== selectedUserForDeletion.user_id));
            } else {
                toast.error(result.message || "Failed to delete user.");
            }
        } catch (error) {
            console.error("Error deleting user:", error);
            toast.error("An error occurred while trying to delete the user.");
        } finally {
            setIsDeleteConfirmOpen(false);
            setSelectedUserForDeletion(null);
        }
    };

    const handleDeleteUserClick = (user: IAgentProfile) => {
        setSelectedUserForDeletion(user);
        setIsDeleteConfirmOpen(true);
    };

    const loadMorePredictions = () => {
        if (!isLoadingPredictions && hasMorePredictions) {
            const newPage = pagePredictions + 1;
            const nextItems = predictions.slice(0, newPage * ITEMS_PER_PAGE_PREDICTIONS);
            setDisplayedPredictions(nextItems);
            setHasMorePredictions(nextItems.length < predictions.length);
            setPagePredictions(newPage);
        }
    }

    const loadMoreOpenPredictions = () => {
        if (!isLoadingOpenPredictions && hasMoreOpenPredictions) {
            const newPage = pageOpenPredictions + 1;
            const nextItems = openPredictions.slice(0, newPage * ITEMS_PER_PAGE_PREDICTIONS);
            setDisplayedOpenPredictions(nextItems);
            setHasMoreOpenPredictions(nextItems.length < openPredictions.length);
            setPageOpenPredictions(newPage);
        }
    }

    const loadMoreUpcomingPredictions = () => {
        if (!isLoadingUpcomingPredictions && hasMoreUpcomingPredictions) {
            const newPage = pageUpcomingPredictions + 1;
            const nextItems = upcomingPredictions.slice(0, newPage * ITEMS_PER_PAGE_PREDICTIONS);
            setDisplayedUpcomingPredictions(nextItems);
            setHasMoreUpcomingPredictions(nextItems.length < upcomingPredictions.length);
            setPageUpcomingPredictions(newPage);
        }
    }

    const loadMoreResolvedPredictions = () => {
        if (!isLoadingResolvedPredictions && hasMoreResolvedPredictions) {
            const newPage = pageResolvedPredictions + 1;
            const nextItems = resolvedPredictions.slice(0, newPage * ITEMS_PER_PAGE_PREDICTIONS);
            setDisplayedResolvedPredictions(nextItems);
            setHasMoreResolvedPredictions(nextItems.length < resolvedPredictions.length);
            setPageResolvedPredictions(newPage);
        }
    }

    return (
        <>
            <div className="flex flex-row justify-between h-fit">
                <div className="pr-8 pt-2">
                    <h1 className="font-bold mb-2 font-kodemono ">
                        Admin
                    </h1>
                </div>
            </div>
            <div className="flex gap-2 font-kodemono mb-2 text-small">
                <Tooltip
                    content="View overall predictions."
                    showArrow
                >
                    <button
                        onClick={() => setActiveTab("overview")}
                        className={`px-1 py-2 hover:text-white ${activeTab === "overview" ? "text-white" : "text-gray-500"
                            }`}
                    >
                        Overview
                    </button>
                </Tooltip>
                <Tooltip
                    content="View open predictions."
                    showArrow
                >
                    <button
                        onClick={() => setActiveTab("open")}
                        className={`px-1 py-2 hover:text-white ${activeTab === "open" ? "text-white" : "text-gray-500"
                            }`}
                    >
                        Open
                    </button>
                </Tooltip>
                <Tooltip
                    content="View upcoming predictions."
                    showArrow
                >
                    <button
                        onClick={() => setActiveTab("upcoming")}
                        className={`px-1 py-2 hover:text-white ${activeTab === "upcoming" ? "text-white" : "text-gray-500"
                            }`}
                    >
                        Upcoming
                    </button>
                </Tooltip>
                <Tooltip
                    content="View resolved predictions."
                    showArrow
                >
                    <button
                        onClick={() => setActiveTab("resolved")}
                        className={`px-1 py-2 hover:text-white ${activeTab === "resolved" ? "text-white" : "text-gray-500"
                            }`}
                    >
                        Resolved
                    </button>
                </Tooltip>
                <Tooltip
                    content="View platform users."
                    showArrow
                >
                    <button
                        onClick={() => setActiveTab("users")}
                        className={`px-1 py-2 hover:text-white ${activeTab === "users" ? "text-white" : "text-gray-500"
                            }`}
                    >
                        Users
                    </button>
                </Tooltip>
                <Tooltip
                    content="Manage prediction topics."
                    showArrow
                >
                    <button
                        onClick={() => setActiveTab("topics")}
                        className={`px-1 py-2 hover:text-white ${activeTab === "topics" ? "text-white" : "text-gray-500"
                            }`}
                    >
                        Topic Control
                    </button>
                </Tooltip>
                <Tooltip
                    content="Manage daily bet analysis scheduler."
                    showArrow
                >
                    <button
                        onClick={() => router.push("/admin/scheduler")}
                        className="px-1 py-2 hover:text-white text-gray-500 ml-4 border-l border-gray-600 pl-4"
                    >
                        Scheduler
                    </button>
                </Tooltip>
            </div>
            {
                activeTab === "overview" && (
                    <div className="flex flex-col gap-2">
                        <div className="flex flex-row justify-between">
                            <div>Predictions</div>
                            <div>Resolve By</div>
                        </div>
                        {isLoadingPredictions && predictions.length === 0 && (
                            <div className="flex justify-center items-center py-8">
                                <Spinner size="lg" />
                            </div>
                        )}
                        {!isLoadingPredictions && predictions.length === 0 && (
                            <div className="text-center text-gray-500 py-8 container">
                                No predictions found
                            </div>
                        )}
                        {
                            displayedPredictions.map((prediction: IPrediction) => (
                                <div key={prediction.id} className="flex flex-row justify-between cursor-pointer gap-4" onClick={() => router.push(`/admin/${prediction.id}`)}>
                                    <div>{prediction.description}</div>
                                    <div>{formatDate(new Date(prediction.resolution_date), "MM/dd/yyyy")}</div>
                                </div>
                            ))
                        }
                        {
                            hasMorePredictions && !isLoadingPredictions && displayedPredictions.length > 0 && (
                                <div className="flex justify-center mt-4">
                                    <Button
                                        color="primary"
                                        variant="flat"
                                        onPress={loadMorePredictions}
                                        className="min-w-[200px]"
                                    >
                                        Show More
                                    </Button>
                                </div>
                            )
                        }
                    </div>
                )
            }
            {
                activeTab === "open" && (
                    <div className="flex flex-col gap-2">
                        <div className="flex flex-row justify-between">
                            <div>Predictions</div>
                            <div>Resolve By</div>
                        </div>
                        {isLoadingOpenPredictions && openPredictions.length === 0 && (
                            <div className="flex justify-center items-center py-8">
                                <Spinner size="lg" />
                            </div>
                        )}
                        {!isLoadingOpenPredictions && openPredictions.length === 0 && (
                            <div className="text-center text-gray-500 py-8 container">
                                No predictions found
                            </div>
                        )}
                        {
                            displayedOpenPredictions.map((prediction: IPrediction) => (
                                <div key={prediction.id} className="flex flex-row justify-between cursor-pointer gap-4" onClick={() => router.push(`/admin/${prediction.id}`)}>
                                    <div>{prediction.description}</div>
                                    <div>{formatDate(new Date(prediction.resolution_date), "MM/dd/yyyy")}</div>
                                </div>
                            ))
                        }
                        {
                            hasMoreOpenPredictions && !isLoadingOpenPredictions && displayedOpenPredictions.length > 0 && (
                                <div className="flex justify-center mt-4">
                                    <Button
                                        color="primary"
                                        variant="flat"
                                        onPress={loadMoreOpenPredictions}
                                        className="min-w-[200px]"
                                    >
                                        Show More
                                    </Button>
                                </div>
                            )
                        }
                    </div>
                )
            }
            {
                activeTab === "upcoming" && (
                    <div className="flex flex-col gap-2">
                        <div className="flex flex-row justify-between">
                            <div>Predictions</div>
                            <div>Resolve By</div>
                        </div>
                        {isLoadingUpcomingPredictions && upcomingPredictions.length === 0 && (
                            <div className="flex justify-center items-center py-8">
                                <Spinner size="lg" />
                            </div>
                        )}
                        {!isLoadingUpcomingPredictions && upcomingPredictions.length === 0 && (
                            <div className="text-center text-gray-500 py-8 container">
                                No predictions found
                            </div>
                        )}
                        {
                            displayedUpcomingPredictions.map((prediction: IPrediction) => (
                                <div key={prediction.id} className="flex flex-row justify-between cursor-pointer gap-4" onClick={() => router.push(`/admin/${prediction.id}`)}>
                                    <div>{prediction.description}</div>
                                    <div>{formatDate(new Date(prediction.resolution_date), "MM/dd/yyyy")}</div>
                                </div>
                            ))
                        }
                        {
                            hasMoreUpcomingPredictions && !isLoadingUpcomingPredictions && displayedUpcomingPredictions.length > 0 && (
                                <div className="flex justify-center mt-4">
                                    <Button
                                        color="primary"
                                        variant="flat"
                                        onPress={loadMoreUpcomingPredictions}
                                        className="min-w-[200px]"
                                    >
                                        Show More
                                    </Button>
                                </div>
                            )
                        }
                    </div>
                )
            }
            {
                activeTab === "resolved" && (
                    <div className="flex flex-col gap-2">
                        <div className="flex flex-row justify-between">
                            <div>Predictions</div>
                            <div>Resolve By</div>
                        </div>
                        {isLoadingResolvedPredictions && resolvedPredictions.length === 0 && (
                            <div className="flex justify-center items-center py-8">
                                <Spinner size="lg" />
                            </div>
                        )}
                        {!isLoadingResolvedPredictions && resolvedPredictions.length === 0 && (
                            <div className="text-center text-gray-500 py-8 container">
                                No predictions found
                            </div>
                        )}
                        {
                            displayedResolvedPredictions.map((prediction: IPrediction) => (
                                <div key={prediction.id} className="flex flex-row justify-between cursor-pointer gap-4" onClick={() => router.push(`/admin/${prediction.id}`)}>
                                    <div>{prediction.description}</div>
                                    <div>{formatDate(new Date(prediction.resolution_date), "MM/dd/yyyy")}</div>
                                </div>
                            ))
                        }
                        {
                            hasMoreResolvedPredictions && !isLoadingResolvedPredictions && displayedResolvedPredictions.length > 0 && (
                                <div className="flex justify-center mt-4">
                                    <Button
                                        color="primary"
                                        variant="flat"
                                        onPress={loadMoreResolvedPredictions}
                                        className="min-w-[200px]"
                                    >
                                        Show More
                                    </Button>
                                </div>
                            )
                        }
                    </div>
                )
            }
            {
                activeTab === "users" && (
                    <div className="flex flex-col gap-2 py-4">
                        <div className="grid grid-cols-5 font-semibold px-2 pb-2 border-b border-gray-700">
                            <div>User ID</div>
                            <div>Email</div>
                            <div>Display Name</div>
                            <div>Role</div>
                            <div>Actions</div>
                        </div>
                        {isLoadingUsers && users.length === 0 && (
                            <div className="flex justify-center items-center py-8">
                                <Spinner size="lg" />
                            </div>
                        )}
                        {!isLoadingUsers && users.length === 0 && (
                            <div className="text-center text-gray-500 py-8 container">
                                No users found
                            </div>
                        )}
                        {users.map((u: any) => (
                            <div key={u.id} className="grid grid-cols-5 gap-4 hover:bg-gray-800 p-2 rounded-md items-center">
                                <div>{u.id}</div>
                                <div>{u.email || "N/A"}</div>
                                <div>{u.display_name || "N/A"}</div>
                                <div className="uppercase text-xs">{u.role || "user"}</div>
                                <div>
                                    <Button 
                                        size="sm" 
                                        color="danger" 
                                        variant="light"
                                        onPress={() => handleDeleteUserClick({ user_id: u.id, name: u.display_name } as any)}
                                    >
                                        Delete
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                )
            }
            {
                activeTab === "topics" && (
                    <div className="flex flex-col gap-6 py-4">
                        {isLoadingTopics && structuredTopics.length === 0 && (
                            <div className="flex justify-center items-center py-8">
                                <Spinner size="lg" />
                            </div>
                        )}
                        {!isLoadingTopics && structuredTopics.length === 0 && (
                            <div className="text-center text-gray-500 py-8 container">
                                No categories or interests found for agents, or no configurations exist.
                            </div>
                        )}
                        {structuredTopics.map((category) => (
                            <div key={category.categoryName} className="border border-gray-700 rounded-lg overflow-hidden">
                                <div className="bg-gray-800 p-4 flex justify-between items-center">
                                    <h2 className="text-xl font-semibold capitalize flex items-center">
                                        {category.categoryName}
                                        <span className="text-sm font-normal text-gray-400 ml-2">
                                            ({category.associatedUserCountForCategory} user(s))
                                        </span>
                                    </h2>
                                    <div className="flex items-center">
                                        <Switch
                                            isSelected={!category.isDisabled}
                                            onValueChange={() => handleToggleTopic('category', category.categoryName, category.isDisabled)}
                                            aria-label={`Toggle Category ${category.categoryName}`}
                                        />
                                        <span className="ml-2 text-sm">{category.isDisabled ? 'Disabled' : 'Enabled'}</span>
                                    </div>
                                </div>
                                
                                {category.interests.length > 0 ? (
                                    <div className="bg-gray-900">
                                        {category.interests.map(interest => (
                                            <div key={interest.interestName} className="border-t border-gray-700">
                                                <div className="p-3 bg-gray-800/30 flex justify-between items-center">
                                                    <div className="flex items-center">
                                                        <div className="font-medium capitalize">{interest.interestName}</div>
                                                        <div className="ml-2 px-2 py-0.5 bg-gray-700 rounded-full text-xs">
                                                            {interest.userCount} user(s)
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center">
                                                        <Switch
                                                            size="sm"
                                                            isSelected={!interest.isDisabled}
                                                            onValueChange={() => handleToggleTopic('interest', interest.interestName, interest.isDisabled)}
                                                            aria-label={`Toggle Interest ${interest.interestName}`}
                                                        />
                                                        <span className="ml-2 text-xs">{interest.isDisabled ? 'Disabled' : 'Enabled'}</span>
                                                    </div>
                                                </div>
                                                
                                                {interest.users.length > 0 ? (
                                                    <div className="px-4 py-2 bg-gray-900/50">
                                                        <div className="text-xs text-gray-400 mb-2">Users betting on this interest:</div>
                                                        <div className="flex flex-wrap gap-2">
                                                            {interest.users.map(user => (
                                                                <div key={user.id} className="px-2 py-1 bg-gray-800 rounded text-xs flex items-center">
                                                                    <div className="font-medium">{user.name || 'Unnamed'}</div>
                                                                    {user.username && (
                                                                        <div className="ml-1 text-gray-400">
                                                                            ({user.username})
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="px-4 py-2 bg-gray-900/50 text-xs text-gray-500">
                                                        No users betting on this interest
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="p-4 text-sm text-gray-500">No specific interests found under this category.</div>
                                )}
                            </div>
                        ))}
                    </div>
                )
            }
            {selectedUserForDeletion && (
                <Modal
                    isOpen={isDeleteConfirmOpen}
                    onClose={() => {
                        setIsDeleteConfirmOpen(false);
                        setSelectedUserForDeletion(null);
                    }}
                    size="md"
                    classNames={{
                        base: "bg-[#1c1c1c] dark", 
                    }}
                >
                    <ModalContent>
                        <ModalHeader className="text-white">Confirm Deletion</ModalHeader>
                        <ModalBody>
                            <p className="text-gray-300">
                                Are you sure you want to delete the user: <span className="font-semibold text-white">{selectedUserForDeletion.name || selectedUserForDeletion.username || `ID: ${selectedUserForDeletion.user_id}`}</span>?
                            </p>
                            <p className="text-sm text-red-500 mt-2">This action cannot be undone.</p>
                        </ModalBody>
                        <ModalFooter>
                            <Button 
                                variant="light" 
                                onPress={() => {
                                    setIsDeleteConfirmOpen(false);
                                    setSelectedUserForDeletion(null);
                                }}
                                className="text-gray-400 hover:text-white"
                            >
                                Cancel
                            </Button>
                            <Button 
                                color="danger" 
                                onPress={handleConfirmDelete}
                            >
                                Confirm Delete
                            </Button>
                        </ModalFooter>
                    </ModalContent>
                </Modal>
            )}
        </>
    )
}

export default AdminPage;