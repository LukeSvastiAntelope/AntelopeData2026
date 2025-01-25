'use client';

import { Card, CardBody, CardHeader } from "@heroui/card";
import { Button } from "@heroui/button";
import { useState, useEffect } from "react";
import { IoArrowBack, IoSave } from "react-icons/io5";
import { IAgentProfile } from "@/app/utils/interface";
import { useFetch } from "@/app/utils/lib";
import toast from "react-hot-toast";
import EditablePrincipleCard from "@/app/components/EditPrincipleCard";

const EditAgentProfile = () => {
  const [agent, setAgent] = useState<IAgentProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const fetchData = useFetch();

  const updatePrinciple = (index: number, field: 'title' | 'description', value: string) => {
    setAgent(agent ? {
      ...agent, principles: agent.principles.map((principle, i) =>
        i === index ? { ...principle, [field]: value } : principle
      )
    } : null);
  };

  const addPrinciple = () => {
    setAgent(agent ? { ...agent, principles: [...agent.principles, { title: "New Principle", description: "Description" }] } : null);
  };

  const deletePrinciple = (index: number) => {
    setAgent(agent ? { ...agent, principles: agent.principles.filter((_, i) => i !== index) } : null);
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
            <Card className="mb-8 bg-background0">
              <CardHeader className="flex justify-between items-center">
                <h2 className="text-xl font-regular">Betting Principles</h2>
                <Button
                  color="primary"
                  size="sm"
                  onPress={addPrinciple}
                >
                  Add Principle
                </Button>
              </CardHeader>
              <CardBody>
                <div className="grid grid-cols-1 md:grid-cols-1 gap-4 ">
                  {agent.principles.length > 0 && agent.principles.map((principle, index) => (
                    <EditablePrincipleCard
                      key={index}
                      title={principle.title}
                      description={principle.description}
                      onTitleChange={(value) => updatePrinciple(index, 'title', value)}
                      onDescriptionChange={(value) => updatePrinciple(index, 'description', value)}
                      onDelete={() => deletePrinciple(index)}
                    />
                  ))}
                </div>
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