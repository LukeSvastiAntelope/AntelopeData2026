"use client";

import { Card, CardBody, CardHeader } from "@nextui-org/card";
import { Chip } from "@nextui-org/chip";
import { Progress } from "@nextui-org/progress";
import { Divider } from "@nextui-org/divider";
import { Skeleton } from "@nextui-org/skeleton";
import { Button } from "@nextui-org/button";
import { useState, useEffect } from "react";
import toast from "react-hot-toast";
import { useFetch } from "@/app/utils/lib";
import { IAgentProfile } from "@/app/utils/interface";
import { convertDaysToYMD } from "@/app/utils/lib";
import { CATEGORIES } from "@/app/utils/const";
import { Switch } from "@nextui-org/switch";
import { Tooltip } from "@nextui-org/tooltip";

/**
 * StrategySkeleton: Skeleton loader that matches the layout for "Strategy Page"
 * Adapted from ProfileSkeleton for consistency.
 */
const StrategySkeleton = () => {
  return (
    <div>
      {/* Header Section */}
      <div className="flex flex-row justify-between h-32">
        <div className="pr-8 pt-2">
          <Skeleton className="h-8 w-48 rounded-lg mb-2" /> {/* Strategy title */}
          <Skeleton className="h-4 w-96 rounded-lg" /> {/* Description */}
        </div>
      </div>

      {/* Strategy Adjustment Banner */}
      <div className="flex flex-row justify-between bg-content0 p-2 my-8 rounded-lg items-center">
        <Skeleton className="h-6 w-64 rounded-lg" />
        <Skeleton className="h-10 w-32 rounded-lg" />
      </div>

      {/* Betting Settings Card */}
      <Card className="mb-8 bg-content0">
        <CardHeader>
          <Skeleton className="h-6 w-36 rounded-lg" />
        </CardHeader>
        <Divider />
        <CardBody>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <Skeleton className="h-4 w-32 rounded-lg mb-2" />
              <Skeleton className="h-8 w-24 rounded-full" />
            </div>
            <div>
              <Skeleton className="h-4 w-40 rounded-lg mb-2" />
              <Skeleton className="h-6 w-48 rounded-lg" />
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Stats Skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8 text-small">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="bg-content0 text-small">
            <CardBody className="flex flex-row items-center gap-4 text-small">
              <Skeleton className="w-6 h-6 rounded-lg text-small" />
              <div>
                <Skeleton className="h-4 w-24 rounded-lg mb-2 text-small" />
                <Skeleton className="h-6 w-20 rounded-lg text-small" />
              </div>
            </CardBody>
          </Card>
        ))}
      </div>

      {/* Interests Skeleton */}
      <Card className="mb-8">
        <CardHeader>
          <Skeleton className="h-6 w-32 rounded-lg" />
        </CardHeader>
        <Divider />
        <CardBody>
          <div className="flex flex-wrap gap-2">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-8 w-24 rounded-full" />
            ))}
          </div>
        </CardBody>
      </Card>

      {/* Principles Skeleton */}
      <Card className="mb-8">
        <CardHeader>
          <Skeleton className="h-6 w-40 rounded-lg" />
        </CardHeader>
        <Divider />
        <CardBody>
          <div className="space-y-4">
            {[...Array(2)].map((_, i) => (
              <Card key={i} shadow="sm">
                <CardBody className="p-2 bg-none">
                  <Skeleton className="h-5 w-32 rounded-lg mb-2" />
                  <Skeleton className="h-4 w-full rounded-lg" />
                </CardBody>

              </Card>

            ))}
          </div>
        </CardBody>

      </Card>

      {/* Risk Profile Skeleton */}
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32 rounded-lg" />
        </CardHeader>
        <Divider />
        <CardBody>
          <div className="space-y-6">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="space-y-2">
                <div className="flex justify-between items-center">
                  <Skeleton className="h-4 w-24 rounded-lg" />
                  <Skeleton className="h-4 w-32 rounded-lg" />
                </div>
                <Skeleton className="h-2 w-full rounded-lg" />
              </div>
            ))}
          </div>
        </CardBody>
      </Card>
    </div>
  );
};

/**
 * StrategyPage: 
 * A dedicated page to show the user's betting strategy details, 
 * risk profile, etc., matching the layout from the Profile page.
 */
