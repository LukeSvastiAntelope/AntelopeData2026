import Link from "next/link"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { Calendar, Clock, ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { PublicLayout } from "@/app/components/PublicLayout"
import { getPublishedBlogPost } from "@/app/utils/services/content-cms-service"
import { notFound } from "next/navigation"

export const dynamic = "force-dynamic"

type PageProps = { params: Promise<{ id: string }> }

export default async function BlogPostPage({ params }: PageProps) {
  const { id } = await params
  const post = await getPublishedBlogPost(id)

  if (!post) {
    notFound()
  }

  return (
    <PublicLayout>
      <div className="min-h-screen bg-background">
        <div className="max-w-4xl mx-auto px-4 md:px-8 py-12">
          <Link href="/blog">
            <Button variant="ghost" className="mb-8">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Blog
            </Button>
          </Link>

          <article>
            <div className="mb-6">
              <div className="flex flex-wrap gap-2 mb-4">
                {post.tags.map((tag) => (
                  <Badge key={tag} variant="secondary">
                    {tag}
                  </Badge>
                ))}
              </div>

              <h1 className="text-4xl md:text-5xl font-bold mb-4">
                {post.title}
              </h1>

              <div className="flex items-center gap-4 text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  <span>{post.date}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  <span>{post.readTime}</span>
                </div>
              </div>
            </div>

            <div className="prose prose-lg dark:prose-invert max-w-none">
              {post.content ? (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{post.content}</ReactMarkdown>
              ) : (
                <p className="text-foreground leading-relaxed">{post.excerpt}</p>
              )}
            </div>
          </article>
        </div>
      </div>
    </PublicLayout>
  )
}
