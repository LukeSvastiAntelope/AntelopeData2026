'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Upload, Sparkles, Loader2, CheckCircle2, AlertCircle, ArrowLeft, PhoneCall } from 'lucide-react'
import toast from 'react-hot-toast'
import Link from 'next/link'

type PreviewRow = Record<string, string>

interface PreviewResult {
  totalRows: number
  filteredRows: number
  filterApplied: boolean
  filterPrompt: string | null
  hasPhone: boolean
  colMap: Record<string, string>
  headers: string[]
  preview: PreviewRow[]
  allContacts: PreviewRow[]
}

export default function NewContactListPage() {
  const router = useRouter()

  const [step, setStep] = useState<'upload' | 'filter' | 'save'>('upload')
  const [dragging, setDragging] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [filterPrompt, setFilterPrompt] = useState('')
  const [previewLoading, setPreviewLoading] = useState(false)
  const [preview, setPreview] = useState<PreviewResult | null>(null)
  const [listName, setListName] = useState('')
  const [saving, setSaving] = useState(false)

  const handleFile = (f: File) => {
    setFile(f)
    setPreview(null)
    setStep('filter')
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) handleFile(f)
  }, [])

  const onFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) handleFile(f)
  }

  const runPreview = async () => {
    if (!file) return
    setPreviewLoading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      if (filterPrompt.trim()) fd.append('filter', filterPrompt.trim())

      const res = await fetch('/api/contact-lists/preview', {
        method: 'POST',
        credentials: 'include',
        body: fd,
      })
      const data = await res.json()
      if (!res.ok || !data.status) throw new Error(data.message || 'Preview failed')
      if (!data.hasPhone) {
        toast.error('No phone number column detected. Make sure your file has a column named "phone", "mobile", "cell", etc.')
        return
      }
      setPreview(data)
      setListName(file.name.replace(/\.[^.]+$/, '').replace(/_/g, ' '))
      setStep('save')
    } catch (e: any) {
      toast.error(e.message || 'Failed to preview file')
    } finally {
      setPreviewLoading(false)
    }
  }

  const saveList = async () => {
    if (!preview || !listName.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/contact-lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: listName.trim(),
          source_file: file?.name,
          filter_prompt: preview.filterPrompt || undefined,
          column_map: preview.colMap,
          contacts: preview.allContacts,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.status) throw new Error(data.message || 'Save failed')
      toast.success(`List "${listName}" saved with ${data.contact_count} contacts.`)
      router.push('/channels/sms/lists')
    } catch (e: any) {
      toast.error(e.message || 'Failed to save list')
    } finally {
      setSaving(false)
    }
  }

  const DISPLAY_FIELDS = ['phone', 'first_name', 'last_name', 'age', 'district', 'zip', 'party', 'state']

  return (
    <div className="flex-1 p-2 w-full bg-background">
      <div className="mx-auto rounded-lg bg-card text-card-foreground shadow-lg">
        <div className="px-6 py-2 flex items-center gap-3">
          <SidebarTrigger className="-ml-0.5 h-5 w-5 text-muted-foreground hover:text-foreground" />
          <div className="h-4 border-l border-border" />
          <Link href="/channels/sms/lists" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <h1 className="text-base font-medium">New Contact List</h1>
        </div>
        <div className="border-b border-border" />

        <div className="p-6 max-w-4xl space-y-6">

          {/* Step indicators */}
          <div className="flex items-center gap-2 text-sm">
            {(['upload', 'filter', 'save'] as const).map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                {i > 0 && <div className="h-px w-8 bg-border" />}
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                  step === s ? 'bg-primary text-primary-foreground' :
                  (['upload', 'filter', 'save'].indexOf(step) > i) ? 'bg-muted text-muted-foreground line-through' :
                  'bg-muted text-muted-foreground'
                }`}>
                  {i + 1}. {s.charAt(0).toUpperCase() + s.slice(1)}
                </span>
              </div>
            ))}
          </div>

          {/* Upload step */}
          {(step === 'upload' || step === 'filter') && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Upload className="h-4 w-4" />
                  Upload Spreadsheet
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div
                  onDragOver={e => { e.preventDefault(); setDragging(true) }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={onDrop}
                  className={`border-2 border-dashed rounded-lg p-10 text-center transition-colors cursor-pointer ${
                    dragging ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground'
                  }`}
                  onClick={() => document.getElementById('file-input')?.click()}
                >
                  <input id="file-input" type="file" accept=".csv,.tsv,.txt,.xlsx,.xls" className="hidden" onChange={onFileInput} />
                  <Upload className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
                  {file ? (
                    <div className="space-y-1">
                      <p className="font-medium text-sm">{file.name}</p>
                      <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB · click to replace</p>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <p className="text-sm font-medium">Drop a CSV or Excel file here</p>
                      <p className="text-xs text-muted-foreground">CSV, TSV, XLSX, XLS supported · max 500 rows recommended</p>
                    </div>
                  )}
                </div>

                {file && (
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label className="flex items-center gap-1.5">
                        <Sparkles className="h-3.5 w-3.5 text-primary" />
                        AI Filter (optional)
                      </Label>
                      <Input
                        value={filterPrompt}
                        onChange={e => setFilterPrompt(e.target.value)}
                        placeholder='e.g. "only age 35 and older" or "district 4, party = Democrat"'
                        onKeyDown={e => { if (e.key === 'Enter') runPreview() }}
                      />
                      <p className="text-xs text-muted-foreground">
                        Describe a filter in plain English. The AI will apply it to your rows before saving. Leave blank to keep all rows.
                      </p>
                    </div>
                    <Button onClick={runPreview} disabled={previewLoading}>
                      {previewLoading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Analyzing…</> : 'Preview & Continue'}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Preview + save step */}
          {step === 'save' && preview && (
            <>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2 justify-between">
                    <span className="flex items-center gap-2">
                      <PhoneCall className="h-4 w-4" />
                      Preview
                    </span>
                    <div className="flex items-center gap-2">
                      {preview.filterApplied ? (
                        <Badge variant="secondary" className="text-xs">
                          <Sparkles className="h-3 w-3 mr-1" />
                          AI filtered: {preview.filteredRows} of {preview.totalRows} rows
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs">{preview.filteredRows} contacts</Badge>
                      )}
                      {preview.hasPhone
                        ? <CheckCircle2 className="h-4 w-4 text-green-500" />
                        : <AlertCircle className="h-4 w-4 text-destructive" />
                      }
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto rounded-md border border-border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {DISPLAY_FIELDS.filter(f => preview.preview.some(r => r[f])).map(f => (
                            <TableHead key={f} className="text-xs capitalize">{f.replace('_', ' ')}</TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {preview.preview.slice(0, 10).map((row, i) => (
                          <TableRow key={i}>
                            {DISPLAY_FIELDS.filter(f => preview.preview.some(r => r[f])).map(f => (
                              <TableCell key={f} className="text-xs">{row[f] || '—'}</TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  {preview.filteredRows > 10 && (
                    <p className="text-xs text-muted-foreground mt-2">Showing 10 of {preview.filteredRows} contacts.</p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Save List</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>List Name</Label>
                    <Input
                      value={listName}
                      onChange={e => setListName(e.target.value)}
                      placeholder="e.g. District 4 Voters 35+"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={saveList} disabled={saving || !listName.trim()}>
                      {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving…</> : `Save ${preview.filteredRows} Contacts`}
                    </Button>
                    <Button variant="outline" onClick={() => { setStep('filter'); setPreview(null) }}>
                      Back
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
