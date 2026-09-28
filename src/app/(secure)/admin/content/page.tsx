'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  Loader2,
  RefreshCw,
  Plus,
  FileText,
  DollarSign,
  ArrowLeft,
  Trash2,
  ExternalLink,
} from 'lucide-react'
import { useFetch } from '@/app/utils/lib'
import toast from 'react-hot-toast'
import type { PricingSheetContent } from '@/app/utils/database/content-sheet-repo'

interface AdminBlogPost {
  id: string
  title: string
  excerpt: string
  content: string
  date: string
  readTime: string
  tags: string[]
  author: { name: string; avatar?: string }
  status: 'draft' | 'published'
  sortOrder: number
  updatedAt: string | null
}

const EMPTY_PRICING: PricingSheetContent = {
  headline: '',
  subheadline: '',
  trial: { title: '', body: '' },
  free: { title: '', body: '' },
  plans: [],
  featureRows: [],
  everyPlan: { title: '', body: '' },
  footnote: '',
}

export default function AdminContentPage() {
  const fetch = useFetch()
  const router = useRouter()

  const [posts, setPosts] = useState<AdminBlogPost[]>([])
  const [postsLoading, setPostsLoading] = useState(false)
  const [pricing, setPricing] = useState<PricingSheetContent>(EMPTY_PRICING)
  const [pricingLoading, setPricingLoading] = useState(false)
  const [pricingSaving, setPricingSaving] = useState(false)
  const [newSlug, setNewSlug] = useState('')
  const [creating, setCreating] = useState(false)

  const loadPosts = useCallback(async () => {
    setPostsLoading(true)
    try {
      const res = await fetch.get('/api/admin/blog')
      if (res.status) {
        setPosts(res.posts || [])
      } else {
        toast.error(res.message || 'Failed to load posts')
      }
    } catch (e) {
      console.error(e)
      toast.error('Failed to load posts')
    } finally {
      setPostsLoading(false)
    }
  }, [])

  const loadPricing = useCallback(async () => {
    setPricingLoading(true)
    try {
      const res = await fetch.get('/api/admin/content-sheets/pricing')
      if (res.status && res.sheet?.content) {
        setPricing(res.sheet.content as PricingSheetContent)
      } else {
        toast.error(res.message || 'Failed to load pricing sheet')
      }
    } catch (e) {
      console.error(e)
      toast.error('Failed to load pricing sheet')
    } finally {
      setPricingLoading(false)
    }
  }, [])

  useEffect(() => {
    loadPosts()
    loadPricing()
  }, [])

  const handleCreate = async () => {
    const slug = newSlug.trim()
    if (!slug) {
      toast.error('Enter a slug')
      return
    }
    setCreating(true)
    try {
      const res = await fetch.post('/api/admin/blog', {
        id: slug,
        title: 'Untitled draft',
        excerpt: '',
        content: '',
        date: new Date().toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        }),
        readTime: '1 min',
        tags: [],
        author: { name: 'Luke Svasti' },
        status: 'draft',
        sortOrder: posts.length,
      })
      if (res.status && res.post) {
        toast.success('Draft created')
        setNewSlug('')
        router.push(`/admin/content/blog/${res.post.id}`)
      } else {
        toast.error(res.message || 'Create failed')
      }
    } catch (e) {
      console.error(e)
      toast.error('Create failed')
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm(`Delete post “${id}”? This cannot be undone.`)) return
    try {
      const token =
        typeof window !== 'undefined'
          ? localStorage.getItem('token') ?? ''
          : ''
      const response = await window.fetch(`/api/admin/blog/${id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      })
      const res = await response.json()
      if (response.ok && res.status) {
        toast.success('Deleted')
        setPosts((prev) => prev.filter((p) => p.id !== id))
      } else {
        toast.error(res.message || 'Delete failed')
      }
    } catch (e) {
      console.error(e)
      toast.error('Delete failed')
    }
  }

  const savePricing = async () => {
    setPricingSaving(true)
    try {
      const token =
        typeof window !== 'undefined'
          ? localStorage.getItem('token') ?? ''
          : ''
      const response = await window.fetch('/api/admin/content-sheets/pricing', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: 'Pricing & features',
          content: pricing,
        }),
      })
      const res = await response.json()
      if (response.ok && res.status) {
        toast.success('Pricing sheet saved')
        if (res.sheet?.content) {
          setPricing(res.sheet.content as PricingSheetContent)
        }
      } else {
        toast.error(res.message || 'Save failed')
      }
    } catch (e) {
      console.error(e)
      toast.error('Save failed')
    } finally {
      setPricingSaving(false)
    }
  }

  const updatePlan = (
    index: number,
    field: keyof PricingSheetContent['plans'][0],
    value: string
  ) => {
    setPricing((prev) => {
      const plans = prev.plans.map((p, i) => {
        if (i !== index) return p
        if (field === 'name' || field === 'description') {
          return { ...p, [field]: value }
        }
        return { ...p, [field]: Number(value) || 0 }
      })
      return { ...prev, plans }
    })
  }

  const updateFeatureRow = (
    index: number,
    field: 'label' | number,
    value: string
  ) => {
    setPricing((prev) => {
      const featureRows = prev.featureRows.map((row, i) => {
        if (i !== index) return row
        if (field === 'label') return { ...row, label: value }
        const values = [...row.values]
        values[field] = value
        return { ...row, values }
      })
      return { ...prev, featureRows }
    })
  }

  return (
    <div className="flex flex-col min-h-screen">
      <div className="flex items-center gap-2 p-4 border-b">
        <SidebarTrigger />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push('/admin')}
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Admin
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Content</h1>
          <p className="text-sm text-muted-foreground">
            Blog CMS · pricing &amp; feature sheets
          </p>
        </div>
      </div>

      <div className="flex-1 p-6 max-w-5xl mx-auto w-full">
        <Tabs defaultValue="blog">
          <TabsList>
            <TabsTrigger value="blog" className="flex items-center gap-1">
              <FileText className="h-4 w-4" />
              Blog
            </TabsTrigger>
            <TabsTrigger value="pricing" className="flex items-center gap-1">
              <DollarSign className="h-4 w-4" />
              Pricing
            </TabsTrigger>
          </TabsList>

          <TabsContent value="blog" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div>
                    <CardTitle>Blog posts</CardTitle>
                    <CardDescription>
                      Draft / published · feeds /blog and /blog/[id]
                    </CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={loadPosts}
                    disabled={postsLoading}
                  >
                    <RefreshCw
                      className={`h-4 w-4 mr-1 ${postsLoading ? 'animate-spin' : ''}`}
                    />
                    Refresh
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2 items-end">
                  <div className="flex-1 space-y-1">
                    <Label htmlFor="new-slug">New draft slug</Label>
                    <Input
                      id="new-slug"
                      placeholder="e.g. district-listening-guide"
                      value={newSlug}
                      onChange={(e) => setNewSlug(e.target.value)}
                    />
                  </div>
                  <Button onClick={handleCreate} disabled={creating}>
                    {creating ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-1" />
                    ) : (
                      <Plus className="h-4 w-4 mr-1" />
                    )}
                    Create
                  </Button>
                </div>

                {postsLoading && posts.length === 0 ? (
                  <div className="flex justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : posts.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    No posts yet — create a draft or wait for seed.
                  </div>
                ) : (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Title</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Order</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {posts.map((p) => (
                          <TableRow key={p.id}>
                            <TableCell>
                              <div className="font-medium text-sm">{p.title}</div>
                              <div className="text-xs text-muted-foreground font-mono">
                                {p.id}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  p.status === 'published'
                                    ? 'default'
                                    : 'secondary'
                                }
                              >
                                {p.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-mono text-sm">
                              {p.sortOrder}
                            </TableCell>
                            <TableCell className="text-right space-x-1">
                              {p.status === 'published' && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  asChild
                                >
                                  <a
                                    href={`/blog/${p.id}`}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    <ExternalLink className="h-4 w-4" />
                                  </a>
                                </Button>
                              )}
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  router.push(`/admin/content/blog/${p.id}`)
                                }
                              >
                                Edit
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive"
                                onClick={() => handleDelete(p.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="pricing" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div>
                    <CardTitle>Pricing &amp; feature sheet</CardTitle>
                    <CardDescription>
                      Editable records for /pricing
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={loadPricing}
                      disabled={pricingLoading}
                    >
                      <RefreshCw
                        className={`h-4 w-4 mr-1 ${pricingLoading ? 'animate-spin' : ''}`}
                      />
                      Reload
                    </Button>
                    <Button
                      size="sm"
                      onClick={savePricing}
                      disabled={pricingSaving || pricingLoading}
                    >
                      {pricingSaving && (
                        <Loader2 className="h-4 w-4 animate-spin mr-1" />
                      )}
                      Save
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {pricingLoading ? (
                  <div className="flex justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-1 sm:col-span-2">
                        <Label>Headline</Label>
                        <Input
                          value={pricing.headline}
                          onChange={(e) =>
                            setPricing((p) => ({
                              ...p,
                              headline: e.target.value,
                            }))
                          }
                        />
                      </div>
                      <div className="space-y-1 sm:col-span-2">
                        <Label>Subheadline</Label>
                        <Textarea
                          value={pricing.subheadline}
                          onChange={(e) =>
                            setPricing((p) => ({
                              ...p,
                              subheadline: e.target.value,
                            }))
                          }
                          rows={2}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label>Trial title</Label>
                        <Input
                          value={pricing.trial.title}
                          onChange={(e) =>
                            setPricing((p) => ({
                              ...p,
                              trial: { ...p.trial, title: e.target.value },
                            }))
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <Label>Free title</Label>
                        <Input
                          value={pricing.free.title}
                          onChange={(e) =>
                            setPricing((p) => ({
                              ...p,
                              free: { ...p.free, title: e.target.value },
                            }))
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <Label>Trial body</Label>
                        <Textarea
                          value={pricing.trial.body}
                          onChange={(e) =>
                            setPricing((p) => ({
                              ...p,
                              trial: { ...p.trial, body: e.target.value },
                            }))
                          }
                          rows={3}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label>Free body</Label>
                        <Textarea
                          value={pricing.free.body}
                          onChange={(e) =>
                            setPricing((p) => ({
                              ...p,
                              free: { ...p.free, body: e.target.value },
                            }))
                          }
                          rows={3}
                        />
                      </div>
                    </div>

                    <div>
                      <h3 className="font-medium mb-3">Plans</h3>
                      <div className="space-y-4">
                        {pricing.plans.map((plan, i) => (
                          <div
                            key={i}
                            className="grid gap-2 sm:grid-cols-5 border rounded-md p-3"
                          >
                            <div className="space-y-1">
                              <Label>Name</Label>
                              <Input
                                value={plan.name}
                                onChange={(e) =>
                                  updatePlan(i, 'name', e.target.value)
                                }
                              />
                            </div>
                            <div className="space-y-1 sm:col-span-2">
                              <Label>Description</Label>
                              <Input
                                value={plan.description}
                                onChange={(e) =>
                                  updatePlan(i, 'description', e.target.value)
                                }
                              />
                            </div>
                            <div className="space-y-1">
                              <Label>Monthly $</Label>
                              <Input
                                type="number"
                                value={plan.monthly}
                                onChange={(e) =>
                                  updatePlan(i, 'monthly', e.target.value)
                                }
                              />
                            </div>
                            <div className="space-y-1">
                              <Label>Annual $</Label>
                              <Input
                                type="number"
                                value={plan.annual}
                                onChange={(e) =>
                                  updatePlan(i, 'annual', e.target.value)
                                }
                              />
                            </div>
                            <div className="space-y-1">
                              <Label>Save $</Label>
                              <Input
                                type="number"
                                value={plan.save}
                                onChange={(e) =>
                                  updatePlan(i, 'save', e.target.value)
                                }
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <h3 className="font-medium mb-3">Feature comparison</h3>
                      <div className="space-y-3">
                        {pricing.featureRows.map((row, i) => (
                          <div
                            key={i}
                            className="grid gap-2 sm:grid-cols-5 border rounded-md p-3"
                          >
                            <div className="space-y-1 sm:col-span-1">
                              <Label>Label</Label>
                              <Input
                                value={row.label}
                                onChange={(e) =>
                                  updateFeatureRow(i, 'label', e.target.value)
                                }
                              />
                            </div>
                            {row.values.map((v, vi) => (
                              <div key={vi} className="space-y-1">
                                <Label>
                                  {pricing.plans[vi]?.name || `Col ${vi + 1}`}
                                </Label>
                                <Input
                                  value={v}
                                  onChange={(e) =>
                                    updateFeatureRow(i, vi, e.target.value)
                                  }
                                />
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-1">
                        <Label>Every-plan title</Label>
                        <Input
                          value={pricing.everyPlan.title}
                          onChange={(e) =>
                            setPricing((p) => ({
                              ...p,
                              everyPlan: {
                                ...p.everyPlan,
                                title: e.target.value,
                              },
                            }))
                          }
                        />
                      </div>
                      <div className="space-y-1 sm:col-span-2">
                        <Label>Every-plan body</Label>
                        <Textarea
                          value={pricing.everyPlan.body}
                          onChange={(e) =>
                            setPricing((p) => ({
                              ...p,
                              everyPlan: {
                                ...p.everyPlan,
                                body: e.target.value,
                              },
                            }))
                          }
                          rows={3}
                        />
                      </div>
                      <div className="space-y-1 sm:col-span-2">
                        <Label>Footnote</Label>
                        <Textarea
                          value={pricing.footnote}
                          onChange={(e) =>
                            setPricing((p) => ({
                              ...p,
                              footnote: e.target.value,
                            }))
                          }
                          rows={2}
                        />
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
