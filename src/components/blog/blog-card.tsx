"use client"

import Link from "next/link"
import Image from "next/image"
import { BlogPost } from "@/types/blog"
import { Calendar, Clock } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

interface BlogCardProps {
  post: BlogPost
  featured?: boolean
}

export function BlogCard({ post, featured = false }: BlogCardProps) {
  return (
    <Card className={`group overflow-hidden border-border hover:shadow-lg transition-all duration-300 ${featured ? 'col-span-full' : ''}`}>
      <Link href={`/blog/${post.id}`} className="block">
        <div className={`relative overflow-hidden ${featured ? 'h-[300px]' : 'h-[200px]'}`}>
          <Image
            src={post.coverImage}
            alt={post.title}
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-105"
          />
        </div>
        <CardContent className="p-6">
          <div className="flex items-center gap-4 text-sm text-muted-foreground mb-3">
            <div className="flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              <span>{post.date}</span>
            </div>
            <div className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              <span>{post.readTime}</span>
            </div>
          </div>
          
          <h3 className={`font-semibold mb-2 group-hover:text-primary transition-colors ${featured ? 'text-2xl' : 'text-lg'}`}>
            {post.title}
          </h3>
          
          <p className="text-muted-foreground text-sm mb-4 line-clamp-2">
            {post.excerpt}
          </p>
          
          <div className="flex flex-wrap gap-2">
            {post.tags.map((tag) => (
              <Badge key={tag} variant="secondary" className="text-xs">
                {tag}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Link>
    </Card>
  )
}
