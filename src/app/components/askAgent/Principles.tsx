import { IAskAgentProps } from "@/app/utils/interface";
import { Button } from "@heroui/button";
import { toast } from "react-hot-toast";
import { FaDownload, FaUpload } from "react-icons/fa";
import { useFetch } from "@/app/utils/lib";
import { useState } from "react";
import * as XLSX from "xlsx";

const Principles = ({ agentProfile, setAgentProfile }: IAskAgentProps) => {

    const fetch = useFetch();
    const [isSaving, setIsSaving] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);

    const downloadPrinciples = () => {
        if (!agentProfile || !agentProfile.principles.length) return;

        // Create markdown content
        const markdown = agentProfile.principles.map((principle, index) => {
            const number = (index + 1).toString().padStart(2, '0');
            return `## #${number} ${principle.title}\n\n${principle.description}\n`;
        }).join('\n');

        // Create blob and download
        const blob = new Blob([markdown], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'agent_principles.md';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    const uploadPrinciples = () => {
        // Create hidden file input
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.md';

        input.onchange = async (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (!file) return;

            const text = await file.text();
            const sections = text.split('##').filter(Boolean);

            const newPrinciples = sections.map(section => {
                const lines = section.trim().split('\n').filter(Boolean);
                const titleMatch = lines[0].match(/#(\d+)\s+(.+)/);

                if (!titleMatch) return null;

                return {
                    title: titleMatch[2].trim(),
                    description: lines.slice(1).join('\n').trim()
                };
            }).filter((p): p is NonNullable<typeof p> => p !== null);

            if (newPrinciples.length && setAgentProfile && agentProfile) {
                setAgentProfile({
                    ...agentProfile,
                    principles: newPrinciples
                });
            }
        };

        input.click();
    }

    const downloadPinecone = async () => {
        setIsDownloading(true);
        try {
            const response = await fetch.get('/api/pinecone');
            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.json_to_sheet(response);
            XLSX.utils.book_append_sheet(wb, ws, "Predictions");
            XLSX.writeFile(wb, "predictions.xlsx");
        } catch (error) {
            console.error("Error downloading excel:", error);
            toast.error("Failed to download excel");
        } finally {
            setIsDownloading(false);
        }
    };

    const savePrinciples = async () => {
        setIsSaving(true);
        try {
            await fetch.post(`/api/updateAgentStrategy`, {
                agent: agentProfile
            });
            toast.success("Agent strategy updated");
        } catch (error) {
            console.error("Error updating agent strategy:", error);
            toast.error("Error updating agent strategy");
        } finally {
            setIsSaving(false);
        }
    }

    return (
        <div className="w-full h-full rounded-lg border border-white/10 flex flex-col text-sm">
            <div className="flex-auto">
                {agentProfile && agentProfile.principles.map((principle, index) => (
                    <div
                        key={index}
                        className="p-4 hover:bg-gray-700 transition-colors"
                    >
                        <div className="flex flex-col gap-1">
                            <div className="text-gray-200 font-medium">#{(index + 1).toString().padStart(2, '0')} {principle.title}</div>
                            <div className="text-gray-200">{principle.description}</div>
                        </div>
                    </div>
                ))}
            </div>
            <div className="flex justify-end w-full bg-[#2F344E] items-center px-4 gap-2 rounded-b-lg">
                <Button className="text-white my-2 rounded-lg" variant="bordered" onPress={downloadPinecone} isLoading={isDownloading}>
                    <FaDownload />
                    Pinecone
                </Button>
                <Button className="text-white my-2 rounded-lg" variant="bordered" onPress={downloadPrinciples}>
                    <FaDownload />
                </Button>
                <Button className="text-white my-2 rounded-lg" variant="bordered" onPress={uploadPrinciples}>
                    <FaUpload />
                </Button>
                <Button className="text-white my-2 rounded-lg" variant="bordered" onPress={savePrinciples} isLoading={isSaving}>Save</Button>
            </div>
        </div>
    );
};

export default Principles;