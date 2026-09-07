"use client";
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { getAllModels } from '@/app/utils/models';
import { DEFAULT_SYSTEM_PROMPT } from '../constants';

interface Props {
  selectedModel: string;
  onModelChange: (model: string) => void;
  temperature: number;
  onTemperatureChange: (temp: number) => void;
  streamingMode: 'off' | 'smart' | 'buffered' | 'instant';
  onStreamingModeChange: (mode: 'off' | 'smart' | 'buffered' | 'instant') => void;
  sources: { survey: boolean; twins: boolean; web: boolean };
  onSourcesChange: (sources: { survey: boolean; twins: boolean; web: boolean }) => void;
  systemPrompt: string;
  onSystemPromptChange: (prompt: string) => void;
}

export default function ConfigurationPanel({
  selectedModel,
  onModelChange,
  temperature,
  onTemperatureChange,
  streamingMode,
  onStreamingModeChange,
  sources,
  onSourcesChange,
  systemPrompt,
  onSystemPromptChange,
}: Props) {
  return (
    <div className="space-y-4">
      {/* Model select */}
      <div className="space-y-2">
        <Label>Model</Label>
        <Select value={selectedModel} onValueChange={onModelChange}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent className="z-50">
            {getAllModels().map((model) => (
              <SelectItem key={model.id} value={model.id}>
                {model.name} ({model.provider})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Temperature control */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Temperature</Label>
          <span className="text-xs text-muted-foreground">{temperature}</span>
        </div>
        <div className="space-y-2">
          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={temperature}
            onChange={(e) => onTemperatureChange(Number(e.target.value))}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>0.0 (Precise)</span>
            <span>1.0 (Creative)</span>
          </div>
        </div>
      </div>

      {/* Streaming Mode control */}
      <div className="space-y-2">
        <Label>Streaming Quality</Label>
        <Select value={streamingMode} onValueChange={onStreamingModeChange}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent className="z-50">
            <SelectItem value="off">Off (no streaming)</SelectItem>
            <SelectItem value="smart">Smart (recommended)</SelectItem>
            <SelectItem value="buffered">Buffered</SelectItem>
            <SelectItem value="instant">Instant</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Sources */}
      <div className="space-y-2">
        <Label>Sources</Label>
        {(['survey','twins','web'] as const).map(src=> (
          <div key={src} className="flex items-center gap-2">
            <Checkbox checked={sources[src]} onCheckedChange={val=>onSourcesChange({ ...sources, [src]: !!val })}/>
            <span className="text-sm capitalize">{src}</span>
          </div>
        ))}
      </div>

      {/* Prompt Editor */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Agent Instructions</Label>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => onSystemPromptChange(DEFAULT_SYSTEM_PROMPT)}
          >
            Reset
          </Button>
        </div>
        <textarea
          className="w-full min-h-[160px] rounded-md border border-border bg-background p-2 text-sm"
          value={systemPrompt}
          onChange={(e) => onSystemPromptChange(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Customize analysis style, citation rules, and formatting instructions.
        </p>
      </div>
    </div>
  );
}


