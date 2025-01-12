import {
    Modal,
    ModalContent,
    ModalHeader,
    ModalBody,
    ModalFooter,
} from "@nextui-org/modal";
import { Select, SelectItem } from "@nextui-org/select";
import { Input } from "@nextui-org/input";
import { Radio, RadioGroup } from "@nextui-org/radio";
import { Button } from "@nextui-org/button";
import { useEffect, useState } from "react";
import { useFetch } from "../utils/lib";
import { toast } from "react-hot-toast";

// Add new interfaces
interface IPredictionType {
    id: string;
    name: string;
    leagueId: string;
}

interface IMatch {
    idEvent: string;
    strEvent: string;
    strHomeTeam: string;
    strAwayTeam: string;
    dateEvent: string;
    strLeague: string;
    strThumb: string;
}

// Add prediction types
const predictionTypes: IPredictionType[] = [
    { id: "custom", name: "Create Prediction", leagueId: "" },
    { id: "soccer", name: "Predict Soccer", leagueId: "" },
    { id: "premier", name: "Predict Premier League", leagueId: "4328" },
    { id: "nfl", name: "Predict NFL", leagueId: "4391" },
    { id: "nba", name: "Predict NBA", leagueId: "4387" },
];

interface ILeague {
    idLeague: string;
    strLeague: string;
    strSport: string;
}

