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

/**
 * StrategySkeleton: Skeleton loader that matches the layout for “Strategy Page”
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
 * A dedicated page to show the user’s betting strategy details, 
 * risk profile, etc., matching the layout from the Profile page.
 */
export default function StrategyPage() {
  const [agent, setAgent] = useState<IAgentProfile | null>(null);
  const [resolutionDate, setResolutionDate] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const fetch = useFetch();

  useEffect(() => {
    const fetchAgentProfile = async () => {
      try {
        // For demonstration, reusing the same endpoint as the profile.
        // If your backend provides a separate endpoint, replace accordingly.
        const response = await fetch.get("/api/getAgentProfile");
        if (response.status) {
          setAgent(response.agent);
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

      {/* Betting Settings */}
      <Card className="my-8 bg-content0">
        <CardHeader className="text-medium font-regular flex justify-between">
          Betting Basic
          <Button
            color="default"
            variant="flat"
            className=""
            href="/editBasicStrategy"
            as="a"
          >
            Edit
          </Button>
        </CardHeader>
        <Divider />
        <CardBody>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
            <h3 className="text-default-500 mb-2">Main Category</h3>
              <Chip color="primary" variant="flat">
                {agent?.category
                  ? CATEGORIES.find(
                    (category) =>
                      category.toLowerCase() === agent?.category.toLowerCase()
                  ) || "General"
                  : "General"}
              </Chip>
            </div>
            
            <div>
              <h3 className="text-default-500 mb-2">Resolution Preference</h3>
              <p className="text-base font-semibold">{resolutionDate}</p>
            </div>
            
          </div>
        </CardBody>

        <Divider />

        {/* Core Interests */}

       
       
        <CardBody>
        <CardHeader className="text-medium font-regular px-0 pt-0 text-default-500">Sub-category Interests</CardHeader>
          <div className="flex flex-wrap gap-2">
            {agent?.interests && agent?.interests.length > 0 ? (
              agent?.interests.map((interest) => (
                <Chip key={interest} color="primary" variant="flat">
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
        <CardHeader className="text-medium font-regular flex justify-between">
          Betting Principles
          <Button
            color="default"
            variant="flat"
            className=""
            href="/editPrinciples"
            as="a"
          >
            Edit
          </Button>
        </CardHeader>
        <Divider />
        <CardBody>
          <div className="grid grid-cols-1 md:grid-cols-1 gap-4">
            {agent?.principles && agent?.principles.length > 0 ? (
              agent?.principles.map((principle) => (
                
                <PrincipleCard
                  key={principle.title}
                  title={principle.title}
                  description={principle.description}
                  
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
        <CardHeader className="text-medium font-regular flex justify-between">
          Risk Profile ({agent?.riskLevel})
          <Button
            color="default"
            variant="flat"
            className=""
            href="/editRiskStrategy"
            as="a"
          >
            Edit
          </Button>
        </CardHeader>
        <Divider />
        <CardBody>
          <div className="space-y-6">
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
}

const PrincipleCard = ({ title, description }: PrincipleCardProps) => (
  <Card shadow="sm">
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
      <span className="font-regular">{level}</span>
      <span className="text-default-500">{description}</span>
    </div>
    <Progress color={color} value={value} className="max-w-full" />
  </div>
); 