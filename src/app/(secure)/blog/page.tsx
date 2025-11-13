"use client"

import { BlogCard } from "@/components/blog/blog-card"
import { BlogPost } from "@/types/blog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Mail } from "lucide-react"

// Mock data - replace with actual data fetching
const featuredPost: BlogPost = {
  id: "1",
  title: "How Remote work drastically improved my Design Skills",
  excerpt: "Remote work has drastically improved my design skills by giving me more flexibility and access to a wider pool of clients and collaborators. Without the daily commute and office distractions, I found more time for deep, uninterrupted work, allowing me to refine my craft and experiment with new techniques. The flexibility of remote work also enabled me to collaborate with talented designers and clients from around the world, exposing me to diverse perspectives and challenging me",
  content: "",
  coverImage: "/uploads/37c62ba0-801e-5cbb-9817-26e7c0828519.jpg",
  date: "21 July 2024",
  readTime: "4 min",
  tags: ["Remote", "Freelancing"]
}

const weeklyPosts: BlogPost[] = [
  {
    id: "2",
    title: "Our SaaS Product Just Launched!",
    excerpt: "Remote work has drastically improved my design skills by giving me more flexibility and access to a wider pool of clients and collaborators. Without the daily commute and office distractions, I found more time for deep, uninterrupted work, allowing me to refine my experiment, focus, and learn at my very own pace.",
    content: "",
    coverImage: "/uploads/37c62ba0-801e-5cbb-9817-26e7c0828519.jpg",
    date: "22 July 2024",
    readTime: "4 min",
    tags: ["Sales", "Product"]
  },
  {
    id: "3",
    title: "Our SaaS Product Just Launched!",
    excerpt: "Remote work has drastically improved my design skills by giving me more flexibility and access to a wider pool of clients and collaborators. Without the daily commute and office distractions, I found more time for deep, uninterrupted work, allowing me to refine my experiment, focus, and learn at my very own pace.",
    content: "",
    coverImage: "/uploads/37c62ba0-801e-5cbb-9817-26e7c0828519.jpg",
    date: "22 July 2024",
    readTime: "4 min",
    tags: ["Sales", "Product"]
  },
  {
    id: "4",
    title: "Our SaaS Product Just Launched!",
    excerpt: "Remote work has drastically improved my design skills by giving me more flexibility and access to a wider pool of clients and collaborators. Without the daily commute and office distractions, I found more time for deep, uninterrupted work, allowing me to refine my experiment, focus, and learn at my very own pace.",
    content: "",
    coverImage: "/uploads/37c62ba0-801e-5cbb-9817-26e7c0828519.jpg",
    date: "22 July 2024",
    readTime: "4 min",
    tags: ["Sales", "Product"]
  },
  {
    id: "5",
    title: "Our SaaS Product Just Launched!",
    excerpt: "Remote work has drastically improved my design skills by giving me more flexibility and access to a wider pool of clients and collaborators. Without the daily commute and office distractions, I found more time for deep, uninterrupted work, allowing me to refine my experiment, focus, and learn at my very own pace.",
    content: "",
    coverImage: "/uploads/37c62ba0-801e-5cbb-9817-26e7c0828519.jpg",
    date: "22 July 2024",
    readTime: "4 min",
    tags: ["Sales", "Product"]
  },
  {
    id: "6",
    title: "Our SaaS Product Just Launched!",
    excerpt: "Remote work has drastically improved my design skills by giving me more flexibility and access to a wider pool of clients and collaborators. Without the daily commute and office distractions, I found more time for deep, uninterrupted work, allowing me to refine my experiment, focus, and learn at my very own pace.",
    content: "",
    coverImage: "/uploads/37c62ba0-801e-5cbb-9817-26e7c0828519.jpg",
    date: "22 July 2024",
    readTime: "4 min",
    tags: ["Sales", "Product"]
  },
  {
    id: "7",
    title: "Our SaaS Product Just Launched!",
    excerpt: "Remote work has drastically improved my design skills by giving me more flexibility and access to a wider pool of clients and collaborators. Without the daily commute and office distractions, I found more time for deep, uninterrupted work, allowing me to refine my experiment, focus, and learn at my very own pace.",
    content: "",
    coverImage: "/uploads/37c62ba0-801e-5cbb-9817-26e7c0828519.jpg",
    date: "22 July 2024",
    readTime: "4 min",
    tags: ["Sales", "Product"]
  }
]

export default function BlogPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <section className="py-16 px-4 md:px-8 lg:px-16 border-b border-border">
        <div className="max-w-7xl mx-auto text-center">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-4">
            Catch Up with Our Latest Articles
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Catch up with our latest news and stay in the loop on expert updates, insightful articles, and exciting 
            announcements shaping our journey forward.
          </p>
        </div>
      </section>

      {/* Recent Post Section */}
      <section className="py-12 px-4 md:px-8 lg:px-16 border-b border-border">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-2xl font-semibold">
              Recent Post <span className="text-muted-foreground">(08)</span>
            </h2>
          </div>
          
          <BlogCard post={featuredPost} featured />
        </div>
      </section>

      {/* Weekly Most Read Section */}
      <section className="py-12 px-4 md:px-8 lg:px-16">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-2xl font-semibold mb-8">
            Weekly Most Read 🔥
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
            {weeklyPosts.map((post) => (
              <BlogCard key={post.id} post={post} />
            ))}
          </div>

          {/* Pagination */}
          <div className="flex justify-center items-center gap-2">
            <Button variant="ghost" size="sm">
              ← Previous
            </Button>
            <Button variant="ghost" size="sm" className="bg-foreground text-background hover:bg-foreground/90">
              1
            </Button>
            <Button variant="ghost" size="sm">
              2
            </Button>
            <Button variant="ghost" size="sm">
              3
            </Button>
            <Button variant="ghost" size="sm">
              4
            </Button>
            <Button variant="ghost" size="sm">
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
  )
}
