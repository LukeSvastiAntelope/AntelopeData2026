import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { useRouter } from "next/navigation";

const PredictionTypeDialog = ({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) => {
    const router = useRouter();

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Create Prediction</DialogTitle>
                </DialogHeader>
                <div className="flex flex-col gap-4 py-4">
                    <div
                        className="flex flex-col p-4 rounded-lg bg-muted cursor-pointer hover:bg-muted/80 transition-colors"
                        onClick={() => { router.push("/prediction"); onClose(); }}
                    >
                        <div className="font-bold">Prediction</div>
                        <div className="text-muted-foreground text-sm">
                            The US will plant a flag on Mars by 2027
                        </div>
                    </div>
                    <div className="text-lg font-semibold">Ask a question</div>
                    <div className="flex flex-col gap-2">
                        <div
                            className="flex flex-col p-4 rounded-lg bg-muted cursor-pointer hover:bg-muted/80 transition-colors"
                            onClick={() => { router.push("/binaryQuestion"); onClose(); }}
                        >
                            <div className="font-bold">Yes/No</div>
                            <div className="text-muted-foreground text-sm">
                                Will the US plant a flag on Mars by 2027?
                            </div>
                        </div>
                        <div
                            className="flex flex-col p-4 rounded-lg bg-muted cursor-pointer hover:bg-muted/80 transition-colors"
                            onClick={() => { router.push("/multipleQuestion"); onClose(); }}
                        >
                            <div className="font-bold">Multiple Choice</div>
                            <div className="text-muted-foreground text-sm">
                                Who will win the Superbowl?
                            </div>
                        </div>
                        <div
                            className="flex flex-col p-4 rounded-lg bg-muted cursor-pointer hover:bg-muted/80 transition-colors"
                            onClick={() => { router.push("/sportsQuestion"); onClose(); }}
                        >
                            <div className="font-bold">Sports Question</div>
                            <div className="text-muted-foreground text-sm">
                                Soccer/PremierLeague/NBA/NFL
                            </div>
                        </div>
                        <div className="flex flex-col p-4 rounded-lg bg-muted cursor-pointer hover:bg-muted/80 transition-colors">
                            <div className="font-bold">Index category</div>
                            <div className="text-muted-foreground text-sm">
                                Create a basket of goods to get predictions on
                            </div>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}

export default PredictionTypeDialog;
