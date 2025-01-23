import { Button } from "@nextui-org/react";
import { Input, Textarea } from "@nextui-org/input";
import { Card, CardBody } from "@nextui-org/card";

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

export default EditablePrincipleCard;