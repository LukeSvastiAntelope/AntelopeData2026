'use client'

import { useState, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Loader2,
  Users,
  Link2,
  Database,
} from 'lucide-react'
import toast from 'react-hot-toast'

// -----------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------

interface ColumnMapping {
  originalColumn: string
  targetField: string
  label: string
}

interface PreviewRow {
  original: Record<string, string>
  mapped: Record<string, string>
}

interface ImportPreview {
  totalRows: number
  format: { id: string; name: string; description: string }
  confidence: number
  mappedColumns: ColumnMapping[]
  unmappedColumns: string[]
  previewRows: PreviewRow[]
  fileName: string
}

interface ExecuteResult {
  totalRows: number
  matched: number
  enriched: number
  skipped: number
  voterIdsLinked: number
  format: string
  errors: string[]
}

type Step = 'upload' | 'preview' | 'executing' | 'done'

// -----------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------

export default function VoterFilePage() {
  const [step, setStep] = useState<Step>('upload')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [result, setResult] = useState<ExecuteResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  // ------------------------------------------------------------------
  // Upload & preview
  // ------------------------------------------------------------------

  const handleFileSelect = useCallback(async (selectedFile: File) => {
    setFile(selectedFile)
    setLoading(true)

    try {
      const formData = new FormData()
      formData.append('file', selectedFile)

      const res = await fetch('/api/voter-file/import', {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()

      if (!data.status) {
        toast.error(data.message || 'Failed to parse file')
        setLoading(false)
        return
      }

      setPreview(data)
      setStep('preview')
    } catch {
      toast.error('Failed to upload file')
    } finally {
      setLoading(false)
    }
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      const droppedFile = e.dataTransfer.files[0]
      if (droppedFile) handleFileSelect(droppedFile)
    },
    [handleFileSelect]
  )

  // ------------------------------------------------------------------
  // Execute import
  // ------------------------------------------------------------------

  const handleExecute = useCallback(async () => {
    if (!file || !preview) return

    setStep('executing')
    setLoading(true)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append(
        'columnMapping',
        JSON.stringify(preview.mappedColumns)
      )

      const res = await fetch('/api/voter-file/execute', {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()

      if (!data.status) {
        toast.error(data.message || 'Import failed')
        setStep('preview')
        setLoading(false)
        return
      }

      setResult(data.summary)
      setStep('done')
      toast.success('Voter file imported successfully')
    } catch {
      toast.error('Import failed')
      setStep('preview')
    } finally {
      setLoading(false)
    }
  }, [file, preview])

  // ------------------------------------------------------------------
  // Reset
  // ------------------------------------------------------------------

  const handleReset = useCallback(() => {
    setStep('upload')
    setFile(null)
    setPreview(null)
    setResult(null)
  }, [])

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <div className="flex items-center gap-2 p-4 border-b">
        <SidebarTrigger />
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Voter File Import</h1>
          <p className="text-sm text-muted-foreground">
            Import voter files from L2, TargetSmart, or state voter rolls to enrich existing voter profiles
          </p>
        </div>
      </div>

      <div className="flex-1 p-6 max-w-5xl mx-auto w-full space-y-6">
        {/* Step indicator */}
        <div className="flex items-center gap-2 text-sm">
          <StepIndicator label="Upload" active={step === 'upload'} done={step !== 'upload'} />
          <ArrowRight className="h-4 w-4 text-muted-foreground" />
          <StepIndicator label="Preview & Map" active={step === 'preview'} done={step === 'executing' || step === 'done'} />
          <ArrowRight className="h-4 w-4 text-muted-foreground" />
          <StepIndicator label="Import" active={step === 'executing'} done={step === 'done'} />
        </div>

        {/* ---- STEP: Upload ---- */}
        {step === 'upload' && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5" />
                Upload Voter File
              </CardTitle>
              <CardDescription>
                Supports CSV, TSV, and Excel files. We auto-detect L2, TargetSmart, and generic state roll formats.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div
                className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors ${
                  dragOver ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-muted-foreground/50'
                }`}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
              >
                {loading ? (
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 className="h-10 w-10 animate-spin text-primary" />
                    <p className="text-muted-foreground">Analyzing file...</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3">
                    <Upload className="h-10 w-10 text-muted-foreground" />
                    <div>
                      <p className="font-medium">Drop your voter file here</p>
                      <p className="text-sm text-muted-foreground">or click to browse</p>
                    </div>
                    <input
                      type="file"
                      accept=".csv,.tsv,.txt,.xlsx,.xls"
                      className="absolute inset-0 opacity-0 cursor-pointer"
                      onChange={(e) => {
                        const f = e.target.files?.[0]
                        if (f) handleFileSelect(f)
                      }}
                      style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}
                    />
                    <Button
                      variant="outline"
                      onClick={() => {
                        const input = document.createElement('input')
                        input.type = 'file'
                        input.accept = '.csv,.tsv,.txt,.xlsx,.xls'
                        input.onchange = (e) => {
                          const f = (e.target as HTMLInputElement).files?.[0]
                          if (f) handleFileSelect(f)
                        }
                        input.click()
                      }}
                    >
                      Browse Files
                    </Button>
                  </div>
                )}
              </div>

              {/* Supported formats */}
              <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                <FormatCard name="L2 Political" description="National voter file with party codes, vote history, demographics" />
                <FormatCard name="TargetSmart" description="Voter file with partisan scores, turnout scores, modeled data" />
                <FormatCard name="State Voter Roll" description="Secretary of state voter registration exports" />
              </div>
            </CardContent>
          </Card>
        )}

        {/* ---- STEP: Preview ---- */}
        {step === 'preview' && preview && (
          <>
            {/* Detection summary */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database className="h-5 w-5" />
                  Format Detection
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-4">
                  <StatBadge icon={<FileSpreadsheet className="h-4 w-4" />} label="File" value={preview.fileName} />
                  <StatBadge icon={<Users className="h-4 w-4" />} label="Records" value={preview.totalRows.toLocaleString()} />
                  <StatBadge icon={<Database className="h-4 w-4" />} label="Format" value={preview.format.name} />
                  <StatBadge
                    icon={<CheckCircle2 className="h-4 w-4" />}
                    label="Confidence"
                    value={`${preview.confidence}%`}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Column mapping */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Link2 className="h-5 w-5" />
                  Column Mapping
                </CardTitle>
                <CardDescription>
                  {preview.mappedColumns.length} columns mapped, {preview.unmappedColumns.length} unmapped
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Source Column</TableHead>
                      <TableHead>Mapped To</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.mappedColumns.map((col) => (
                      <TableRow key={col.originalColumn}>
                        <TableCell className="font-mono text-sm">{col.originalColumn}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{col.label}</Badge>
                        </TableCell>
                        <TableCell>
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                        </TableCell>
                      </TableRow>
                    ))}
                    {preview.unmappedColumns.slice(0, 10).map((col) => (
                      <TableRow key={col} className="opacity-50">
                        <TableCell className="font-mono text-sm">{col}</TableCell>
                        <TableCell className="text-muted-foreground italic">Not mapped</TableCell>
                        <TableCell>
                          <AlertCircle className="h-4 w-4 text-muted-foreground" />
                        </TableCell>
                      </TableRow>
                    ))}
                    {preview.unmappedColumns.length > 10 && (
                      <TableRow className="opacity-50">
                        <TableCell colSpan={3} className="text-center text-muted-foreground">
                          +{preview.unmappedColumns.length - 10} more unmapped columns
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Preview data */}
            <Card>
              <CardHeader>
                <CardTitle>Data Preview</CardTitle>
                <CardDescription>First {preview.previewRows.length} records (mapped values)</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {preview.mappedColumns.slice(0, 8).map((col) => (
                          <TableHead key={col.targetField} className="whitespace-nowrap">
                            {col.label}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {preview.previewRows.slice(0, 10).map((row, i) => (
                        <TableRow key={i}>
                          {preview.mappedColumns.slice(0, 8).map((col) => (
                            <TableCell key={col.targetField} className="whitespace-nowrap text-sm">
                              {row.mapped[col.targetField] || '—'}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            {/* Action buttons */}
            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={handleReset}>
                Cancel
              </Button>
              <Button onClick={handleExecute}>
                Import & Match {preview.totalRows.toLocaleString()} Records
              </Button>
            </div>
          </>
        )}

        {/* ---- STEP: Executing ---- */}
        {step === 'executing' && (
          <Card>
            <CardContent className="py-16 text-center">
              <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary" />
              <p className="mt-4 text-lg font-medium">Matching & enriching voter profiles...</p>
              <p className="text-sm text-muted-foreground mt-1">
                Processing {preview?.totalRows.toLocaleString() || ''} records. This may take a few minutes for large files.
              </p>
            </CardContent>
          </Card>
        )}

        {/* ---- STEP: Done ---- */}
        {step === 'done' && result && (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                  Import Complete
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <ResultStat label="Total Records" value={result.totalRows} />
                  <ResultStat label="Matched" value={result.matched} variant="success" />
                  <ResultStat label="Enriched" value={result.enriched} variant="success" />
                  <ResultStat label="Skipped" value={result.skipped} variant="muted" />
                </div>

                {result.voterIdsLinked > 0 && (
                  <p className="mt-4 text-sm text-muted-foreground">
                    {result.voterIdsLinked} voter file IDs linked to profiles for future deduplication.
                  </p>
                )}

                {result.errors.length > 0 && (
                  <div className="mt-4 p-3 bg-destructive/10 border border-destructive/20 rounded-md">
                    <p className="text-sm font-medium text-destructive mb-2">
                      {result.errors.length} errors during import:
                    </p>
                    <ul className="text-sm space-y-1 text-destructive/80">
                      {result.errors.slice(0, 5).map((err, i) => (
                        <li key={i}>• {err}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={handleReset}>
                Import Another File
              </Button>
              <Button onClick={() => window.location.href = '/digital-twins'}>
                View Voter Profiles
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------
// Sub-components
// -----------------------------------------------------------------------

function StepIndicator({ label, active, done }: { label: string; active: boolean; done: boolean }) {
  return (
    <span
      className={`px-3 py-1 rounded-full text-xs font-medium ${
        active
          ? 'bg-primary text-primary-foreground'
          : done
          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
          : 'bg-muted text-muted-foreground'
      }`}
    >
      {done && !active ? '✓ ' : ''}
      {label}
    </span>
  )
}

function FormatCard({ name, description }: { name: string; description: string }) {
  return (
    <div className="border rounded-lg p-4">
      <p className="font-medium text-sm">{name}</p>
      <p className="text-xs text-muted-foreground mt-1">{description}</p>
    </div>
  )
}

function StatBadge({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-2">
      {icon}
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium">{value}</p>
      </div>
    </div>
  )
}

function ResultStat({
  label,
  value,
  variant = 'default',
}: {
  label: string
  value: number
  variant?: 'default' | 'success' | 'muted'
}) {
  const colorClass =
    variant === 'success'
      ? 'text-green-600 dark:text-green-400'
      : variant === 'muted'
      ? 'text-muted-foreground'
      : ''

  return (
    <div className="text-center p-4 bg-muted/30 rounded-lg">
      <p className={`text-2xl font-bold ${colorClass}`}>{value.toLocaleString()}</p>
      <p className="text-xs text-muted-foreground mt-1">{label}</p>
    </div>
  )
}
