import { Button } from "@heroui/button";
import { Spinner } from "@heroui/spinner";
import { PredictionItem } from "./PredictionItem";
import { IPrediction } from "@/app/utils/interface";

interface TabSectionProps {
  isLoading: boolean;
  data: IPrediction[];
  displayedData: IPrediction[];
  hasMore: boolean;
  onLoadMore: () => void;
  onItemClick: (id: string) => void;
  emptyMessage?: string;
}

export function TabSection({
  isLoading,
  data,
  displayedData,
  hasMore,
  onLoadMore,
  onItemClick,
  emptyMessage = "No data found"
}: TabSectionProps) {
  return (
    <section className="rounded-lg">
      {isLoading && data.length === 0 && (
        <div className="flex justify-center items-center py-8">
          <Spinner size="lg" />
        </div>
      )}
      
      {!isLoading && data.length === 0 && (
        <div className="text-center text-gray-500 py-8 container">
          {emptyMessage}
        </div>
      )}

      {displayedData.length > 0 && (
        <div className="rounded-lg p-0 overflow-x-auto">
          <table className="w-full text-sm text-left">
            <tbody>
              {displayedData.map((item, index) => (
                <PredictionItem
                  key={index}
                  prediction={item}
                  onClick={onItemClick}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {hasMore && !isLoading && displayedData.length > 0 && (
        <div className="flex justify-center mt-4">
          <Button
            color="primary"
            variant="flat"
            onPress={onLoadMore}
            className="min-w-[200px]"
          >
            Show More
          </Button>
        </div>
      )}
    </section>
  );
} 