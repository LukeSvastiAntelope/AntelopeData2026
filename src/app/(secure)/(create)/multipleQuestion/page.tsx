"use client"

import { Input, Textarea } from "@heroui/input";
import { Select, SelectItem } from "@heroui/select";
import { Button, ButtonGroup } from "@heroui/button";
import { DatePicker, DateValue } from "@heroui/react";
import { useState } from "react";
import { parseDate, CalendarDate } from '@internationalized/date';
import { toast } from "react-hot-toast";
import { useFetch } from "@/app/utils/lib";

const predictionTypes = [
    { key: "google_news", name: "General" },
    { key: "google_finance", name: "Markets" },
    { key: "coinmarketcap", name: "Crypto" },
]

const expirationOptions = [
    { key: "", name: "" },
    { key: "day", name: "1 Day" },
    { key: "week", name: "Week" },
    { key: "month", name: "Month" },
    { key: "year", name: "This Year" },
]

const creditPoolOptions = [
    { key: "10", name: "10 Credits" },
    { key: "100", name: "100 Credits" },
    { key: "500", name: "500 Credits" },
    { key: "custom", name: "Custom" },
]

const MultipleQuestion = () => {
    const fetch = useFetch();

    const [predictionType, setPredictionType] = useState("");
    const [question, setQuestion] = useState("");
    const [context, setContext] = useState("");
    const [expiration, setExpiration] = useState("day");
    const [expirationDate, setExpirationDate] = useState<CalendarDate>(parseDate(new Date().toISOString().split('T')[0]));
    const [creditPool, setCreditPool] = useState("10");
    const [customCreditPool, setCustomCreditPool] = useState("0");
    const [options, setOptions] = useState(["", ""]);
    const [isSaving, setIsSaving] = useState(false);

    const handleCreateQuestion = async () => {
        if (isSaving) {
            return;
        }
        setIsSaving(true);
        const date = new Date();
        if (expiration == "day") {
            date.setDate(date.getDate() + 1);
        } else if (expiration == "week") {
            date.setDate(date.getDate() + 7);
        } else if (expiration == "month") {
            date.setMonth(date.getMonth() + 1);
        } else if (expiration == "year") {
            date.setFullYear(date.getFullYear() + 1);
        }
        const payload = {
            source: predictionType,
            description: question,
            context: context,
            resolutionDate: expiration == "" ? expirationDate.toString() : date.toISOString(),
            betAmount: creditPool == "custom" ? customCreditPool : creditPool,
            choices: options,
        }
        if (!payload.source || !payload.description || !payload.resolutionDate || !payload.betAmount || !payload.choices) {
            toast.error("Please fill all required fields");
            return;
        }
        if (options.length < 2) {
            toast.error("Please add at least 2 options");
            return;
        }
        try {
            const response = await fetch.post("/api/createQuestion", payload);
            if (response.status) {
                toast.success("Question created successfully");
            } else {
                toast.error(response.message);
            }
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "An unknown error occurred");
        } finally {
            setIsSaving(false);
        }
    }

    return (
        <>
            <div className="text-xl font-bold text-white py-2">Choose Question {">"} Multiple Choice</div>
            <div className="mt-4 bg-custom-prediction-modal-bg px-4 py-6 rounded-lg flex flex-col gap-8">
                <div className="flex flex-col gap-2">
                    <div className="text-sm font-bold">Select Category</div>
                    <Select
                        label="Select Category"
                        value={predictionType}
                        onChange={(e) => {
                            setPredictionType(e.target.value);
                        }}
                    >
                        {predictionTypes.map((type) => (
                            <SelectItem key={type.key} value={type.key}>
                                {type.name}
                            </SelectItem>
                        ))}
                    </Select>
                </div>
                <div className="flex flex-col gap-2">
                    <div className="text-sm font-bold">Question</div>
                    <Textarea
                        placeholder="Will the US plant a flag on Mars by 2027?"
                        className="h-16"
                        value={question}
                        onChange={(e) => {
                            setQuestion(e.target.value);
                        }}
                    />
                    {
                        options.map((option, index) => (
                            <div key={index} className="flex gap-2 items-center">
                                <div className="text-sm font-bold w-[30px] text-center">{index + 1}</div>
                                <Input
                                    placeholder={`Option ${index + 1}`}
                                    value={option}
                                    onChange={(e) => {
                                        setOptions(options => [...options.slice(0, index), e.target.value, ...options.slice(index + 1)]);
                                    }}
                                />
                            </div>
                        ))
                    }
                    <div className="flex gap-2">
                        <div className="w-[30px]"></div>
                        <Button
                            className="w-full bg-inherit border-dark-default border-2 rounded-lg"
                            onPress={() => {
                                setOptions([...options, ""]);
                            }}
                        >
                            Add Answer
                        </Button>
                    </div>
                </div>
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
                    <div className="text-sm font-bold">Add Expiration</div>
                    <ButtonGroup
                        className="flex flex-row w-full border-dark-default border-2 rounded-lg justify-between bg-inherit"
                    >
                        {expirationOptions.map((option) => (
                            option.key &&
                            <Button
                                key={option.key}
                                value={option.key}
                                onPress={() => {
                                    setExpiration(option.key);
                                }}
                                className={`w-full bg-transparent ${expiration === option.key ? "text-white" : "text-light-gray"}`}
                            >
                                {option.name}
                            </Button>
                        ))}
                    </ButtonGroup>
                    <DatePicker
                        granularity="day"
                        className={`w-40 ${expiration == "" ? 'text-white' : 'text-light-gray'}`}
                        value={expirationDate}
                        onChange={(e: DateValue | null) => {
                            setExpiration("");
                            setExpirationDate(e as CalendarDate);
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
                    isLoading={isSaving}
                >
                    Create a {creditPool !== "custom" ? creditPool : customCreditPool} Credit Question
                </Button>
            </div>
        </>
    )
}

export default MultipleQuestion;