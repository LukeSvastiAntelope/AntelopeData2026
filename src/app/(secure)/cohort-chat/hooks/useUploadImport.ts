"use client";

import { useState, useCallback } from 'react';
import { toast } from '@/components/ui/sonner';
import type { ChatMessage } from '../types';

type UploadPreview = any;

type Args = {
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  setSurveys: React.Dispatch<React.SetStateAction<{ id: number; title: string }[]>>;
  handleSurveyChange: (surveyId: number | null) => void;
};

export function useUploadImport({ setMessages, setSurveys, handleSurveyChange }: Args) {
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadPreview, setUploadPreview] = useState<UploadPreview | null>(null);

  const resetUploadDialog = useCallback(() => {
    setUploadFile(null);
    setUploadPreview(null);
    setUploadLoading(false);
  }, []);

  const handleFileUpload = useCallback(async (file: File) => {
    setUploadFile(file);
    setUploadLoading(true);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/surveys/import', { method: 'POST', body: formData });
      const result = await response.json();

      if (result.status) {
        setUploadPreview(result.preview);
        toast.success('File analyzed successfully!');

        // Add upload message to chat
        setMessages((prev) => [
          ...prev,
          {
            role: 'agent',
            content: `📤 Uploaded: ${file.name}\n\n✅ Ready to import`,
            citations: {},
            isUpload: true,
          } as any,
        ]);
      } else {
        toast.error(result.message || 'Failed to analyze file');
        setShowUploadDialog(false);
      }
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Failed to upload file');
      setShowUploadDialog(false);
    } finally {
      setUploadLoading(false);
    }
  }, [setMessages]);

  const handleExecuteImport = useCallback(async () => {
    if (!uploadPreview || !uploadFile) return;

    setUploadLoading(true);
    try {
      const columnMappings = uploadPreview.columns.map((col: any) => ({
        originalName: col.name,
        mappedName: col.name,
        questionType: col.type,
        isDemographic: col.isDemographic,
        demographicField: col.demographicField,
        isRequired: col.isRequired,
        includeInSurvey: !col.isDemographic,
      }));

      const formData = new FormData();
      formData.append('file', uploadFile);
      formData.append(
        'config',
        JSON.stringify({
          fileName: uploadPreview.fileName,
          surveyTitle: uploadPreview.suggestedTitle,
          surveyDescription: `Imported survey from ${uploadPreview.fileName}`,
          isPublic: false,
          columnMappings,
          createDigitalTwins: uploadPreview.detectedDemographics.length > 0,
        })
      )
    ;

      const response = await fetch('/api/surveys/import/execute', { method: 'POST', body: formData });
      const result = await response.json();
      if (result.status && result.result) {
        toast.success(`Survey imported successfully! ${result.result.responsesCreated} responses created.`);
        setShowUploadDialog(false);
        resetUploadDialog();

        // Update the last message (the upload message) to show completion
        setMessages((prev) => {
          const newMessages = [...prev];
          if (
            newMessages.length > 0 &&
            typeof newMessages[newMessages.length - 1].content === 'string' &&
            (newMessages[newMessages.length - 1].content as string).includes('📤 Uploaded:')
          ) {
            (newMessages[newMessages.length - 1] as any).content = `📤 Uploaded: ${uploadFile?.name}\n\n✅ Import complete! Survey "${uploadPreview?.suggestedTitle}" imported with ${result.result.responsesCreated} responses. You can now ask questions about this data.`;
          }
          return newMessages;
        });

        // Refresh surveys list and select newly imported survey
        const surveysResponse = await fetch('/api/surveys');
        const surveysData = await surveysResponse.json();
        if (surveysData.surveys) {
          setSurveys(surveysData.surveys);
          if (result.result.surveyId) {
            handleSurveyChange(result.result.surveyId);
          }
        }
      } else {
        toast.error(result.message || 'Failed to import survey');
      }
    } catch (error) {
      console.error('Import error:', error);
      toast.error('Failed to import survey');
    } finally {
      setUploadLoading(false);
    }
  }, [handleSurveyChange, resetUploadDialog, setMessages, setSurveys, uploadFile, uploadPreview]);

  return {
    showUploadDialog,
    setShowUploadDialog,
    uploadFile,
    uploadLoading,
    uploadPreview,
    handleFileUpload,
    handleExecuteImport,
    resetUploadDialog,
  } as const;
}



