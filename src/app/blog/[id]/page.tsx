"use client"

import { useParams } from "next/navigation"
import Image from "next/image"
import Link from "next/link"
import { Calendar, Clock, ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { PublicLayout } from "@/app/components/PublicLayout"

export default function BlogPostPage() {
  const params = useParams()
  
  // Mock data - replace with actual data fetching
  const post = {
    id: params.id,
    title: "How Remote work drastically improved my Design Skills",
    content: `Remote work has drastically improved my design skills by giving me more flexibility and access to a wider pool of clients and collaborators. Without the daily commute and office distractions, I found more time for deep, uninterrupted work, allowing me to refine my craft and experiment with new techniques.

The flexibility of remote work also enabled me to collaborate with talented designers and clients from around the world, exposing me to diverse perspectives and challenging me to grow as a designer. This global exposure has been invaluable in expanding my skill set and understanding of different design approaches.

Additionally, remote work has taught me to be more self-disciplined and proactive in seeking out learning opportunities. I've taken online courses, participated in virtual design communities, and engaged in side projects that have all contributed to my professional development.`,
    coverImage: "/uploads/37c62ba0-801e-5cbb-9817-26e7c0828519.jpg",
    date: "21 July 2024",
    readTime: "4 min",
    tags: ["Remote", "Freelancing"],
    author: {
      name: "John Doe",
      avatar: "/avatar/37c62ba0-801e-5cbb-9817-26e7c0828519.jpg"
    }
  }

  return (
    <PublicLayout>
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 md:px-8 py-12">
        {/* Back Button */}
        <Link href="/blog">
          <Button variant="ghost" className="mb-8">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Blog
          </Button>
        </Link>

        {/* Article Header */}
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

          {/* Cover Image */}
          <div className="relative w-full h-[400px] mb-8 rounded-lg overflow-hidden">
            <Image
              src={post.coverImage}
              alt={post.title}
              fill
              className="object-cover"
            />
          </div>

          {/* Article Content */}
          <div className="prose prose-lg dark:prose-invert max-w-none">
            {post.content.split('\n\n').map((paragraph, index) => (
              <p key={index} className="mb-4 text-foreground leading-relaxed">
                {paragraph}
              </p>
            ))}
          </div>
        </article>
      </div>
    </div>
    </PublicLayout>
  )
}
