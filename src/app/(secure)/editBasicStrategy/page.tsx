'use client';

import { Card, CardBody, CardHeader } from "@nextui-org/card";
import { Input } from "@nextui-org/input";
import { Button } from "@nextui-org/button";
import { Select, SelectItem } from "@nextui-org/select";
import { Chip } from "@nextui-org/chip";
import { useState, useEffect } from "react";
import { IoArrowBack, IoSave } from "react-icons/io5";
import { IAgentProfile } from "@/app/utils/interface";
import { useFetch } from "@/app/utils/lib";
import toast from "react-hot-toast";
import { convertDaysToYMD } from "@/app/utils/lib";
import { CATEGORIES } from "@/app/utils/const";

const EditAgentProfile = () => {
  const [agent, setAgent] = useState<IAgentProfile | null>(null);
  const [resolutionDate, setResolutionDate] = useState<{ years: number, months: number, days: number }>({
    years: 0,
    months: 0,
    days: 0
  });
  const [isLoading, setIsLoading] = useState(true);
  const fetchData = useFetch();
  const [newInterest, setNewInterest] = useState('');
  
  const addInterest = () => {
    if (newInterest.trim() !== '' && agent) {
      setAgent({ ...agent, interests: [...agent.interests, newInterest] });
      setNewInterest('');
    }
  };

  const saveAgentProfile = async () => {
    if (!agent) return;
    const formData = new FormData();
    formData.append('name', agent.name || "");
    formData.append('description', agent.description || "");
    formData.append('maxBetSize', agent.maxBetSize?.toString() || "0");
    formData.append('interests', agent.interests.join(',') || "");
    formData.append('riskLevel', agent.riskLevel);
    formData.append('conservativeBetSize', agent.conservativeBetSize.toString());
    formData.append('moderateBetSize', agent.moderateBetSize.toString());
    formData.append('aggressiveBetSize', agent.aggressiveBetSize.toString());
    formData.append('principles', JSON.stringify(agent.principles));
    formData.append('image', agent.image || "");
    formData.append('maxTimelineLimit', agent.maxTimelineLimit.toString());
    formData.append('category', agent.category || "");

    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem("token") ?? "" : "";
      const response = await fetch('/api/saveAgentProfile', {
        method: 'POST',
        body: formData,
        headers: {
          'Authorization': `Bearer ${token}`,
        }
      });
      const data = await response.json();
      if (data.status) {
        toast.success(data.message);
      } else {
        toast.error(data.message);
      }
    } catch (error) {
      console.log(error);
      toast.error('Failed to save agent profile');
    }
  }

  useEffect(() => {
    const fetchAgentProfile = async () => {
      try {
        const response = await fetchData.get('/api/getAgentProfile');
        if (response.status) {
          setAgent(response.agent);
          setResolutionDate(convertDaysToYMD(response.agent.maxTimelineLimit));
        } else {
          toast.error(response.message);
        }
      } catch (error) {
        console.log(error);
        toast.error('Failed to fetch agent profile');
      }
      setIsLoading(false);
    };
    fetchAgentProfile();
  }, []);

  return (
    <div className="min-h-screen  min-w-[625px]">
      <header className="bg-content0 text-white py-8 rounded-b-2xl">
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-3xl font-bold">Edit Agent Profile</h1>
          <p className="mt-2 opacity-80">Customize your betting agent settings</p>
        </div>
      </header>

      {
        !isLoading && agent && (
          <main className="container mx-auto px-4 py-8">
            <Card className="mb-8 bg-content0">
              <CardHeader className="text-xl font-regular">Basic Settings</CardHeader>
              <CardBody className="space-y-6">
                <Input
                  label="Maximum Bet Size"
                  type="number"
                  endContent={<span className="text-default-400">credits</span>}
                  variant="bordered"
                  value={agent?.maxBetSize?.toString() || '0'}
                  onChange={(e) => setAgent({ ...agent, maxBetSize: parseInt(e.target.value) })}
                  min={0}
                />
                <Select
                  label="Category"
                  variant="bordered"
                  defaultSelectedKeys={[agent?.category]}
                  onChange={(e) => setAgent({ ...agent, category: e.target.value })}
                >
                  {CATEGORIES.map((category) => (
                    <SelectItem key={category.toLowerCase()}>{category}</SelectItem>
                  ))}
                </Select>

                <div className="flex flex-col gap-2">
                  <div className="flex gap-4">
                    <Input
                      label="Years"
                      type="number"
                      variant="bordered"
                      value={resolutionDate?.years?.toString() || '0'}
                      onChange={(e) => {
                        const years = parseInt(e.target.value);
                        const totalDays = (years * 365) + (resolutionDate?.months || 0) * 30 + (resolutionDate?.days || 0);
                        setAgent({ ...agent, maxTimelineLimit: totalDays });
                        setResolutionDate({ ...resolutionDate, years });
                      }}
                    />
                    <Input
                      label="Months" 
                      type="number"
                      variant="bordered"
                      value={resolutionDate?.months?.toString() || '0'}
                      onChange={(e) => {
                        const months = parseInt(e.target.value);
                        const totalDays = ((resolutionDate?.years || 0) * 365) + (months * 30) + (resolutionDate?.days || 0);
                        setAgent({ ...agent, maxTimelineLimit: totalDays });
                        setResolutionDate({ ...resolutionDate, months });
                      }}
                      min={0}
                    />
                    <Input
                      label="Days"
                      type="number"
                      variant="bordered" 
                      value={resolutionDate?.days?.toString() || '0'}
                      onChange={(e) => {
                        const days = parseInt(e.target.value);
                        const totalDays = ((resolutionDate?.years || 0) * 365) + ((resolutionDate?.months || 0) * 30) + days;
                        setAgent({ ...agent, maxTimelineLimit: totalDays });
                        setResolutionDate({ ...resolutionDate, days });
                      }}
                      min={0}
                    />
                  </div>
                </div>
              </CardBody>
            </Card>

            <Card className="mb-8 bg-content0">
              <CardHeader className="text-xl font-regular">Interests</CardHeader>
              <CardBody>
                <div className="flex flex-wrap gap-2 mb-4">
                  {agent.interests && agent.interests.length > 0 && agent.interests.map((interest) => (
                    <Chip
                      key={interest}
                      onClose={() => setAgent({ ...agent, interests: agent.interests.filter(i => i !== interest) })}
                      variant="flat"
                    >
                      {interest}
                    </Chip>
                  ))}
                </div>
                <Input
                  label="Add Interest"
                  placeholder="Enter new interest"
                  variant="bordered"
                  value={newInterest}
                  onChange={(e) => setNewInterest(e.target.value)}
                  endContent={
                    <Button size="sm" onPress={addInterest}>Add</Button>
                  }
                />
              </CardBody>
            </Card>

            <div className="flex justify-end gap-2 mt-6">
              <Button
                color="danger"
                variant="flat"
                className="w-full"
                href="/strategy"
                as="a"
                startContent={<IoArrowBack size={20} />}
              >
                Back
              </Button>
              <Button
                color="primary"
                onPress={saveAgentProfile}
                className="w-full"
                startContent={<IoSave size={20} />}
              >
                Save Changes
              </Button>
            </div>
          </main>
        )
      }
    </div>
  );
};

export default EditAgentProfile;