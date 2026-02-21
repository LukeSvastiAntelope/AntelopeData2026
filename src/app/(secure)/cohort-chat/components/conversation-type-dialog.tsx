import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { MessageCircle, ArrowRight, Newspaper } from 'lucide-react';

interface ConversationTypeDialogProps {
  open: boolean;
  onClose: () => void;
  onSelectType: (type: 'chat' | 'news') => void;
  surveyTitle?: string;
}

export function ConversationTypeDialog({
  open,
  onClose,
  onSelectType,
  surveyTitle
}: ConversationTypeDialogProps) {
  const handleTypeSelect = (type: 'chat' | 'news') => {
    onSelectType(type);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-center">Choose Conversation Type</DialogTitle>
        </DialogHeader>
        
        <div className="py-4">
          <p className="text-center text-muted-foreground mb-6">
            How would you like to work today?
          </p>
          
          <div className="space-y-3">
            {/* Cohort Chat Option */}
            <div 
              className="border rounded-lg p-4 cursor-pointer hover:border-primary transition-colors group"
              onClick={() => handleTypeSelect('chat')}
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg group-hover:bg-blue-200 transition-colors">
                  <MessageCircle className="h-5 w-5 text-blue-600" />
                </div>
                <div className="flex-1">
                  <h3 className="font-medium text-foreground">💬 Cohort Chat</h3>
                  <p className="text-sm text-muted-foreground">
                    Analyze selected survey cohorts and get campaign-ready insights
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
            </div>

            {/* News Chat Option */}
            <div 
              className="border rounded-lg p-4 cursor-pointer hover:border-primary transition-colors group"
              onClick={() => handleTypeSelect('news')}
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-100 rounded-lg group-hover:bg-amber-200 transition-colors">
                  <Newspaper className="h-5 w-5 text-amber-700" />
                </div>
                <div className="flex-1">
                  <h3 className="font-medium text-foreground">📰 News Chat</h3>
                  <p className="text-sm text-muted-foreground">
                    Campaign Copilot focused on district/state news, briefs, and rapid-response suggestions
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
} 