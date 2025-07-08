'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Progress } from "@/components/ui/progress"
import { 
  Upload, 
  FileText, 
  AlertCircle, 
  CheckCircle, 
  ArrowLeft, 
  ArrowRight,
  Database,
  Users,
  Settings,
  MapPin,
  Eye,
  EyeOff,
  Info
} from "lucide-react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import toast from "react-hot-toast"
import { FileChunker, ChunkedUploadProgress, type FileChunk } from "@/app/utils/file-chunking"

interface ParsedColumn {
  name: string;
  type: 'text' | 'single-choice' | 'multiple-choice' | 'rating' | 'email' | 'number';
  isDemographic: boolean;
  demographicField?: string;
  sampleValues: string[];
  uniqueValues: string[];
  isRequired: boolean;
}

interface ImportPreview {
  fileName: string;
  totalRows: number;
  columns: ParsedColumn[];
  previewData: any[];
  suggestedTitle: string;
  detectedDemographics: string[];
  errors: string[];
  warnings: string[];
  researchDataAnalysis?: {
    confidence: number;
    isResearchData: boolean;
    suggestCodebook: boolean;
    reasons: string[];
    recommendations: string[];
    detectedPatterns: {
      technicalColumns: string[];
      numericOnlyColumns: string[];
      metadataColumns: string[];
      waveIdentifiers: string[];
    };
  };
}

interface ColumnMapping {
  originalName: string;
  mappedName: string;
  questionType: 'text' | 'single-choice' | 'multiple-choice' | 'rating' | 'email' | 'number';
  isDemographic: boolean;
  demographicField?: string;
  isRequired: boolean;
  includeInSurvey: boolean;
}