export default function StrategyPage() {
  const [agent, setAgent] = useState<IAgentProfile | null>(null);
  const [resolutionDate, setResolutionDate] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isBettingEnabled, setIsBettingEnabled] = useState(false);
  const fetch = useFetch();

  useEffect(() => {
    const fetchAgentProfile = async () => {
      setIsLoading(true);
      try {
        // For demonstration, reusing the same endpoint as the profile.
        // If your backend provides a separate endpoint, replace accordingly.
        const response = await fetch.get("/api/getAgentProfile");
        if (response.status) {
          setAgent(response.agent);
          setIsBettingEnabled(response.agent.is_bet || false);
          const { years, months, days } = convertDaysToYMD(response.agent.maxTimelineLimit);
          setResolutionDate(
            `${years ? `${years} years ` : ""}${months ? `${months} months ` : ""
            }${days ? `${days} days` : ""}`
          );
        } else {
          toast.error(response.message);
        }
      } catch (error) {
        console.log(error);
        toast.error("Failed to fetch strategy info");
      }
      setIsLoading(false);
    };

    fetchAgentProfile();
  }, []);

  const handleBettingToggle = async (isSelected: boolean) => {
    try {
      const response = await fetch.post("/api/updateBettingStatus", {
        is_bet: isSelected
      });
      if (response.status) {
        setIsBettingEnabled(isSelected);
        toast.success(isSelected ? "Betting enabled" : "Betting disabled");
      } else {
        toast.error(response.message);
      }
    } catch (error) {
      console.error(error);
      toast.error("Failed to update betting status");
    }
  };

  if (isLoading) return <StrategySkeleton />;

  return (
    <>
      <div className="flex flex-row justify-between h-fit">
        <div className="pr-8 pt-2">
          <h1 className="font-bold mb-2 font-kodemono ">
            Strategy
          </h1>
          <p className="text-gray-500 h1paragraph">
            Refine the core principles of your betting approach, manage risk levels, and set preferred categories and timelines.
          </p>
        </div>
      </div>

      <div className="flex flex-col banner-image p-6 rounded-lg mt-8">
        <Tooltip content="Begin an interactive session to train your agent" showArrow>
          <h3 className="text-2xl font-bold text-white font-kodemono mb-2">Train Your Agent</h3>
        </Tooltip>
        <p className="text-small w-1/2 text-white mb-4">
          Tell the agent your interest and it will ask you a set of questions to understand your line of thinking.
        </p>
        <Tooltip content="Click here to start an AI-driven training dialog" showArrow>
          <Button
            color="primary"
            variant="flat"
            className="text-small w-fit bg-white px-8"
            href="/ask-agent?mode=train"
            size="sm"
            as="a"
          >
            Start Training
          </Button>
        </Tooltip>
      </div>

      <Card className="my-8 bg-content0">
        <CardBody className="flex flex-row justify-between items-center">
          <Tooltip
            content={
              isBettingEnabled
                ? "Agent's automated betting is currently enabled"
                : "Agent's automated betting is currently disabled"
            }
            showArrow
          >
            <div>
              <p className="text-default-500 text-small">
                {isBettingEnabled ? "Betting is currently enabled" : "Betting is currently disabled"}
              </p>
            </div>
          </Tooltip>
          <Switch
            isSelected={isBettingEnabled}
            onValueChange={handleBettingToggle}
            color="success"
            size="sm"
          />
        </CardBody>
      </Card>

      <Card className="my-8 bg-content0 ">
        <CardHeader className="text-small font-regular flex justify-between">
          <span className="message-circle ml-1">Talk strategy with your agent</span>
          <Button color="primary" variant="flat" className="text-small" href="/ask-agent" size="sm" as="a">
            Talk
          </Button>
        </CardHeader>
      </Card>

      <Card className="my-8 bg-content0">
        <CardHeader className="text-small font-regular flex justify-between ml-2">
          Betting Basic
          <Tooltip content="Adjust your agent's basic betting preferences" showArrow>
            <Button
              color="default"
              variant="flat"
              className="mr-2"
              href="/editBasicStrategy"
              as="a"
              size="sm"
            >
              Edit
            </Button>
          </Tooltip>
        </CardHeader>
        <Divider />

        <CardBody>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 ml-2">
            <div>
              <Tooltip content="Focus area for this agent's predictions" showArrow>
                <h3 className="text-default-500 mb-2 text-small">Main Category</h3>
              </Tooltip>
              <Chip color="primary" variant="flat" size="sm">
                {agent?.category
                  ? CATEGORIES.find(
                    (category) =>
                      category.toLowerCase() === agent?.category.toLowerCase()
                  ) || "General"
                  : "General"}
              </Chip>
            </div>

            <div>
              <Tooltip content="How many days into the future your agent is willing to wait for a bet resolution" showArrow>
                <h3 className="text-default-500 mb-2 text-small">Resolution Preference</h3>
              </Tooltip>
              <p className="font-semibold text-small">{resolutionDate}</p>
            </div>

          </div>
        </CardBody>

        <CardBody>
          <CardHeader className="font-regular px-0 pt-0 text-default-500 text-small ml-2">Sub-category Interests</CardHeader>
          <div className="flex flex-wrap gap-2 ml-2">
            {agent?.interests && agent?.interests.length > 0 ? (
              agent?.interests.map((interest) => (
                <Chip key={interest} color="primary" variant="flat" size="sm">
                  {interest}
                </Chip>
              ))
            ) : (
              <p className="text-default-500">No interests listed.</p>
            )}
          </div>
        </CardBody>
      </Card>

      {/* Betting Principles */}
      <Card className="mb-8 bg-content0">
        <CardHeader className="text-small font-regular flex justify-between mx-2">
        <Tooltip content="A principle guides the agent's betting ethics or approach" showArrow>
          Betting Principles
        </Tooltip>
          <Tooltip content="Edit the guidelines that shape your agent's betting approach" showArrow>
            <Button
              color="default"
              variant="flat"
              className="mr-2"
              href="/editPrinciples"
              as="a"
              size="sm"
            >
              Edit
            </Button>
          </Tooltip>
        </CardHeader>
        <Divider />
        <CardBody>
          <div className="grid grid-cols-1 md:grid-cols-1 gap-1 text-small">
            {agent?.principles && agent?.principles.length > 0 ? (
              agent?.principles.map((principle, index) => (
                <PrincipleCard
                  key={principle.title}
                  title={principle.title}
                  description={principle.description}
                  index={index}
                />
              ))
            ) : (
              <p className="text-default-500">No principles added.</p>
            )}
          </div>
        </CardBody>
      </Card>

      {/* Risk Profile */}
      <Card className="bg-content0">
        <CardHeader className="text-small font-regular flex justify-between mx-2">
          <Tooltip content="Fine-tune your agent's risk thresholds and bet sizes" showArrow>
            <span>Risk Profile ({agent?.riskLevel})</span>
          </Tooltip>
          <Tooltip content="Fine-tune your agent's risk thresholds and bet sizes" showArrow>
            <Button
              color="default"
              variant="flat"
              className="mr-2"
              href="/editRiskStrategy"
              as="a"
              size="sm"
            >
              Edit
            </Button>
          </Tooltip>
        </CardHeader>
        <Divider />
        <CardBody>
          <div className="space-y-6 text-small mx-2">
      
            <RiskItem
              level="Conservative"
              description={agent?.conservativeBetSize?.toString() || "0"}
              value={(agent?.conservativeBetSize ?? 0) * 100 / (agent?.maxBetSize ?? 1)}
              color="success"
            />
     
            <RiskItem
              level="Moderate"
              description={agent?.moderateBetSize?.toString() || "0"}
              value={(agent?.moderateBetSize ?? 0) * 100 / (agent?.maxBetSize ?? 1)}
              color="warning"
              />
    
            <RiskItem
              level="Aggressive"
              description={agent?.aggressiveBetSize?.toString() || "0"}
              value={(agent?.aggressiveBetSize ?? 0) * 100 / (agent?.maxBetSize ?? 1)}
              color="danger"
            />
        
          </div>
        </CardBody>
      </Card>
    </>
  );
}

interface PrincipleCardProps {
  title: string;
  description: string;
  index: number;
}

const PrincipleCard = ({ title, description }: PrincipleCardProps) => (
  <Card shadow="none" className="bg-transparent">
    <CardBody>
      
        <h3 className="font-regular mb-2">{title}</h3>
     
      <p className="text-default-500">{description}</p>
    </CardBody>
  </Card>
);

interface RiskItemProps {
  level: string;
  description: string;
  value: number;
  color: "success" | "warning" | "danger";
}

const RiskItem = ({ level, description, value, color }: RiskItemProps) => (
  <div className="space-y-2">
    <div className="flex justify-between items-center">
      <Tooltip content={`${level} risk attitude label`} showArrow>
     
        <span className="font-regular">{level}</span>
      </Tooltip>
      <span className="text-default-500">{description}</span>
    </div>

    <Progress color={color} value={value} className="max-w-full" />
  </div>
); 