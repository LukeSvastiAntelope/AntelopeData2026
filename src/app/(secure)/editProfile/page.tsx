'use client';

import { Card, CardBody, CardHeader } from "@heroui/card";
import { Input, Textarea } from "@heroui/input";
import { Button } from "@heroui/button";
import Image from "next/image";
import { useState, useCallback, useRef, useEffect } from "react";
import { IoArrowBack, IoSave } from "react-icons/io5";
import { IAgentProfile } from "@/app/utils/interface";
import { useFetch } from "@/app/utils/lib";
import toast from "react-hot-toast";

const EditAgentProfile = () => {
  const [agent, setAgent] = useState<IAgentProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const fetchData = useFetch();
  const fileRef = useRef<HTMLInputElement | null>(null);

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
              <CardHeader className="text-xl font-regular">Basic Profile</CardHeader>
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

export default EditAgentProfile;