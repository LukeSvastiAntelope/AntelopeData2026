import { Image } from "@nextui-org/image";
import { Chip } from "@nextui-org/chip";
import { IPrediction } from "@/app/utils/interface";

interface PredictionItemProps {
  prediction: IPrediction;
  onClick: (id: string) => void;
}

export function PredictionItem({ prediction, onClick }: PredictionItemProps) {
  return (
    <tr onClick={() => onClick(prediction.id)} className="">
      <td colSpan={4} className="p-4 cursor-pointer backbutton">
        <div className="flex flex-row gap-4 items-start">
          {/* Thumbnail */}
          {prediction.str_thumb ? (
            <Image
              src={prediction.str_thumb}
              alt={prediction.description}
              width={40}
              height={40}
              className="w-[40px] h-[40px] min-w-[40px] min-h-[40px] max-w-[40px] max-h-[40px] rounded-lg object-cover"
            />
          ) : (
            <div className="rounded-lg bg-default-200 w-[40px] h-[40px] min-w-[40px] min-h-[40px] max-w-[40px] max-h-[40px] flex items-center justify-center">
            </div>
          )}

          {/* Text block - Updated layout */}
          <div className="flex flex-col w-full gap-2">
            <p className="text-base font-medium break-words">
              {prediction.description}
            </p>

            <div className="flex flex-wrap gap-4 items-center text-sm">
              <div className="flex items-center gap-1 text-default-500">
                <span className="icon-user text-primary pl-4">{prediction.bets_count}</span>
               
                <span className="text-danger">{prediction.yes_amount}</span>
                <span className="px-0 mx-0">/</span>
                <span className="text-success">{prediction.no_amount}</span>
              </div>

              <div className="flex items-center gap-2">
                {/* <span className="text-default-400">
                  {formatDate(
                    prediction.resolution_date || prediction.created_at,
                    "MM/dd/yy"
                  )}
                </span> */}

                <Chip
                  color={
                    prediction.status !== "open"
                      ? prediction.outcome === prediction.creator_choice
                        ? "success"
                        : "danger"
                      : "primary"
                  }
                  variant="flat"
                  size="sm"
                  className="capitalize"
                >
                  {prediction.status == "resolved"
                    ? prediction.outcome === prediction.creator_choice
                      ? "Won"
                      : "Lost"
                    : prediction.status == "awaiting_confirmation"
                      ? "Awaiting"
                      : "Open"}
                </Chip>
              </div>
            </div>
          </div>
        </div>
      </td>
    </tr>
  );
} 