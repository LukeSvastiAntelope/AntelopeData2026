"use client"

import { PublicLayout } from "@/app/components/PublicLayout"
import { BlogCard } from "@/components/blog/blog-card"
import { BLOG_POSTS } from "@/data/blog-posts"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Mail } from "lucide-react"

const featuredPost = BLOG_POSTS[0]
const weeklyPosts = BLOG_POSTS.slice(1)

export default function BlogPage() {
  return (
    <PublicLayout>
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <section className="py-16 px-4 md:px-8 lg:px-16 border-b border-border">
        <div className="max-w-7xl mx-auto text-center">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-4">
            Catch Up with Our Latest Articles
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Discover how Antelope transforms your survey workflow with instant insights and powerful analytics—no code required.
          </p>
        </div>
      </section>

      {/* Recent Post Section */}
      <section className="py-12 px-4 md:px-8 lg:px-16 border-b border-border">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-2xl font-semibold">
              Latest Article
            </h2>
          </div>
          
          <BlogCard post={featuredPost} featured />
        </div>
      </section>

      {/* Weekly Most Read Section */}
      <section className="py-12 px-4 md:px-8 lg:px-16">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-2xl font-semibold mb-8">
            More Articles
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
            {weeklyPosts.map((post) => (
              <BlogCard key={post.id} post={post} />
            ))}
          </div>

          {/* Pagination */}
          <div className="flex justify-center items-center gap-2">
            <Button variant="ghost" size="sm" disabled>
              ← Previous
            </Button>
            <Button variant="ghost" size="sm" className="bg-foreground text-background hover:bg-foreground/90">
              1
            </Button>
            <Button variant="ghost" size="sm" disabled>
              2
            </Button>
            <Button variant="ghost" size="sm" disabled>
              3
            </Button>
            <Button variant="ghost" size="sm" disabled>
              4
            </Button>
            <Button variant="ghost" size="sm" disabled>
              Next →
            </Button>
          </div>
        </div>
      </section>

      {/* Newsletter Section */}
      <section className="py-16 px-4 md:px-8 lg:px-16 bg-muted/30">
        <div className="max-w-2xl mx-auto text-center">
          <div className="mb-8">
            <div className="inline-block text-6xl mb-4">⚡</div>
            <h2 className="text-3xl font-bold mb-2">Sign up to our Newsletter</h2>
            <p className="text-muted-foreground">
              Stay in the loop with our latest news and updates
            </p>
          </div>
          
          <div className="flex gap-2 max-w-md mx-auto">
            <Input 
              type="email" 
              placeholder="Your email" 
              className="flex-1"
            />
            <Button className="bg-foreground text-background hover:bg-foreground/90">
              <Mail className="h-4 w-4 mr-2" />
              Subscribe
            </Button>
          </div>
        </div>
      </section>
    </div>
    </PublicLayout>
  )
}
