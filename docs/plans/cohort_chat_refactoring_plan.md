# Cohort Chat Refactoring Plan
## Breaking Down the 2,447-Line Mega-Component

### 🎯 **Current State Analysis**
- **File**: `src/app/(secure)/cohort-chat/page.tsx`
- **Size**: 2,447 lines (107KB)
- **Functions**: 56 functions
- **Imports**: 26 imports
- **Status**: EXTREMELY LARGE - needs immediate refactoring

### 🏗️ **Target Architecture**

```
src/app/(secure)/cohort-chat/
├── page.tsx                          # Main coordinator (~200 lines)
├── components/
│   ├── ChatInterface.tsx             # Core chat UI (~300 lines)
│   ├── MessageRenderer.tsx           # Message display logic (~400 lines)
│   ├── ConfigurationPanel.tsx        # Settings/parameters (~250 lines)
│   ├── ConversationManager.tsx       # Conversation CRUD (~200 lines)
│   ├── SurveySelector.tsx           # Survey selection UI (~150 lines)
│   └── DataVisualization.tsx        # Charts/data cards (~300 lines)
├── hooks/
│   ├── useChatMessages.tsx           # Message state management
│   ├── useStreamingResponse.tsx      # SSE handling
│   ├── useSurveySelection.tsx        # Survey selection logic
│   └── useConfiguration.tsx          # Settings state
├── types/
│   ├── chat.types.ts                 # Chat-specific interfaces
│   └── message.types.ts              # Message interfaces
└── utils/
    ├── messageProcessing.ts          # Message utilities
    ├── citationHandling.ts           # Citation logic
    └── chartDataTransform.ts         # Chart data utilities
```

### 📋 **Detailed Breakdown Plan**

## **Phase 1: Extract Core Types & Interfaces**

**Target**: `types/chat.types.ts` & `types/message.types.ts`

**Extract from lines**: Various interface definitions throughout the file

```typescript
// chat.types.ts
export interface ChatMessage {
  role: 'user' | 'agent';
  content: string;
  citations?: Record<string, string>;
  chartSpec?: any;
  dataCards?: any[];
  isUpload?: boolean;
  reportId?: string;
  reportStatus?: string;
}

export interface ConfigurationState {
  selectedSurveyId: number | null;
  temperature: number;
  streamingMode: 'off' | 'smart' | 'buffered' | 'instant';
  sources: {survey: boolean; twins: boolean; web: boolean};
  systemPrompt: string;
  model: string;
}

// message.types.ts  
export interface ProcessedMessage {
  content: string;
  citations: Record<string, string>;
  chartSpec?: any;
  dataCards?: any[];
}
```

## **Phase 2: Extract Custom Hooks**

### **2.1 useChatMessages Hook**
**Target**: `hooks/useChatMessages.tsx` (~150 lines)
**Responsibility**: Message state management and processing

```typescript
export function useChatMessages() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  const addMessage = useCallback((message: ChatMessage) => {
    // Extract from current addMessage logic
  }, []);
  
  const updateLastMessage = useCallback((updates: Partial<ChatMessage>) => {
    // Extract from current message update logic
  }, []);
  
  return { messages, isLoading, addMessage, updateLastMessage, setIsLoading };
}
```

### **2.2 useStreamingResponse Hook**
**Target**: `hooks/useStreamingResponse.tsx` (~200 lines)
**Responsibility**: Server-Sent Events handling

```typescript
export function useStreamingResponse() {
  const processStreamingResponse = useCallback(async (
    url: string,
    payload: any,
    onMessage: (message: ChatMessage) => void,
    onComplete: () => void
  ) => {
    // Extract from current streaming logic (lines ~619-800)
  }, []);
  
  return { processStreamingResponse };
}
```

### **2.3 useSurveySelection Hook**
**Target**: `hooks/useSurveySelection.tsx` (~100 lines)
**Responsibility**: Survey selection and conversation management