const SurveyImportPage = () => {
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState(1)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [loading, setLoading] = useState(false)
  
  // Chunked upload state
  const [isChunkedUpload, setIsChunkedUpload] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [currentChunk, setCurrentChunk] = useState(0)
  const [totalChunks, setTotalChunks] = useState(0)
  const [uploadStatus, setUploadStatus] = useState('')
  
  // Import source state
  const [importSource, setImportSource] = useState<'file' | 'google-sheets' | 'surveymonkey' | 'typeform'>('file')
  const [platformUrl, setPlatformUrl] = useState('')
  const [accessToken, setAccessToken] = useState('')
  
  // Configuration state
  const [surveyTitle, setSurveyTitle] = useState('')
  const [surveyDescription, setSurveyDescription] = useState('')
  const [isPublic, setIsPublic] = useState(true)
  const [createDigitalTwins, setCreateDigitalTwins] = useState(true)
  const [columnMappings, setColumnMappings] = useState<ColumnMapping[]>([])
  
  // Codebook state
  const [codebookFile, setCodebookFile] = useState<File | null>(null)
  const [showCodebookUpload, setShowCodebookUpload] = useState(false)
  const [codebookMappings, setCodebookMappings] = useState<any[]>([])
  const [codebookCoverage, setCodebookCoverage] = useState<any>(null)
  const [codebookProcessed, setCodebookProcessed] = useState(false)

  const handleFileUpload = async (selectedFile: File) => {
    if (!selectedFile) return

    setFile(selectedFile)
    setLoading(true)
    setUploadProgress(0)
    setCurrentChunk(0)
    setTotalChunks(0)
    setUploadStatus('Analyzing file...')

    try {
      // First, analyze if we need chunking
      const analysis = await FileChunker.analyzeFile(selectedFile)
      
      if (analysis.needsChunking) {
        setIsChunkedUpload(true)
        setUploadStatus(`Large file detected (${Math.round(selectedFile.size / 1024 / 1024)}MB). Processing in chunks...`)
        
        // Chunk the file
        const chunks = await FileChunker.chunkFile(selectedFile)
        setTotalChunks(chunks.length)
        
        // Upload first chunk to get preview
        const firstChunk = chunks[0]
        const preview = await uploadChunk(firstChunk, selectedFile.name, true)
        
        if (preview) {
          setPreview(preview)
          setSurveyTitle(preview.suggestedTitle)
          
          // Check if codebook is suggested
          if (preview.researchDataAnalysis?.suggestCodebook) {
            setShowCodebookUpload(true)
          }
          
          // Initialize column mappings
          const mappings: ColumnMapping[] = preview.columns.map((col: ParsedColumn) => ({
            originalName: col.name,
            mappedName: col.name,
            questionType: col.type,
            isDemographic: col.isDemographic,
            demographicField: col.demographicField,
            isRequired: col.isRequired,
            includeInSurvey: !col.isDemographic
          }))
          setColumnMappings(mappings)
          
          // Upload remaining chunks
          await uploadRemainingChunks(chunks.slice(1), selectedFile.name)
          
          setCurrentStep(2)
          toast.success('Large file uploaded and analyzed successfully!')
        }
      } else {
        // Standard single-file upload
        setIsChunkedUpload(false)
        setUploadStatus('Uploading file...')
        
      const formData = new FormData()
      formData.append('file', selectedFile)

      const response = await fetch('/api/surveys/import', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: formData
      })

      const data = await response.json()

      if (data.status && data.preview) {
        setPreview(data.preview)
        setSurveyTitle(data.preview.suggestedTitle)
          
          // Check if codebook is suggested
          if (data.preview.researchDataAnalysis?.suggestCodebook) {
            setShowCodebookUpload(true)
          }
        
        // Initialize column mappings
        const mappings: ColumnMapping[] = data.preview.columns.map((col: ParsedColumn) => ({
          originalName: col.name,
          mappedName: col.name,
          questionType: col.type,
          isDemographic: col.isDemographic,
          demographicField: col.demographicField,
          isRequired: col.isRequired,
            includeInSurvey: !col.isDemographic
        }))
        setColumnMappings(mappings)
        
        setCurrentStep(2)
        toast.success('File uploaded and analyzed successfully!')
      } else {
        toast.error(data.message || 'Failed to process file')
        }
      }
    } catch (error) {
      console.error('Upload error:', error)
      toast.error('Failed to upload file')
    } finally {
      setLoading(false)
      setUploadStatus('')
    }
  }

  const uploadChunk = async (chunk: FileChunk, originalFileName: string, isFirstChunk: boolean = false): Promise<ImportPreview | null> => {
    const formData = new FormData()
    formData.append('file', chunk.chunk)
    formData.append('chunkIndex', chunk.chunkIndex.toString())
    formData.append('totalChunks', chunk.totalChunks.toString())
    formData.append('isFirstChunk', chunk.isFirstChunk.toString())
    formData.append('isLastChunk', chunk.isLastChunk.toString())
    formData.append('originalFileName', originalFileName)

    const endpoint = isFirstChunk ? '/api/surveys/import' : '/api/surveys/import/chunk'
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      body: formData
    })

    const data = await response.json()
    
    if (!data.status) {
      throw new Error(data.message || 'Failed to upload chunk')
    }

    // Update progress
    setCurrentChunk(chunk.chunkIndex + 1)
    setUploadProgress(((chunk.chunkIndex + 1) / chunk.totalChunks) * 100)
    setUploadStatus(data.message || `Uploaded chunk ${chunk.chunkIndex + 1} of ${chunk.totalChunks}`)

    return isFirstChunk && data.preview ? data.preview : null
  }

  const uploadRemainingChunks = async (chunks: FileChunk[], originalFileName: string) => {
    for (const chunk of chunks) {
      await uploadChunk(chunk, originalFileName, false)
      
      // Small delay to prevent overwhelming the server
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }

  const handleCodebookProcessing = async () => {
    if (!codebookFile || !preview) return

    setLoading(true)
    
    try {
      const formData = new FormData()
      formData.append('codebook', codebookFile)
      formData.append('originalColumns', JSON.stringify(preview.columns.map(c => c.name)))

      const response = await fetch('/api/surveys/import/codebook', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: formData
      })

      const data = await response.json()

      if (data.status) {
        setCodebookMappings(data.mappings)
        setCodebookCoverage(data.coverage)
        setCodebookProcessed(true)
        
        // Update column mappings with codebook data
        const updatedMappings = columnMappings.map(mapping => {
          const codebookMapping = data.mappings.find(m => m.originalName === mapping.originalName)
          if (codebookMapping && codebookMapping.hasMapping) {
            return {
              ...mapping,
              mappedName: codebookMapping.mappedName,
              // Keep existing question type unless we can infer better from value labels
              questionType: codebookMapping.valueLabels && Object.keys(codebookMapping.valueLabels).length > 0 
                ? 'single-choice' 
                : mapping.questionType
            }
          }
          return mapping
        })
        
        setColumnMappings(updatedMappings)
        toast.success(`Codebook processed! ${data.coverage.percentage}% of columns mapped.`)
      } else {
        toast.error(data.message || 'Failed to process codebook')
      }
    } catch (error) {
      console.error('Codebook processing error:', error)
      toast.error('Failed to process codebook')
    } finally {
      setLoading(false)
    }
  }

  const handlePlatformImport = async () => {
    if (!platformUrl || !accessToken) return

    setLoading(true)

    try {
      let endpoint = ''
      const params = new URLSearchParams()

      switch (importSource) {
        case 'google-sheets':
          endpoint = '/api/surveys/import/google-sheets'
          params.set('url', platformUrl)
          params.set('token', accessToken)
          break
        case 'surveymonkey':
          endpoint = '/api/surveys/import/surveymonkey'
          // Extract survey ID from URL
          const smMatch = platformUrl.match(/\/r\/([a-zA-Z0-9]+)/)
          if (smMatch) {
            params.set('surveyId', smMatch[1])
          } else {
            params.set('surveyId', platformUrl)
          }
          params.set('token', accessToken)
          break
        case 'typeform':
          endpoint = '/api/surveys/import/typeform'
          params.set('url', platformUrl)
          params.set('token', accessToken)
          break
      }

      const response = await fetch(`${endpoint}?${params}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      })

      const data = await response.json()

      if (data.status && data.preview) {
        setPreview(data.preview)
        setSurveyTitle(data.preview.suggestedTitle)
        
        // Initialize column mappings
        const mappings: ColumnMapping[] = data.preview.columns.map((col: ParsedColumn) => ({
          originalName: col.name,
          mappedName: col.name,
          questionType: col.type,
          isDemographic: col.isDemographic,
          demographicField: col.demographicField,
          isRequired: col.isRequired,
          includeInSurvey: !col.isDemographic
        }))
        setColumnMappings(mappings)
        
        setCurrentStep(2)
        toast.success(`Connected to ${importSource} successfully!`)
      } else {
        toast.error(data.message || `Failed to connect to ${importSource}`)
      }
    } catch (error) {
      console.error('Platform import error:', error)
      toast.error(`Failed to connect to ${importSource}`)
    } finally {
      setLoading(false)
    }
  }

  const handleExecuteImport = async () => {
    if (!preview) return

    setLoading(true)

    try {
      let response;

      if (importSource === 'file' && file) {
        // File upload import
        const formData = new FormData()
        formData.append('file', file)
        formData.append('config', JSON.stringify({
          fileName: preview.fileName,
          surveyTitle,
          surveyDescription,
          isPublic,
          columnMappings,
          createDigitalTwins
        }))

        // Create AbortController for timeout handling
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 300000) // 5 minutes timeout

        try {
        response = await fetch('/api/surveys/import/execute', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          },
            body: formData,
            signal: controller.signal
        })
          clearTimeout(timeoutId)
        } catch (fetchError) {
          clearTimeout(timeoutId)
          if (fetchError.name === 'AbortError') {
            throw new Error('Import timed out. Large imports may take several minutes. Please check your surveys list to see if the import completed.')
          }
          throw fetchError
        }
      } else {
        // Platform import
        let endpoint = ''
        const requestBody: any = {
          surveyTitle,
          surveyDescription,
          isPublic,
          createDigitalTwins,
          columnMappings,
          accessToken
        }

        switch (importSource) {
          case 'google-sheets':
            endpoint = '/api/surveys/import/google-sheets'
            requestBody.spreadsheetId = platformUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)?.[1] || platformUrl
            break
          case 'surveymonkey':
            endpoint = '/api/surveys/import/surveymonkey'
            requestBody.surveyId = platformUrl.match(/\/r\/([a-zA-Z0-9]+)/)?.[1] || platformUrl
            break
          case 'typeform':
            endpoint = '/api/surveys/import/typeform'
            requestBody.formId = platformUrl.match(/\/to\/([a-zA-Z0-9]+)/)?.[1] || platformUrl
            break
        }

        const platformController = new AbortController()
        const platformTimeoutId = setTimeout(() => platformController.abort(), 300000) // 5 minutes timeout

        try {
        response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`,
            'Content-Type': 'application/json'
          },
            body: JSON.stringify(requestBody),
            signal: platformController.signal
        })
          clearTimeout(platformTimeoutId)
        } catch (fetchError) {
          clearTimeout(platformTimeoutId)
          if (fetchError.name === 'AbortError') {
            throw new Error('Import timed out. Large imports may take several minutes. Please check your surveys list to see if the import completed.')
          }
          throw fetchError
        }
      }

      // Check if response is ok first
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Check if response is JSON
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        // If it's HTML, it might be a redirect or error page
        const text = await response.text();
        console.error('Non-JSON response received:', text.substring(0, 200));
        throw new Error('Server returned an unexpected response. Please try again.');
      }

      const data = await response.json()

      if (data.status && data.result) {
        toast.success(`Survey imported successfully! ${data.result.responsesCreated} responses created.`)
        router.push('/surveys')
      } else {
        toast.error(data.message || 'Failed to import survey')
      }
    } catch (error) {
      console.error('Import error:', error)
      if (error.message.includes('JSON')) {
        toast.error('Import may have succeeded but response was corrupted. Please check your surveys list.')
      } else {
        toast.error('Failed to import survey: ' + error.message)
      }
    } finally {
      setLoading(false)
    }
  }

  const updateColumnMapping = (index: number, field: keyof ColumnMapping, value: any) => {
    setColumnMappings(prev => 
      prev.map((mapping, i) => 
        i === index ? { ...mapping, [field]: value } : mapping
      )
    )
  }

  const getQuestionTypeIcon = (type: string) => {
    switch (type) {
      case 'text': return '📝'
      case 'single-choice': return '🔘'
      case 'multi-choice': return '☑️'
      case 'scale': return '📊'
      case 'email': return '📧'
      case 'number': return '🔢'
      default: return '❓'
    }
  }

  const getQuestionTypeDescription = (type: string) => {
    switch (type) {
      case 'text': return 'Open-ended text responses'
      case 'single-choice': return 'Single selection from options'
      case 'multiple-choice': return 'Multiple selections allowed'
      case 'multi-choice': return 'Multiple selections allowed' // Legacy support
      case 'rating': return 'Numeric rating scale'
      case 'scale': return 'Numeric rating scale' // Legacy support
      case 'email': return 'Email address validation'
      case 'number': return 'Numeric values only'
      default: return 'Unknown type'
    }
  }

  const validateMappings = () => {
    const errors = []
    const surveyColumns = columnMappings.filter(m => m.includeInSurvey)
    const demographicColumns = columnMappings.filter(m => m.isDemographic)
    
    if (surveyColumns.length === 0) {
      errors.push('At least one column must be included in the survey')
    }
    
    if (createDigitalTwins && demographicColumns.length === 0) {
      errors.push('Digital twin creation requires at least one demographic field')
    }
    
    const duplicateNames = surveyColumns
      .map(m => m.mappedName)
      .filter((name, index, arr) => arr.indexOf(name) !== index)
    
    if (duplicateNames.length > 0) {
      errors.push(`Duplicate question names: ${duplicateNames.join(', ')}`)
    }
    
    return errors
  }

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-6">
            <div className="text-center">
              <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">Choose Import Source</h3>
              <p className="text-muted-foreground mb-6">
                Select how you&apos;d like to import your survey data
              </p>
            </div>

            {/* Import Source Selection */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card 
                className={`cursor-pointer transition-all ${importSource === 'file' ? 'ring-2 ring-primary' : 'hover:shadow-md'}`}
                onClick={() => setImportSource('file')}
              >
                <CardContent className="p-6 text-center">
                  <FileText className="h-8 w-8 mx-auto mb-3 text-primary" />
                  <h4 className="font-medium mb-2">Upload File</h4>
                  <p className="text-sm text-muted-foreground">CSV, Excel files</p>
                </CardContent>
              </Card>

              <Card 
                className={`cursor-pointer transition-all ${importSource === 'google-sheets' ? 'ring-2 ring-primary' : 'hover:shadow-md'}`}
                onClick={() => setImportSource('google-sheets')}
              >
                <CardContent className="p-6 text-center">
                  <Database className="h-8 w-8 mx-auto mb-3 text-green-600" />
                  <h4 className="font-medium mb-2">Google Sheets</h4>
                  <p className="text-sm text-muted-foreground">Direct import</p>
                </CardContent>
              </Card>

              <Card 
                className={`cursor-pointer transition-all ${importSource === 'surveymonkey' ? 'ring-2 ring-primary' : 'hover:shadow-md'}`}
                onClick={() => setImportSource('surveymonkey')}
              >
                <CardContent className="p-6 text-center">
                  <Users className="h-8 w-8 mx-auto mb-3 text-orange-600" />
                  <h4 className="font-medium mb-2">SurveyMonkey</h4>
                  <p className="text-sm text-muted-foreground">Import surveys</p>
                </CardContent>
              </Card>

              <Card 
                className={`cursor-pointer transition-all ${importSource === 'typeform' ? 'ring-2 ring-primary' : 'hover:shadow-md'}`}
                onClick={() => setImportSource('typeform')}
              >
                <CardContent className="p-6 text-center">
                  <Settings className="h-8 w-8 mx-auto mb-3 text-purple-600" />
                  <h4 className="font-medium mb-2">Typeform</h4>
                  <p className="text-sm text-muted-foreground">Import forms</p>
                </CardContent>
              </Card>
            </div>

            {/* Source-specific input */}
            {importSource === 'file' && (
              <div className="space-y-4">
                {!loading ? (
              <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={(e) => {
                    const selectedFile = e.target.files?.[0]
                    if (selectedFile) handleFileUpload(selectedFile)
                  }}
                  className="hidden"
                  id="file-upload"
                />
                <label htmlFor="file-upload" className="cursor-pointer">
                  <div className="space-y-2">
                    <FileText className="h-8 w-8 mx-auto text-muted-foreground" />
                    <p className="text-sm font-medium">Click to upload or drag and drop</p>
                        <p className="text-xs text-muted-foreground">
                          CSV, Excel files • Large files supported via chunked upload
                        </p>
                  </div>
                </label>
                  </div>
                ) : (
                  <Card>
                    <CardContent className="p-6">
                      <div className="space-y-4">
                        <div className="flex items-center justify-center">
                          <Upload className="h-8 w-8 text-primary animate-pulse" />
                        </div>
                        
                        <div className="text-center">
                          <h4 className="font-medium mb-2">
                            {isChunkedUpload ? 'Processing Large File' : 'Uploading File'}
                          </h4>
                          <p className="text-sm text-muted-foreground mb-4">
                            {uploadStatus || 'Please wait while we process your file...'}
                          </p>
                        </div>

                        {isChunkedUpload && totalChunks > 0 && (
                          <div className="space-y-2">
                            <div className="flex justify-between text-sm">
                              <span>Progress</span>
                              <span>{currentChunk} of {totalChunks} chunks</span>
                            </div>
                            <Progress value={uploadProgress} className="w-full" />
                            <div className="text-xs text-center text-muted-foreground">
                              {Math.round(uploadProgress)}% complete
                            </div>
                          </div>
                        )}

                        {!isChunkedUpload && (
                          <div className="flex justify-center">
                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}

            {importSource !== 'file' && (
              <div className="space-y-4">
                <div>
                  <Label htmlFor="platform-url">
                    {importSource === 'google-sheets' && 'Google Sheets URL'}
                    {importSource === 'surveymonkey' && 'SurveyMonkey Survey URL'}
                    {importSource === 'typeform' && 'Typeform URL'}
                  </Label>
                  <Input
                    id="platform-url"
                    value={platformUrl}
                    onChange={(e) => setPlatformUrl(e.target.value)}
                    placeholder={
                      importSource === 'google-sheets' ? 'https://docs.google.com/spreadsheets/d/...' :
                      importSource === 'surveymonkey' ? 'https://www.surveymonkey.com/r/...' :
                      'https://form.typeform.com/to/...'
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="access-token">Access Token</Label>
                  <Input
                    id="access-token"
                    type="password"
                    value={accessToken}
                    onChange={(e) => setAccessToken(e.target.value)}
                    placeholder="Enter your API access token"
                  />
                </div>
                <Button 
                  onClick={handlePlatformImport}
                  disabled={!platformUrl || !accessToken || loading}
                  className="w-full"
                >
                  {loading ? 'Connecting...' : 'Connect & Preview'}
                </Button>
              </div>
            )}

            <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-2">
                {importSource === 'file' ? 'Supported File Formats' : 'Platform Integration'}
              </h4>
              {importSource === 'file' ? (
                <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
                  <li>• CSV files with headers in the first row</li>
                  <li>• Excel files (.xlsx, .xls) using the first sheet</li>
                  <li>• Demographic fields (age, gender, location) for digital twin creation</li>
                  <li>• Survey responses in subsequent rows</li>
                </ul>
              ) : (
                <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
                  <li>• Requires API access token from the platform</li>
                  <li>• Automatically detects question types and demographics</li>
                  <li>• Imports all responses and creates digital twins</li>
                  <li>• Preserves original survey structure and metadata</li>
                </ul>
              )}
            </div>
          </div>
        )

      case 2:
        if (!preview) return null
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-2">Preview & Configure</h3>
              <p className="text-muted-foreground mb-4">
                Review the detected data and configure your survey settings
              </p>
            </div>

            {/* Survey Settings */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  Survey Settings
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="title">Survey Title</Label>
                  <Input
                    id="title"
                    value={surveyTitle}
                    onChange={(e) => setSurveyTitle(e.target.value)}
                    placeholder="Enter survey title"
                  />
                </div>
                <div>
                  <Label htmlFor="description">Description (Optional)</Label>
                  <Textarea
                    id="description"
                    value={surveyDescription}
                    onChange={(e) => setSurveyDescription(e.target.value)}
                    placeholder="Enter survey description"
                    rows={3}
                  />
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="public"
                    checked={isPublic}
                    onCheckedChange={setIsPublic}
                  />
                  <Label htmlFor="public">Make survey public</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="digital-twins"
                    checked={createDigitalTwins}
                    onCheckedChange={setCreateDigitalTwins}
                  />
                  <Label htmlFor="digital-twins">Create digital twins from demographic data</Label>
                </div>
              </CardContent>
            </Card>

            {/* Research Data Detection Alert */}
            {preview.researchDataAnalysis && preview.researchDataAnalysis.confidence >= 50 && (
              <Card className={`border-2 ${preview.researchDataAnalysis.suggestCodebook ? 'border-orange-200 bg-orange-50 dark:bg-orange-950/20' : 'border-blue-200 bg-blue-50 dark:bg-blue-950/20'}`}>
                <CardHeader>
                  <CardTitle className={`flex items-center gap-2 ${preview.researchDataAnalysis.suggestCodebook ? 'text-orange-800 dark:text-orange-200' : 'text-blue-800 dark:text-blue-200'}`}>
                    <AlertCircle className="h-5 w-5" />
                    Research Data Detected ({preview.researchDataAnalysis.confidence}% confidence)
                  </CardTitle>
                  <CardDescription className={preview.researchDataAnalysis.suggestCodebook ? 'text-orange-700 dark:text-orange-300' : 'text-blue-700 dark:text-blue-300'}>
                    {preview.researchDataAnalysis.confidence >= 90 ? 'Very High' : 
                     preview.researchDataAnalysis.confidence >= 70 ? 'High' : 
                     preview.researchDataAnalysis.confidence >= 50 ? 'Medium' : 'Low'} confidence this is research data with technical variable names
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <h4 className="font-medium mb-2">Detected Patterns:</h4>
                    <ul className={`text-sm space-y-1 ${preview.researchDataAnalysis.suggestCodebook ? 'text-orange-700 dark:text-orange-300' : 'text-blue-700 dark:text-blue-300'}`}>
                      {preview.researchDataAnalysis.reasons.slice(0, 3).map((reason, i) => (
                        <li key={i}>• {reason}</li>
                      ))}
                      {preview.researchDataAnalysis.reasons.length > 3 && (
                        <li>• And {preview.researchDataAnalysis.reasons.length - 3} more patterns...</li>
                      )}
                    </ul>
                  </div>
                  
                  <div>
                    <h4 className="font-medium mb-2">Recommendations:</h4>
                    <ul className={`text-sm space-y-1 ${preview.researchDataAnalysis.suggestCodebook ? 'text-orange-700 dark:text-orange-300' : 'text-blue-700 dark:text-blue-300'}`}>
                      {preview.researchDataAnalysis.recommendations.map((rec, i) => (
                        <li key={i}>• {rec}</li>
                      ))}
                    </ul>
                  </div>

                  {preview.researchDataAnalysis.suggestCodebook && (
                    <div className="pt-2 border-t border-orange-200 dark:border-orange-800">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-medium text-orange-800 dark:text-orange-200">
                          Upload Codebook (Recommended)
                        </h4>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setShowCodebookUpload(!showCodebookUpload)}
                          className="text-orange-700 border-orange-300 hover:bg-orange-100 dark:text-orange-300 dark:border-orange-700 dark:hover:bg-orange-900/20"
                        >
                          {showCodebookUpload ? 'Hide' : 'Show'} Codebook Upload
                        </Button>
                      </div>
                      
                      {showCodebookUpload && (
                        <div className="space-y-3">
                          <p className="text-sm text-orange-700 dark:text-orange-300">
                            A codebook will help map technical variable names (like &quot;DEVICE_TYPE_W142&quot;) to readable questions (like &quot;What device did you use?&quot;).
                          </p>
                          <div className="flex items-center gap-3">
                            <Input
                              type="file"
                              accept=".csv,.xlsx,.xls"
                              onChange={(e) => {
                                const file = e.target.files?.[0]
                                if (file) {
                                  setCodebookFile(file)
                                  toast.success(`Codebook &quot;${file.name}&quot; selected`)
                                }
                              }}
                              className="flex-1"
                            />
                            {codebookFile && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setCodebookFile(null)
                                  toast.success('Codebook removed')
                                }}
                                className="text-orange-700 border-orange-300 hover:bg-orange-100 dark:text-orange-300 dark:border-orange-700 dark:hover:bg-orange-900/20"
                              >
                                Remove
                              </Button>
                            )}
                          </div>
                                                     {codebookFile && (
                             <div className="space-y-2">
                               <p className="text-sm text-orange-600 dark:text-orange-400">
                                 ✓ Codebook ready: {codebookFile.name} ({Math.round(codebookFile.size / 1024)}KB)
                               </p>
                               {!codebookProcessed ? (
                                 <Button
                                   onClick={handleCodebookProcessing}
                                   disabled={loading}
                                   size="sm"
                                   className="bg-orange-600 hover:bg-orange-700 text-white"
                                 >
                                   {loading ? 'Processing...' : 'Process Codebook'}
                                 </Button>
                               ) : (
                                 <div className="text-sm text-green-600 dark:text-green-400">
                                   ✓ Processed! {codebookCoverage?.percentage}% coverage ({codebookCoverage?.mapped}/{codebookCoverage?.total} columns)
                                 </div>
                               )}
                             </div>
                           )}
                          <div className="text-xs text-orange-600 dark:text-orange-400 space-y-1">
                            <p><strong>Expected format:</strong> CSV or Excel with columns:</p>
                                                         <p>• Variable Name (e.g., &quot;DEVICE_TYPE_W142&quot;)</p>
                             <p>• Question Text (e.g., &quot;What device did you use to take this survey?&quot;)</p>
                             <p>• Value Labels (optional, e.g., &quot;1=Desktop, 2=Mobile, 3=Tablet&quot;)</p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {preview.researchDataAnalysis.detectedPatterns && (
                    <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                      <details className="text-xs">
                        <summary className="cursor-pointer font-medium text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200">
                          Technical Details
                        </summary>
                        <div className="mt-2 space-y-1 text-gray-500 dark:text-gray-400">
                          <p>Technical columns: {preview.researchDataAnalysis.detectedPatterns.technicalColumns?.length || 0}</p>
                          <p>Wave identifiers: {preview.researchDataAnalysis.detectedPatterns.waveIdentifiers?.length || 0}</p>
                          <p>Metadata columns: {preview.researchDataAnalysis.detectedPatterns.metadataColumns?.length || 0}</p>
                          <p>Numeric-only columns: {preview.researchDataAnalysis.detectedPatterns.numericOnlyColumns?.length || 0}</p>
                        </div>
                      </details>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Data Preview */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database className="h-5 w-5" />
                  Data Preview
                </CardTitle>
                <CardDescription>
                  {preview.totalRows} rows detected • {preview.columns.length} columns
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {preview.columns.slice(0, 5).map((col) => (
                          <TableHead key={col.name}>{col.name}</TableHead>
                        ))}
                        {preview.columns.length > 5 && <TableHead>...</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {preview.previewData.slice(0, 3).map((row, i) => (
                        <TableRow key={i}>
                          {preview.columns.slice(0, 5).map((col) => (
                            <TableCell key={col.name} className="max-w-32 truncate">
                              {String(row[col.name] || '')}
                            </TableCell>
                          ))}
                          {preview.columns.length > 5 && <TableCell>...</TableCell>}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            {/* Detected Demographics */}
            {preview.detectedDemographics.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    Detected Demographics
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {preview.detectedDemographics.map((demo) => (
                      <Badge key={demo} variant="secondary">
                        {demo}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Warnings */}
            {preview.warnings.length > 0 && (
              <Card className="border-yellow-200 bg-yellow-50 dark:bg-yellow-950/20">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-yellow-800 dark:text-yellow-200">
                    <AlertCircle className="h-5 w-5" />
                    Warnings
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="text-sm text-yellow-700 dark:text-yellow-300 space-y-1">
                    {preview.warnings.map((warning, i) => (
                      <li key={i}>• {warning}</li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
          </div>
        )

      case 3:
        if (!preview) return null
        const validationErrors = validateMappings()
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-2">Column Mapping</h3>
              <p className="text-muted-foreground mb-4">
                Customize how your data columns are mapped to survey questions and demographics
              </p>
            </div>

            {/* Validation Errors */}
            {validationErrors.length > 0 && (
              <Card className="border-red-200 bg-red-50 dark:bg-red-950/20">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-red-800 dark:text-red-200">
                    <AlertCircle className="h-5 w-5" />
                    Validation Errors
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="text-sm text-red-700 dark:text-red-300 space-y-1">
                    {validationErrors.map((error, i) => (
                      <li key={i}>• {error}</li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            {/* Codebook Coverage Summary */}
            {codebookProcessed && codebookCoverage && (
              <Card className="border-green-200 bg-green-50 dark:bg-green-950/20">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-green-800 dark:text-green-200">
                    <CheckCircle className="h-5 w-5" />
                    Codebook Applied
                  </CardTitle>
                  <CardDescription className="text-green-700 dark:text-green-300">
                    {codebookCoverage.percentage}% of columns mapped from codebook ({codebookCoverage.mapped}/{codebookCoverage.total})
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <h4 className="font-medium text-green-800 dark:text-green-200 mb-1">Mapped Columns:</h4>
                      <div className="space-y-1">
                        {codebookMappings.filter(m => m.hasMapping).slice(0, 3).map(mapping => (
                          <div key={mapping.originalName} className="text-green-700 dark:text-green-300">
                            • {mapping.originalName} → {mapping.mappedName}
                          </div>
                        ))}
                        {codebookMappings.filter(m => m.hasMapping).length > 3 && (
                          <div className="text-green-600 dark:text-green-400">
                            ... and {codebookMappings.filter(m => m.hasMapping).length - 3} more
                          </div>
                        )}
                      </div>
                    </div>
                    {codebookCoverage.unmappedColumns.length > 0 && (
                      <div>
                        <h4 className="font-medium text-green-800 dark:text-green-200 mb-1">Unmapped Columns:</h4>
                        <div className="space-y-1">
                          {codebookCoverage.unmappedColumns.slice(0, 3).map(col => (
                            <div key={col} className="text-green-600 dark:text-green-400">
                              • {col}
                            </div>
                          ))}
                          {codebookCoverage.unmappedColumns.length > 3 && (
                            <div className="text-green-500 dark:text-green-500">
                              ... and {codebookCoverage.unmappedColumns.length - 3} more
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Column Mappings Table */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="h-5 w-5" />
                  Column Mappings
                </CardTitle>
                <CardDescription>
                  Configure how each column should be processed
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {columnMappings.map((mapping, index) => (
                    <div key={mapping.originalName} className="border rounded-lg p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{mapping.originalName}</span>
                          {mapping.isDemographic && (
                            <Badge variant="outline" className="text-xs">
                              Demographic
                            </Badge>
                          )}
                          {codebookProcessed && codebookMappings.find(m => m.originalName === mapping.originalName)?.hasMapping && (
                            <Badge variant="secondary" className="text-xs bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                              Codebook
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => updateColumnMapping(index, 'includeInSurvey', !mapping.includeInSurvey)}
                          >
                            {mapping.includeInSurvey ? (
                              <Eye className="h-4 w-4" />
                            ) : (
                              <EyeOff className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </div>

                      {mapping.includeInSurvey && (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          <div>
                            <Label className="text-xs">Question Name</Label>
                            <Input
                              value={mapping.mappedName}
                              onChange={(e) => updateColumnMapping(index, 'mappedName', e.target.value)}
                              placeholder="Enter question name"
                              className="mt-1"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Question Type</Label>
                            <Select
                              value={mapping.questionType}
                              onValueChange={(value) => updateColumnMapping(index, 'questionType', value)}
                            >
                              <SelectTrigger className="mt-1">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="text">
                                  <span className="flex items-center gap-2">
                                    {getQuestionTypeIcon('text')} Text
                                  </span>
                                </SelectItem>
                                <SelectItem value="single-choice">
                                  <span className="flex items-center gap-2">
                                    {getQuestionTypeIcon('single-choice')} Single Choice
                                  </span>
                                </SelectItem>
                                <SelectItem value="multiple-choice">
                                  <span className="flex items-center gap-2">
                                    {getQuestionTypeIcon('multi-choice')} Multiple Choice
                                  </span>
                                </SelectItem>
                                <SelectItem value="rating">
                                  <span className="flex items-center gap-2">
                                    {getQuestionTypeIcon('scale')} Rating Scale
                                  </span>
                                </SelectItem>
                                <SelectItem value="email">
                                  <span className="flex items-center gap-2">
                                    {getQuestionTypeIcon('email')} Email
                                  </span>
                                </SelectItem>
                                <SelectItem value="number">
                                  <span className="flex items-center gap-2">
                                    {getQuestionTypeIcon('number')} Number
                                  </span>
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="flex items-end">
                            <div className="flex items-center space-x-2">
                              <Checkbox
                                id={`required-${index}`}
                                checked={mapping.isRequired}
                                onCheckedChange={(checked) => updateColumnMapping(index, 'isRequired', checked)}
                              />
                              <Label htmlFor={`required-${index}`} className="text-xs">
                                Required
                              </Label>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Sample Values */}
                      <div className="text-xs text-muted-foreground">
                        Sample values: {preview.columns.find(c => c.name === mapping.originalName)?.sampleValues.slice(0, 3).join(', ')}
                        {preview.columns.find(c => c.name === mapping.originalName)?.sampleValues.length > 3 && '...'}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Summary */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Info className="h-5 w-5" />
                  Import Summary
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                  <div>
                    <div className="text-2xl font-bold text-primary">
                      {columnMappings.filter(m => m.includeInSurvey).length}
                    </div>
                    <div className="text-sm text-muted-foreground">Survey Questions</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-blue-600">
                      {columnMappings.filter(m => m.isDemographic).length}
                    </div>
                    <div className="text-sm text-muted-foreground">Demographics</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-green-600">
                      {preview.totalRows}
                    </div>
                    <div className="text-sm text-muted-foreground">Responses</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-purple-600">
                      {createDigitalTwins ? preview.totalRows : 0}
                    </div>
                    <div className="text-sm text-muted-foreground">Digital Twins</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )

      default:
        return null
    }
  }

  return (
    <div className="flex-1 p-2 w-full bg-background">
      <div className="mx-auto rounded-lg bg-card text-card-foreground shadow-lg">
        {/* Header */}
        <div className="px-6 py-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <SidebarTrigger className="-ml-0.5 h-5 w-5 text-muted-foreground hover:text-foreground" />
              <div className="h-4 border-l border-border mx-4" />
              <h1 className="text-base font-medium text-card-foreground">Import Survey</h1>
            </div>
            <Link href="/surveys">
              <Button variant="outline">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Surveys
              </Button>
            </Link>
          </div>
        </div>
        
        <div className="border-b border-border" />

        <div className="p-6">
          {/* Step Indicator */}
          <div className="flex items-center justify-center mb-8">
            <div className="flex items-center space-x-4">
              <div className={`flex items-center justify-center w-8 h-8 rounded-full border-2 ${
                currentStep >= 1 ? 'bg-primary border-primary text-primary-foreground' : 'border-muted-foreground text-muted-foreground'
              }`}>
                1
              </div>
              <div className={`w-16 h-0.5 ${currentStep >= 2 ? 'bg-primary' : 'bg-muted'}`} />
              <div className={`flex items-center justify-center w-8 h-8 rounded-full border-2 ${
                currentStep >= 2 ? 'bg-primary border-primary text-primary-foreground' : 'border-muted-foreground text-muted-foreground'
              }`}>
                2
              </div>
              <div className={`w-16 h-0.5 ${currentStep >= 3 ? 'bg-primary' : 'bg-muted'}`} />
              <div className={`flex items-center justify-center w-8 h-8 rounded-full border-2 ${
                currentStep >= 3 ? 'bg-primary border-primary text-primary-foreground' : 'border-muted-foreground text-muted-foreground'
              }`}>
                3
              </div>
            </div>
          </div>

          {/* Step Content */}
          {renderStepContent()}

          {/* Navigation */}
          <div className="flex justify-between mt-8">
            <div>
              {currentStep > 1 && (
                <Button 
                  variant="outline" 
                  onClick={() => setCurrentStep(prev => prev - 1)}
                  disabled={loading}
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Previous
                </Button>
              )}
            </div>
            <div>
              {currentStep === 2 && (
                <Button 
                  onClick={() => setCurrentStep(3)}
                  disabled={!surveyTitle.trim()}
                >
                  Next: Column Mapping
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              )}
              {currentStep === 3 && (
                <Button 
                  onClick={handleExecuteImport}
                  disabled={loading || !surveyTitle.trim() || validateMappings().length > 0}
                >
                  {loading ? 'Importing...' : 'Import Survey'}
                  <CheckCircle className="h-4 w-4 ml-2" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default SurveyImportPage 