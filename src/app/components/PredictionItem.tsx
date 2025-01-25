import { Image } from "@heroui/image";
import { Chip } from "@heroui/chip";
import { Tooltip } from "@heroui/tooltip";
import { IBet, IPrediction } from "@/app/utils/interface";
import { useState, useEffect } from "react";

interface PredictionItemProps {
  prediction: IPrediction;
  onClick: (id: string) => void;
}

export function PredictionItem({ prediction, onClick }: PredictionItemProps) {
  const [choiceOdds, setChoiceOdds] = useState<{ choice: string, amount: number, odds: string, percentage: string, count: number }[]>([]);

  useEffect(() => {
    if (prediction?.agent_bets) {
      const betsArray: IBet[] = prediction.agent_bets;
      const choiceTotals = betsArray.reduce((acc, b) => {
        if (!b) {
          return acc;
        }
        acc[b.choice.toLowerCase()] = (acc[b.choice.toLowerCase()] || 0) + b.amount;
        return acc;
      }, {} as Record<string, number>) || {};

      const totalAmount = Object.values(choiceTotals).reduce((sum, amount) => sum + amount, 0);

      // Calculate odds for each choice
      const newChoiceOdds = Object.entries(choiceTotals).map(([choice, amount]) => {
        const percentage = totalAmount > 0 ? (amount / totalAmount) * 100 : 0;
        const odds = percentage > 0 ? (100 / percentage).toFixed(2) : "∞";
        return {
          choice,
          amount,
          odds,
          percentage: percentage.toFixed(1),
          count: betsArray.filter(bet => bet && bet.choice.toLowerCase() === choice.toLowerCase()).length
        };
      });
      setChoiceOdds(newChoiceOdds);
    }
  }, [prediction?.agent_bets]);

  return (
    <tr onClick={() => onClick(prediction.id)} className="">
      <td colSpan={4} className="p-2 cursor-pointer select-item">
        <div className="flex flex-row gap-4 items-start">
          {/* Thumbnail */}
          {prediction.str_thumb ? (
            <Image
              src={prediction.str_thumb}
              alt={prediction.description}
              width={40}
              height={40}
              className="w-[40px] h-[40px] min-w-[40px] min-h-[40px] max-w-[40px] max-h-[40px] rounded-full object-cover"
            />
          ) : (
            <div className="rounded-full bg-default-200 w-[40px] h-[40px] min-w-[40px] min-h-[40px] max-w-[40px] max-h-[40px] flex items-center justify-center">
            </div>
          )}

          {/* Text block - Updated layout */}
          <div className="flex flex-col w-full gap-1">
            <Tooltip content="Prediction description" showArrow>
              <p className="text-base font-regular break-words mb-0">
                {prediction.description}
              </p>
            </Tooltip>

            <div className="flex flex-wrap gap-1 items-center text-sm">
              <Tooltip content="Number of bets placed" showArrow>
                <div className="flex items-center gap-1 text-default-500">
                  <span className="icon-user text-primary pl-4">{prediction.bets_count}</span>
                </div>
              </Tooltip>

              {/* Market Odds */}
              {choiceOdds.map(({ choice, odds, percentage }) => (
                <Tooltip
                  key={choice}
                  content={`Choice: ${choice.toUpperCase()}, Odds: ${odds}x, ${percentage}%`}
                  showArrow
                >
                  <Chip
                    className={`${choice.toLowerCase() === prediction.creator_choice.toLowerCase()
                      ? 'bg-success/20 text-success-500 icon-thumbs-up'
                      : 'bg-danger/20 text-danger-600 icon-thumbs-down'
                      }`}
                    size="sm"
                  >
                     ({odds}x) {percentage}%
                  </Chip>
                </Tooltip>
              ))}

              <Tooltip
                content={
                  prediction.status === "open"
                    ? "This prediction is open for betting"
                    : "No longer open"
                }
                showArrow
              >
                <Chip
                  color={
                    prediction.status !== "open"
                      ? (prediction.outcome?.toLowerCase() ?? '') === (prediction.creator_choice?.toLowerCase() ?? '')
                        ? "success"
                        : "danger"
                      : "primary"
                  }
                  variant="flat"
                  size="sm"
                  className="capitalize"
                >
                  {prediction.status == "resolved"
                    ? (prediction.outcome?.toLowerCase() ?? '') === (prediction.creator_choice?.toLowerCase() ?? '')
                      ? "Won"
                      : "Lost"
                    : prediction.status == "awaiting_confirmation"
                      ? "Awaiting"
                      : "Open"}
                </Chip>
              </Tooltip>
            </div>
          </div>
        </div>
      </td>
    </tr>
  );
} 