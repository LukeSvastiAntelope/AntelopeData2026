import { CheckCircle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SuccessCelebrationProps {
  surveyTitle: string;
  onContinue: () => void;
  className?: string;
}

export function SuccessCelebration({ surveyTitle, onContinue, className }: SuccessCelebrationProps) {
  return (
    <div className={`flex flex-col items-center justify-center space-y-6 p-8 ${className}`}>
      <div className="text-center space-y-4">
        <div className="flex justify-center">
          <div className="relative">
            <div className="rounded-full bg-green-100 p-4">
              <CheckCircle className="h-12 w-12 text-green-600" />
            </div>
            <div className="absolute -top-1 -right-1">
              <Sparkles className="h-6 w-6 text-yellow-500 animate-pulse" />
            </div>
          </div>
        </div>
        
        <div className="space-y-2">
          <h3 className="text-2xl font-bold text-gray-900">
            Perfect! 🎉
          </h3>
          <p className="text-lg text-gray-600">
            You&apos;ve selected <span className="font-semibold text-gray-900">&quot;{surveyTitle}&quot;</span>
          </p>
          <p className="text-gray-500">
            Now you can start asking questions about your survey data!
          </p>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 max-w-md">
        <h4 className="font-medium text-blue-900 mb-2">Try asking:</h4>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>• &quot;What are the main trends in responses?&quot;</li>
          <li>• &quot;How do demographics affect the answers?&quot;</li>
          <li>• &quot;Show me interesting patterns in the data&quot;</li>
          <li>• &quot;What insights can you find?&quot;</li>
        </ul>
      </div>

      <Button onClick={onContinue} size="lg" className="px-8">
        Start Analyzing →
      </Button>
    </div>
  );
} 