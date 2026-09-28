'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft, Loader2, ExternalLink } from 'lucide-react'
import { useFetch } from '@/app/utils/lib'
import toast from 'react-hot-toast'

interface EditorPost {
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
}

export default function AdminBlogEditorPage() {
  const params = useParams()
  const id = String(params.id || '')
  const fetch = useFetch()
  const router = useRouter()

  const [post, setPost] = useState<EditorPost | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [tagsText, setTagsText] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch.get(`/api/admin/blog/${id}`)
      if (res.status && res.post) {
        setPost(res.post)
        setTagsText((res.post.tags || []).join(', '))
      } else {
        toast.error(res.message || 'Post not found')
        router.push('/admin/content')
      }
    } catch (e) {
      console.error(e)
      toast.error('Failed to load post')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  const save = async (overrides?: Partial<EditorPost>) => {
    if (!post) return
    setSaving(true)
    try {
      const payload = {
        title: overrides?.title ?? post.title,
        excerpt: overrides?.excerpt ?? post.excerpt,
        content: overrides?.content ?? post.content,
        date: overrides?.date ?? post.date,
        readTime: overrides?.readTime ?? post.readTime,
        tags: tagsText
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        author: overrides?.author ?? post.author,
        status: overrides?.status ?? post.status,
        sortOrder: overrides?.sortOrder ?? post.sortOrder,
      }
      const token =
        typeof window !== 'undefined'
          ? localStorage.getItem('token') ?? ''
          : ''
      const response = await window.fetch(`/api/admin/blog/${id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })
      const res = await response.json()
      if (response.ok && res.status) {
        setPost(res.post)
        setTagsText((res.post.tags || []).join(', '))
        toast.success(
          overrides?.status === 'published'
            ? 'Published'
            : overrides?.status === 'draft'
              ? 'Unpublished'
              : 'Saved'
        )
      } else {
        toast.error(res.message || 'Save failed')
      }
    } catch (e) {
      console.error(e)
      toast.error('Save failed')
    } finally {
      setSaving(false)
    }
  }

  if (loading || !post) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-screen">
      <div className="flex items-center gap-2 p-4 border-b flex-wrap">
        <SidebarTrigger />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push('/admin/content')}
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Content
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold truncate">{post.title}</h1>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="font-mono">{post.id}</span>
            <Badge
              variant={post.status === 'published' ? 'default' : 'secondary'}
            >
              {post.status}
            </Badge>
          </div>
        </div>
        <div className="flex gap-2">
          {post.status === 'published' && (
            <Button variant="outline" size="sm" asChild>
              <a href={`/blog/${post.id}`} target="_blank" rel="noreferrer">
                <ExternalLink className="h-4 w-4 mr-1" />
                View
              </a>
            </Button>
          )}
          {post.status === 'published' ? (
            <Button
              variant="outline"
              size="sm"
              disabled={saving}
              onClick={() => save({ status: 'draft' })}
            >
              Unpublish
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              disabled={saving}
              onClick={() => save({ status: 'published' })}
            >
              Publish
            </Button>
          )}
          <Button size="sm" disabled={saving} onClick={() => save()}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
            Save
          </Button>
        </div>
      </div>

      <div className="flex-1 p-6 max-w-3xl mx-auto w-full">
        <Card>
          <CardHeader>
            <CardTitle>Edit post</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <Label>Title</Label>
              <Input
                value={post.title}
                onChange={(e) =>
                  setPost((p) => (p ? { ...p, title: e.target.value } : p))
                }
              />
            </div>
            <div className="grid sm:grid-cols-3 gap-4">
              <div className="space-y-1">
                <Label>Display date</Label>
                <Input
                  value={post.date}
                  onChange={(e) =>
                    setPost((p) => (p ? { ...p, date: e.target.value } : p))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>Read time</Label>
                <Input
                  value={post.readTime}
                  onChange={(e) =>
                    setPost((p) =>
                      p ? { ...p, readTime: e.target.value } : p
                    )
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>Sort order</Label>
                <Input
                  type="number"
                  value={post.sortOrder}
                  onChange={(e) =>
                    setPost((p) =>
                      p
                        ? { ...p, sortOrder: Number(e.target.value) || 0 }
                        : p
                    )
                  }
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Author</Label>
              <Input
                value={post.author.name}
                onChange={(e) =>
                  setPost((p) =>
                    p
                      ? { ...p, author: { ...p.author, name: e.target.value } }
                      : p
                  )
                }
              />
            </div>
            <div className="space-y-1">
              <Label>Tags (comma-separated)</Label>
              <Input
                value={tagsText}
                onChange={(e) => setTagsText(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Excerpt</Label>
              <Textarea
                value={post.excerpt}
                onChange={(e) =>
                  setPost((p) => (p ? { ...p, excerpt: e.target.value } : p))
                }
                rows={3}
              />
            </div>
            <div className="space-y-1">
              <Label>Content (Markdown)</Label>
              <Textarea
                value={post.content}
                onChange={(e) =>
                  setPost((p) => (p ? { ...p, content: e.target.value } : p))
                }
                rows={20}
                className="font-mono text-sm"
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