```typescript
export function useSurveySelection() {
  const [selectedSurveyId, setSelectedSurveyId] = useState<number | null>(null);
  const [conversations, setConversations] = useState<any[]>([]);
  
  // Extract survey selection logic
  // Extract conversation management
  
  return { 
    selectedSurveyId, 
    setSelectedSurveyId,
    conversations,
    // ... other survey/conversation methods
  };
}
```

### **2.4 useConfiguration Hook**
**Target**: `hooks/useConfiguration.tsx` (~100 lines)
**Responsibility**: Settings and configuration state

```typescript
export function useConfiguration() {
  const [temperature, setTemperature] = useState(0.0);
  const [streamingMode, setStreamingMode] = useState<StreamingMode>('off');
  const [sources, setSources] = useState({survey: true, twins: true, web: false});
  const [systemPrompt, setSystemPrompt] = useState('...');
  
  return {
    temperature, setTemperature,
    streamingMode, setStreamingMode,
    sources, setSources,
    systemPrompt, setSystemPrompt
  };
}
```

## **Phase 3: Extract Utility Functions**

### **3.1 Message Processing Utilities**
**Target**: `utils/messageProcessing.ts` (~150 lines)

```typescript
// Extract from lines ~148-274
export const processCompleteResponse = (content: string, existingMessage: any) => {
  // Current processCompleteResponse logic
};

export const normalizeMarkdown = (text: string): string => {
  // Current normalizeMarkdown logic  
};

export const isCompleteUnit = (content: string): boolean => {
  // Current isCompleteUnit logic
};
```

### **3.2 Citation Handling**
**Target**: `utils/citationHandling.ts` (~100 lines)

```typescript
// Extract citation processing logic
export const extractCitations = (content: string) => {
  // Citation extraction logic
};

export const applyCitations = (text: string, citations: Record<string, string>) => {
  // Citation application logic
};
```

## **Phase 4: Extract Major Components**

### **4.1 MessageRenderer Component**
**Target**: `components/MessageRenderer.tsx` (~400 lines)
**Responsibility**: Message display, citations, markdown rendering

**Extract from lines**: ~1404-1600 (renderWithCitations and related)

```typescript
interface MessageRendererProps {
  message: ChatMessage;
  dataCards?: any[];
}

export function MessageRenderer({ message, dataCards }: MessageRendererProps) {
  // Extract renderWithCitations logic
  // Extract renderDataCards logic  
  // Extract markdown processing
  
  return (
    <div className="space-y-1">
      {/* Content first, then charts - updated order */}
      {renderWithCitations(message.content, message.citations, message.isUpload)}
      {dataCards && renderDataCards(dataCards)}
    </div>
  );
}
```

### **4.2 ConfigurationPanel Component**
**Target**: `components/ConfigurationPanel.tsx` (~250 lines)
**Responsibility**: Right sidebar with all settings

**Extract from lines**: Configuration panel JSX (~1900-2200)

```typescript
interface ConfigurationPanelProps {
  temperature: number;
  onTemperatureChange: (temp: number) => void;
  streamingMode: StreamingMode;
  onStreamingModeChange: (mode: StreamingMode) => void;
  // ... other config props
}

export function ConfigurationPanel(props: ConfigurationPanelProps) {
  return (
    <div className="w-80 border-l bg-background p-4">
      {/* Extract all configuration UI */}
    </div>
  );
}
```

### **4.3 ConversationManager Component**
**Target**: `components/ConversationManager.tsx` (~200 lines)
**Responsibility**: Conversation list, creation, deletion

**Extract from lines**: Conversation sidebar logic (~1700-1900)

```typescript
interface ConversationManagerProps {
  conversations: any[];
  selectedSurveyId: number | null;
  onConversationSelect: (id: string) => void;
  onConversationDelete: (id: string) => void;
}

export function ConversationManager(props: ConversationManagerProps) {
  // Extract conversation list logic
  // Extract conversation grouping
  // Extract conversation CRUD operations
}
```

