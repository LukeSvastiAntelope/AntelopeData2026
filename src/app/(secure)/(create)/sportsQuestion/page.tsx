"use client"

import { Input, Textarea } from "@heroui/input";
import { Select, SelectItem } from "@heroui/select";
import { Button, ButtonGroup } from "@heroui/button";
import { useEffect, useState } from "react";
import { ILeague, IMatch } from "@/app/utils/interface";
import { useFetch } from "@/app/utils/lib";
import { toast } from "react-hot-toast";

const predictionTypes = [
    { key: "soccer", name: "Soccer", leagueId: "" },
    { key: "premier", name: "Premier League", leagueId: "4328" },
    { key: "nba", name: "NBA", leagueId: "4387" },
    { key: "nfl", name: "NFL", leagueId: "4391" },
]

const creditPoolOptions = [
    { key: "10", name: "10 Credits" },
    { key: "100", name: "100 Credits" },
    { key: "500", name: "500 Credits" },
    { key: "custom", name: "Custom" },
]

const SportsQuestion = () => {
    const fetchData = useFetch();

    const [predictionType, setPredictionType] = useState("");
    const [context, setContext] = useState("");
    const [creditPool, setCreditPool] = useState("10");
    const [customCreditPool, setCustomCreditPool] = useState("0");
    const [matches, setMatches] = useState<IMatch[]>([]);
    const [selectedMatch, setSelectedMatch] = useState<string>("");
    const [leagues, setLeagues] = useState<ILeague[]>([]);
    const [selectedLeague, setSelectedLeague] = useState<string>("");
    const [options, setOptions] = useState<string[]>([]);
    const [isLoadingLeagues, setIsLoadingLeagues] = useState<boolean>(false);
    const [isLoadingMatches, setIsLoadingMatches] = useState<boolean>(false);
    const [homeTeam, setHomeTeam] = useState<string>("");
    const [awayTeam, setAwayTeam] = useState<string>("");
    const [matchDate, setMatchDate] = useState<string>("");

    const handleCreateQuestion = async () => {

        const payload = {
            source: "sportDB",
            matchId: selectedMatch,
            context: context,
            resolutionDate: matchDate,
            betAmount: creditPool == "custom" ? customCreditPool : creditPool,
            choices: options,
            homeTeam: homeTeam,
            awayTeam: awayTeam,
            strThumb: matches.find(match => match.idEvent === selectedMatch)?.strThumb || "",
            description: matches.find(match => match.idEvent === selectedMatch)?.strEvent || "",
            leagueId: selectedLeague,
        }
        if (!payload.source || !payload.matchId || !payload.leagueId || !payload.description || !payload.resolutionDate || !payload.betAmount || !payload.choices || !payload.homeTeam || !payload.awayTeam) {
            toast.error("Please fill all required fields");
            return;
        }
        if (options.length < 2) {
            toast.error("Please add at least 2 options");
            return;
        }
        const response = await fetchData.post("/api/createQuestion", payload);
        if (response.status) {
            toast.success("Question created successfully");
        } else {
            toast.error(response.message);
        }
    }

    const fetchAvailableLeagues = async () => {
        setIsLoadingLeagues(true);
        try {
            const response = await fetchData.get("/api/getAvailableLeagues");
            if (response.status) {
                setLeagues(response.data.leagues.filter((league: ILeague) => league.strSport.toLowerCase() == "soccer"));
            }
        } finally {
            setIsLoadingLeagues(false);
        }
    };

    const fetchMatches = async () => {
        setIsLoadingMatches(true);
        try {
            const response = await fetchData.get(`/api/getMatches?leagueId=${selectedLeague}`);
            if (response.status) {
                setMatches(response.data.events);
            }
        } finally {
            setIsLoadingMatches(false);
        }
    };

    useEffect(() => {
        if (predictionType === "soccer") {
            fetchAvailableLeagues();
        }
    }, [predictionType]);

    useEffect(() => {
        if (predictionType !== "custom" && selectedLeague) {
            fetchMatches();
        }
    }, [selectedLeague]);

    return (
        <>
            <div className="text-xl font-bold text-white py-2">Choose Question {">"} Yes/No Questions</div>
            <div className="mt-4 bg-custom-prediction-modal-bg px-4 py-6 rounded-lg flex flex-col gap-8">
                <div className="flex flex-col gap-2">
                    <div className="text-sm font-bold">Select Category</div>
                    <Select
                        label="Select Category"
                        value={predictionType}
                        onChange={(e) => {
                            setPredictionType(e.target.value);
                            setSelectedLeague(predictionTypes.find(type => type.key === e.target.value)?.leagueId || "");
                            setOptions([]);
                            setMatches([]);
                            setSelectedMatch("");
                        }}
                    >
                        {predictionTypes.map((type) => (
                            <SelectItem key={type.key} value={type.key}>
                                {type.name}
                            </SelectItem>
                        ))}
                    </Select>
                </div>
                {
                    predictionType === "soccer" && (
                        <Select
                            label="Select League"
                            value={selectedLeague}
                            onChange={(e) => setSelectedLeague(e.target.value)}
                            isLoading={isLoadingLeagues}
                        >
                            {leagues.map((league) => (
                                <SelectItem key={league.idLeague} value={league.idLeague}>{league.strLeague}</SelectItem>
                            ))}
                        </Select>
                    )
                }
                <Select
                    label="Select Match"
                    value={selectedMatch}
                    onChange={(e) => {
                        setSelectedMatch(e.target.value);
                        const homeTeam = matches.find(match => match.idEvent === e.target.value)?.strHomeTeam || "";
                        const awayTeam = matches.find(match => match.idEvent === e.target.value)?.strAwayTeam || "";
                        const draw = (predictionType === "soccer" || predictionType === "premier") ? "Draw" : "";
                        setOptions([homeTeam, awayTeam, draw]);
                        setHomeTeam(homeTeam);
                        setAwayTeam(awayTeam);
                        setMatchDate(matches.find(match => match.idEvent === e.target.value)?.dateEvent || "");
                    }}
                    isLoading={isLoadingMatches}
                >
                    {matches.map((match) => (
                        <SelectItem key={match.idEvent} value={match.idEvent}>
                            {`${match.strEvent} - ${match.dateEvent}`}
                        </SelectItem>
                    ))}
                </Select>
                <div className="flex flex-col gap-2">
                    <div className="text-sm font-bold">Add Context(Optional)</div>
                    <Textarea
                        placeholder="Provide any relevant information or context for agents to consider"
                        className="h-16"
                        value={context}
                        onChange={(e) => {
                            setContext(e.target.value);
                        }}
                    />
                </div>
                <div className="flex flex-col gap-2 w-full">
                    <div className="text-sm font-bold">Credit Pool</div>
                    <ButtonGroup
                        className="flex flex-row w-full border-dark-default border-2 rounded-lg justify-between bg-inherit"
                    >
                        {creditPoolOptions.map((option) => (
                            option.key &&
                            <Button
                                key={option.key}
                                value={option.key}
                                onPress={() => {
                                    setCreditPool(option.key);
                                }}
                                className={`w-full bg-transparent ${creditPool === option.key ? "text-white" : "text-light-gray"}`}
                            >
                                {option.name}
                            </Button>
                        ))}
                    </ButtonGroup>
                    <Input
                        placeholder="Enter Custom Credit Pool"
                        className={`w-full ${creditPool !== "custom" && "hidden"}`}
                        value={customCreditPool}
                        onChange={(e) => {
                            setCustomCreditPool(e.target.value);
                        }}
                        type="number"
                    />
                </div>
                <Button
                    color="primary"
                    onPress={handleCreateQuestion}
                    style={{
                        background: "linear-gradient(to right top, #7A34E2, #1DA1F2)"
                    }}
                >
                    Create a {creditPool !== "custom" ? creditPool : customCreditPool} Credit Question
                </Button>
            </div>
        </>
    )
}

export default SportsQuestion;