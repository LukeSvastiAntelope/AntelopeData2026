'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Plus, Trash2, Send, ArrowLeft, Users, Sparkles, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import SendSurveyModal from '../_components/SendSurveyModal'

interface ContactList {
  id: number
  name: string
  description: string | null
  contact_count: number
  filter_prompt: string | null
  source_file: string | null
  created_at: string
}

export default function SmsListsPage() {
  const [lists, setLists] = useState<ContactList[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [sendModal, setSendModal] = useState<ContactList | null>(null)

  const load = async () => {
    try {
      const res = await fetch('/api/contact-lists', { credentials: 'include' })
      const data = await res.json()
      if (data.status) setLists(data.lists || [])
    } catch {
      toast.error('Failed to load lists')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const deleteList = async (id: number, name: string) => {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return
    setDeletingId(id)
    try {
      const res = await fetch(`/api/contact-lists/${id}`, { method: 'DELETE', credentials: 'include' })
      const data = await res.json()
      if (!res.ok || !data.status) throw new Error(data.message)
      toast.success('List deleted')
      setLists(prev => prev.filter(l => l.id !== id))
    } catch (e: any) {
      toast.error(e.message || 'Delete failed')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="flex-1 p-2 w-full bg-background">
      <div className="mx-auto rounded-lg bg-card text-card-foreground shadow-lg">
        <div className="px-6 py-2 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <SidebarTrigger className="-ml-0.5 h-5 w-5 text-muted-foreground hover:text-foreground" />
            <div className="h-4 border-l border-border" />
            <Link href="/channels" className="text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <h1 className="text-base font-medium">SMS — Contact Lists</h1>
          </div>
          <Button size="sm" asChild>
            <Link href="/channels/sms/lists/new"><Plus className="h-4 w-4 mr-1" />New List</Link>
          </Button>
        </div>
        <div className="border-b border-border" />

        <div className="p-6 space-y-4">
          <p className="text-sm text-muted-foreground">
            Each list is a saved group of phone numbers. Upload a spreadsheet, optionally filter it with AI, then send a survey to any list.
          </p>

          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm py-8">
              <Loader2 className="h-4 w-4 animate-spin" />Loading lists…
            </div>
          ) : lists.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center space-y-4">
                <Users className="h-10 w-10 mx-auto text-muted-foreground" />
                <p className="text-muted-foreground text-sm">No contact lists yet.</p>
                <Button asChild>
                  <Link href="/channels/sms/lists/new"><Plus className="h-4 w-4 mr-1" />Upload your first list</Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{lists.length} list{lists.length !== 1 ? 's' : ''}</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Contacts</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Filter</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lists.map(list => (
                      <TableRow key={list.id}>
                        <TableCell className="font-medium">{list.name}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{list.contact_count.toLocaleString()}</Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{list.source_file || '—'}</TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                          {list.filter_prompt
                            ? <span className="flex items-center gap-1"><Sparkles className="h-3 w-3 text-primary shrink-0" />{list.filter_prompt}</span>
                            : '—'}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {new Date(list.created_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="inline-flex gap-2">
                            <Button size="sm" onClick={() => setSendModal(list)}>
                              <Send className="h-3.5 w-3.5 mr-1" />Send Survey
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive hover:text-destructive"
                              disabled={deletingId === list.id}
                              onClick={() => deleteList(list.id, list.name)}
                            >
                              {deletingId === list.id
                                ? <Loader2 className="h-4 w-4 animate-spin" />
                                : <Trash2 className="h-4 w-4" />}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {sendModal && (
        <SendSurveyModal
          list={sendModal}
          onClose={() => setSendModal(null)}
        />
      )}
    </div>
  )
}