### **4.4 ChatInterface Component**
**Target**: `components/ChatInterface.tsx` (~300 lines)
**Responsibility**: Message list, input, core chat UI

**Extract from lines**: Main chat area (~1800-2100)

```typescript
interface ChatInterfaceProps {
  messages: ChatMessage[];
  isLoading: boolean;
  onSendMessage: (message: string) => void;
  onSurveySelect: (surveyId: number) => void;
}

export function ChatInterface(props: ChatInterfaceProps) {
  return (
    <div className="flex flex-col flex-1">
      <ScrollArea className="flex-1 min-h-0">
        {/* Messages */}
      </ScrollArea>
      
      {/* Input area */}
      <div className="border-t p-4">
        {/* Chat input */}
      </div>
    </div>
  );
}
```

### **4.5 SurveySelector Component**
**Target**: `components/SurveySelector.tsx` (~150 lines)
**Responsibility**: Survey selection dropdown/modal

```typescript
interface SurveySelectorProps {
  surveys: any[];
  selectedSurveyId: number | null;
  onSurveySelect: (surveyId: number) => void;
}

export function SurveySelector(props: SurveySelectorProps) {
  // Extract survey selection UI
  // Extract survey filtering/search
}
```

### **4.6 DataVisualization Component**
**Target**: `components/DataVisualization.tsx` (~300 lines)
**Responsibility**: Charts, data cards, visualizations

**Extract from lines**: renderDataCards function (~1340-1404)

```typescript
interface DataVisualizationProps {
  dataCards: any[];
  chartSpec?: any;
}

export function DataVisualization({ dataCards, chartSpec }: DataVisualizationProps) {
  // Extract renderDataCards logic
  // Extract chart rendering
  // Extract data transformation
}
```

## **Phase 5: Create New Main Page Component**

### **5.1 Refactored page.tsx**
**Target**: `page.tsx` (~200 lines)
**Responsibility**: Coordination and layout only

```typescript
export default function CohortChatPage() {
  // Use custom hooks
  const { messages, isLoading, addMessage } = useChatMessages();
  const { temperature, streamingMode, sources } = useConfiguration();
  const { selectedSurveyId, conversations } = useSurveySelection();
  const { processStreamingResponse } = useStreamingResponse();
  
  // Minimal coordination logic only
  const handleSendMessage = useCallback(async (message: string) => {
    // Simple coordination - delegate to hooks/services
  }, []);
  
  return (
    <div className="flex h-screen">
      <ConversationManager 
        conversations={conversations}
        selectedSurveyId={selectedSurveyId}
      />
      
      <div className="flex-1 flex flex-col">
        {selectedSurveyId ? (
          <ChatInterface 
            messages={messages}
            isLoading={isLoading}
            onSendMessage={handleSendMessage}
          />
        ) : (
          <OnboardingEmptyState />
        )}
      </div>
      
      <ConfigurationPanel 
        temperature={temperature}
        streamingMode={streamingMode}
      />
    </div>
  );
}
```

## **🚀 Implementation Strategy**

### **Step 1**: Create folder structure and type definitions
### **Step 2**: Extract and test custom hooks (one at a time)
### **Step 3**: Extract utility functions and test
### **Step 4**: Extract components (start with simplest ones)
### **Step 5**: Refactor main page.tsx to use new architecture
### **Step 6**: Test thoroughly and fix any integration issues

## **📊 Expected Results**

**Before**:
- 1 file: 2,447 lines
- Difficult to maintain
- Hard to test
- Slow development

**After**:
- 15+ focused files
- Average ~200 lines per file
- Clear responsibilities
- Testable components
- Faster development

## **✅ Success Criteria**

1. **Functionality**: All current features work exactly the same
2. **Performance**: No performance regression
3. **Maintainability**: Each file has a single, clear responsibility
4. **Testability**: Components can be unit tested independently
5. **Bundle Size**: No significant increase in bundle size

This refactoring will transform the cohort-chat from a monolithic component into a clean, modular architecture that's easy to maintain, test, and extend. 