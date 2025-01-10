import { Image } from "@nextui-org/image";
import { Chip } from "@nextui-org/chip";
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
        acc[b.choice] = (acc[b.choice] || 0) + b.amount;
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
          count: betsArray.filter(bet => bet && bet.choice === choice).length
        };
      });
      setChoiceOdds(newChoiceOdds);
    }
  }, [prediction?.agent_bets]);

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

                {/* Market Odds */}
                {choiceOdds.map(({ choice, amount, odds, percentage }) => (
                  <Chip
                    key={choice}
                    className={`${choice === prediction.creator_choice
                      ? 'bg-primary/20 text-primary-500'
                      : 'bg-gray-700/30 text-gray-300'
                      }`}
                    size="sm"
                  >
                    {choice}: {amount} ({odds}x) {percentage}%
                  </Chip>
                ))}
              </div>

              <div className="flex items-center gap-2">
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