import {
    Modal,
    ModalContent,
    ModalBody,
} from "@heroui/modal";
import { useRouter } from "next/navigation";

const PredictionTypeDialog = ({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) => {
    const router = useRouter();

    return (
        <Modal isOpen={isOpen} onClose={onClose} size="md">
            <ModalContent>
                <ModalBody className="bg-custom-prediction-modal-bg">
                    <div className="flex flex-col gap-4 py-4">
                        <div className="text-xl font-bold">Create Prediction</div>
                        <div
                            className="flex flex-col p-4 rounded-lg bg-custom-prediction-modal-button cursor-pointer"
                            onClick={() => { router.push("/prediction"); onClose(); }}
                        >
                            <div className="font-bold">Prediction</div>
                            <div className="text-gray-400">
                                The US will plant a flag on Mars by 2027
                            </div>
                        </div>
                        <div className="text-xl font-bold">Ask a question</div>
                        <div className="flex flex-col gap-2">
                            <div
                                className="flex flex-col p-4 rounded-lg bg-custom-prediction-modal-button cursor-pointer"
                                onClick={() => { router.push("/binaryQuestion"); onClose(); }}
                            >
                                <div className="font-bold">Yes/No</div>
                                <div className="text-gray-400">
                                    Will the US plant a flag on Mars by 2027?
                                </div>
                            </div>
                            <div
                                className="flex flex-col p-4 rounded-lg bg-custom-prediction-modal-button cursor-pointer"
                                onClick={() => { router.push("/multipleQuestion"); onClose(); }}
                            >
                                <div className="font-bold">Multiple Choice</div>
                                <div className="text-gray-400">
                                    Who will win the Superbowl?
                                </div>
                            </div>
                            <div
                                className="flex flex-col p-4 rounded-lg bg-custom-prediction-modal-button cursor-pointer"
                                onClick={() => { router.push("/sportsQuestion"); onClose(); }}
                            >
                                <div className="font-bold">Sports Question</div>
                                <div className="text-gray-400">
                                    Soccer/PremierLeague/NBA/NFL
                                </div>
                            </div>
                            <div className="flex flex-col p-4 rounded-lg bg-custom-prediction-modal-button cursor-pointer">
                                <div className="font-bold">Index category</div>
                                <div className="text-gray-400">
                                    Create a basket of goods to get predictions on
                                </div>
                            </div>
                        </div>
                    </div>
                </ModalBody>
            </ModalContent>
        </Modal>
    )
}

export default PredictionTypeDialog;
