import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { MessageCircle, ArrowRight, Newspaper, Code2 } from 'lucide-react';

interface ConversationTypeDialogProps {
  open: boolean;
  onClose: () => void;
  onSelectType: (type: 'chat' | 'news' | 'code') => void;
  surveyTitle?: string;
}

export function ConversationTypeDialog({
  open,
  onClose,
  onSelectType,
  surveyTitle
}: ConversationTypeDialogProps) {
  const handleTypeSelect = (type: 'chat' | 'news' | 'code') => {
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
            {/* Deep Analysis (Python interpreter) Option */}
            <div
              className="border-2 border-primary/40 rounded-lg p-4 cursor-pointer hover:border-primary transition-colors group bg-primary/[0.03]"
              onClick={() => handleTypeSelect('code')}
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-100 rounded-lg group-hover:bg-emerald-200 transition-colors">
                  <Code2 className="h-5 w-5 text-emerald-700" />
                </div>
                <div className="flex-1">
                  <h3 className="font-medium text-foreground">🐍 Deep Analysis <span className="text-xs font-normal text-muted-foreground">(live Python)</span></h3>
                  <p className="text-sm text-muted-foreground">
                    Runs a live Python data-science agent on your responses — explores variables, computes statistics, builds charts, and shows every step of its reasoning and code.
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
            </div>

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

            {/* general/news Option */}
            <div 
              className="border rounded-lg p-4 cursor-pointer hover:border-primary transition-colors group"
              onClick={() => handleTypeSelect('news')}
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-100 rounded-lg group-hover:bg-amber-200 transition-colors">
                  <Newspaper className="h-5 w-5 text-amber-700" />
                </div>
                <div className="flex-1">
                  <h3 className="font-medium text-foreground">📰 general/news</h3>
                  <p className="text-sm text-muted-foreground">
                    General questions and public data — news, county clerk records, ballot order, and cross-source analysis
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