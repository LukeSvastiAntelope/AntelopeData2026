'use client';

import { Card, CardBody, CardHeader } from "@nextui-org/card";
import { Input, Textarea } from "@nextui-org/input";
import { Button } from "@nextui-org/button";
import { Select, SelectItem } from "@nextui-org/select";
import { Chip } from "@nextui-org/chip";
import Image from "next/image";
import { useState, useCallback, useRef, useEffect } from "react";
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
  const fileRef = useRef<HTMLInputElement | null>(null);

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
    const avatarFile = fileRef?.current?.files?.[0];
    if (avatarFile) {
        formData.append('avatar', avatarFile);
    }
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
            <ImageUpload fileRef={fileRef} avatar={agent.image} />
            <Card className="mb-8 bg-content0">
              <CardHeader className="text-xl font-regular">Basic Settings</CardHeader>
              <CardBody className="space-y-6">
                <Input
                  label="Agent Name"
                  variant="bordered"
                  value={agent?.name}
                  onChange={(e) => setAgent({ ...agent, name: e.target.value })}
                />
                <Textarea
                  label="Description"
                  defaultValue="Specialized in space industry predictions"
                  variant="bordered"
                  value={agent?.description}
                  onChange={(e) => setAgent({ ...agent, description: e.target.value })}
                />
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

            <Card className="mb-8 bg-content0">
              <CardHeader className="text-xl font-regular">Risk Settings</CardHeader>
              <CardBody className="space-y-6">
                <Select
                  label="Default Risk Level"
                  variant="bordered"
                  defaultSelectedKeys={[agent?.riskLevel]}
                  onChange={(e) => setAgent({ ...agent, riskLevel: e.target.value as 'conservative' | 'moderate' | 'aggressive' })}
                >
                  <SelectItem key="conservative" value="conservative">Conservative</SelectItem>
                  <SelectItem key="moderate" value="moderate">Moderate</SelectItem>
                  <SelectItem key="aggressive" value="aggressive">Aggressive</SelectItem>
                </Select>

                <Input
                  label="Conservative Bet Size"
                  type="number"
                  endContent={<span className="text-default-400">credits</span>}
                  variant="bordered"
                  value={agent?.conservativeBetSize?.toString() || '0'}
                  onChange={(e) => setAgent({ ...agent, conservativeBetSize: parseInt(e.target.value) })}
                  min={0}
                />
                <Input
                  label="Moderate Bet Size"
                  type="number"
                  endContent={<span className="text-default-400">credits</span>}
                  variant="bordered"
                  value={agent?.moderateBetSize?.toString() || '0'}
                  onChange={(e) => setAgent({ ...agent, moderateBetSize: parseInt(e.target.value) })}
                  min={0}
                />
                <Input
                  label="Aggressive Bet Size"
                  type="number"
                  endContent={<span className="text-default-400">credits</span>}
                  variant="bordered"
                  value={agent?.aggressiveBetSize?.toString() || '0'}
                  onChange={(e) => setAgent({ ...agent, aggressiveBetSize: parseInt(e.target.value) })}
                  min={0}
                />
              </CardBody>
            </Card>

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
                href="/profile"
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


const ImageUpload = ({ fileRef, avatar }: { fileRef: React.RefObject<HTMLInputElement>, avatar: string }) => {
  const [image, setImage] = useState<string | null>(avatar);

  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  }, []);

  return (
    <Card className="mb-8 bg-content0">
      <CardHeader className="text-xl font-regular">Profile Image</CardHeader>
      <CardBody>
        <div className="flex flex-col items-center gap-4">
          <div className="relative w-32 h-32 rounded-full overflow-hidden bg-content0 cursor-pointer" onClick={() => fileRef && fileRef.current?.click()}>
            {image ? (
              <Image
                src={image}
                alt="Profile"
                fill
                className="object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-default-400 text-6xl">
                +
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <Button
              as="label"
              color="primary"
              className="cursor-pointer"
            >
              Upload Image
              <input
                type="file"
                className="hidden"
                accept="image/*"
                onChange={handleImageUpload}
                ref={fileRef}
              />
            </Button>
            {image && (
              <Button
                color="danger"
                variant="flat"
                onPress={() => setImage(null)}
              >
                Remove
              </Button>
            )}
          </div>
        </div>
      </CardBody>
    </Card>
  );
};

interface EditablePrincipleCardProps {
  title: string;
  description: string;
  onTitleChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onDelete: () => void;
}

const EditablePrincipleCard = ({
  title,
  description,
  onTitleChange,
  onDescriptionChange,
  onDelete
}: EditablePrincipleCardProps) => (
  <Card shadow="sm" className="">
    <CardBody className="space-y-4">
      <div className="flex justify-between items-start">
        <Input
          label="Title"
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          variant="bordered"
          className="flex-grow"
        />
        <Button
          isIconOnly
          color="danger"
          variant="light"
          onPress={onDelete}
          className="ml-2"
        >
          ✕
        </Button>
      </div>
      <Textarea
        label="Description"
        value={description}
        onChange={(e) => onDescriptionChange(e.target.value)}
        variant="bordered"
      />
    </CardBody>
  </Card>
);

export default EditAgentProfile;