const PredictionDialog = ({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) => {

    const [predictionType, setPredictionType] = useState<string>("");
    const [description, setDescription] = useState<string>("");
    const [source, setSource] = useState<string>("google_news");
    const [sourceUrl, setSourceUrl] = useState<string>("");
    const [dateGranularity, setDateGranularity] = useState<string>("");
    const [resolutionDate, setResolutionDate] = useState<string>("");
    const [betAmount, setBetAmount] = useState<string>("");
    const [choice, setChoice] = useState<string>("");
    const [matches, setMatches] = useState<IMatch[]>([]);
    const [selectedMatch, setSelectedMatch] = useState<string>("");
    const [leagues, setLeagues] = useState<ILeague[]>([]);
    const [selectedLeague, setSelectedLeague] = useState<string>("");
    const [homeTeam, setHomeTeam] = useState<string>("");
    const [awayTeam, setAwayTeam] = useState<string>("");
    const [matchDate, setMatchDate] = useState<string>("");
    const [isLoadingLeagues, setIsLoadingLeagues] = useState<boolean>(false);
    const [isLoadingMatches, setIsLoadingMatches] = useState<boolean>(false);
    const fetchData = useFetch();

    const handleCreatePrediction = async () => {
        try {
            const payload = predictionType === "custom"
                ? {
                    type: predictionType,
                    description,
                    source,
                    source_url: source === "custom" ? sourceUrl : "",
                    date_granularity: dateGranularity,
                    resolutionDate,
                    bet_amount: parseFloat(betAmount),
                    choice,
                }
                : {
                    type: predictionType,
                    matchId: selectedMatch,
                    homeTeam: homeTeam,
                    awayTeam: awayTeam,
                    resolutionDate: matchDate,
                    bet_amount: parseFloat(betAmount),
                    choice,
                    leagueId: selectedLeague,
                    source: "sportDB",
                    strThumb: matches.find(match => match.idEvent === selectedMatch)?.strThumb || "",
                    description: matches.find(match => match.idEvent === selectedMatch)?.strEvent || "",
                };

            if (payload.type === "custom" && (!payload.description || !payload.source || !payload.source_url || !payload.resolutionDate || !payload.bet_amount || !payload.choice)) {
                toast.error("All fields are required");
                return;

            } else if (payload.type !== "custom" && (!payload.matchId || !payload.homeTeam || !payload.awayTeam || !payload.resolutionDate || !payload.bet_amount || !payload.choice || !payload.leagueId || !payload.strThumb || !payload.description)) {
                toast.error("All fields are required");
                return;
            }

            const response = await fetchData.post("/api/createPrediction", payload);
            if (response.status) {
                toast.success("Prediction created successfully");
                onClose();
            } else {
                toast.error(response.message);
            }
        } catch (error) {
            console.log(error);
            toast.error("Failed to create prediction");
        }
    };

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
        <Modal isOpen={isOpen} onClose={onClose} size="2xl" isDismissable={false}>
            <ModalContent>
                <ModalHeader>Create New Prediction</ModalHeader>
                <ModalBody>
                    <div className="space-y-4">
                        <Select
                            label="Prediction Type"
                            value={predictionType}
                            onChange={(e) => {
                                setPredictionType(e.target.value);
                                setSelectedLeague(predictionTypes.find(type => type.id === e.target.value)?.leagueId || "");
                            }}
                        >
                            {predictionTypes.map((type) => (
                                <SelectItem key={type.id} value={type.id}>
                                    {type.name}
                                </SelectItem>
                            ))}
                        </Select>

                        {predictionType === "custom" ? (
                            <>
                                <Input
                                    label="Description"
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    maxLength={250}
                                />

                                <Select
                                    label="Verification Source"
                                    value={source}
                                    onChange={(e) => setSource(e.target.value)}
                                >
                                    <SelectItem key="google_news" value="google_news">Google News</SelectItem>
                                    <SelectItem key="google_finance" value="google_finance">Google Finance</SelectItem>
                                    <SelectItem key="coinmarketcap" value="coinmarketcap">CoinMarketCap</SelectItem>
                                    <SelectItem key="custom" value="custom">Custom</SelectItem>
                                </Select>

                                {source === "custom" && (
                                    <Input
                                        label="Source URL"
                                        value={sourceUrl}
                                        onChange={(e) => setSourceUrl(e.target.value)}
                                    />
                                )}

                                <Select
                                    label="Date Granularity"
                                    value={dateGranularity}
                                    onChange={(e) => setDateGranularity(e.target.value)}
                                >
                                    <SelectItem key="date" value="date">Date Only</SelectItem>
                                    <SelectItem key="datetime" value="datetime">Date + Time</SelectItem>
                                </Select>

                                <Input
                                    type={dateGranularity === "date" ? "date" : "datetime-local"}
                                    label="Resolution Date"
                                    value={resolutionDate}
                                    onChange={(e) => setResolutionDate(e.target.value)}
                                />

                                <RadioGroup
                                    label="Choice"
                                    value={choice}
                                    onChange={(e) => setChoice(e.target.value)}
                                >
                                    <Radio value="yes" key="yes">Yes</Radio>
                                    <Radio value="no" key="no">No</Radio>
                                </RadioGroup>
                            </>
                        ) : (
                            <>
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
                                        setHomeTeam(matches.find(match => match.idEvent === e.target.value)?.strHomeTeam || "");
                                        setAwayTeam(matches.find(match => match.idEvent === e.target.value)?.strAwayTeam || "");
                                        setMatchDate(matches.find(match => match.idEvent === e.target.value)?.dateEvent || "");
                                        setChoice("");
                                    }}
                                    isLoading={isLoadingMatches}
                                >
                                    {matches.map((match) => (
                                        <SelectItem key={match.idEvent} value={match.idEvent}>
                                            {`${match.strEvent} - ${match.dateEvent}`}
                                        </SelectItem>
                                    ))}
                                </Select>
                                {
                                    selectedMatch &&
                                    <RadioGroup
                                        label="Prediction"
                                        value={choice}
                                        onChange={(e) => setChoice(e.target.value)}
                                    >
                                        <Radio value={homeTeam} key={homeTeam}>{homeTeam}</Radio>
                                        <Radio value={awayTeam} key={awayTeam}>{awayTeam}</Radio>
                                        {
                                            (predictionType === "soccer" || predictionType === "premier")
                                            && <Radio value="Draw" key="Draw">Draw</Radio>
                                        }
                                    </RadioGroup>
                                }
                            </>
                        )}

                        <Input
                            type="number"
                            label="Bet Amount"
                            value={betAmount}
                            onChange={(e) => setBetAmount(e.target.value)}
                        />
                    </div>
                </ModalBody>
                <ModalFooter>
                    <Button color="primary" onPress={handleCreatePrediction}>Create</Button>
                    <Button color="danger" onPress={onClose}>Cancel</Button>
                </ModalFooter>
            </ModalContent>
        </Modal>
    )
}

export default PredictionDialog;