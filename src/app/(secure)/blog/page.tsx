"use client"

import { BlogCard } from "@/components/blog/blog-card"
import { BlogPost } from "@/types/blog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Mail } from "lucide-react"

// Mock data - replace with actual data fetching
const featuredPost: BlogPost = {
  id: "1",
  title: "Voter Profiles: Transform Survey Data Into Intelligent AI Agents",
  excerpt: "Discover how Antelope's voter profile technology creates AI-powered personas from survey responses. Each respondent becomes a queryable agent that preserves their unique perspectives, values, and decision-making patterns—enabling unprecedented insights without re-surveying your audience.",
  content: "",
  date: "21 Nov 2024",
  readTime: "6 min",
  tags: ["Voter Profiles", "AI Analytics"],
  author: { name: "admin" }
}

const weeklyPosts: BlogPost[] = [
  {
    id: "2",
    title: "Cohort Analysis Made Simple: Segment Your Survey Audience in Seconds",
    excerpt: "Learn how to create powerful audience segments with Antelope's cohort builder. Filter respondents by demographics, answers, and behaviors to uncover hidden patterns in your data. No SQL required—just point, click, and discover insights that drive better decisions.",
    content: "",
    date: "18 Nov 2024",
    readTime: "5 min",
    tags: ["Cohort Analysis", "Survey Analytics"],
    author: { name: "admin" }
  },
  {
    id: "3",
    title: "AI-Powered Survey Analytics: Get Instant Insights Without Writing Code",
    excerpt: "Stop spending hours in spreadsheets. Antelope's AI analytics engine automatically generates charts, identifies trends, and surfaces key insights from your survey data. Ask questions in plain English and get comprehensive analysis in seconds—powered by GPT-4 and advanced visualization models.",
    content: "",
    date: "15 Nov 2024",
    readTime: "5 min",
    tags: ["AI Analytics", "Data Visualization"],
    author: { name: "admin" }
  },
  {
    id: "4",
    title: "Chat With Your Survey Data: Natural Language Queries for Research Teams",
    excerpt: "Imagine asking your survey data questions like you would a colleague. With Antelope's conversational analytics, you can query cohorts, explore trends, and generate reports using natural language. Perfect for researchers who want insights fast without learning complex analytics tools.",
    content: "",
    date: "12 Nov 2024",
    readTime: "4 min",
    tags: ["Conversational AI", "Research Tools"],
    author: { name: "admin" }
  },
  {
    id: "5",
    title: "Survey Response Prediction: How Voter Profiles Answer New Questions",
    excerpt: "What if you could predict how your respondents would answer new survey questions without asking them again? Antelope's voter profiles use AI to generate accurate predictions based on each person's unique profile, saving time and reducing survey fatigue while maintaining data quality.",
    content: "",
    date: "08 Nov 2024",
    readTime: "5 min",
    tags: ["Predictive Analytics", "Voter Profiles"],
    author: { name: "admin" }
  },
  {
    id: "6",
    title: "From Raw Data to Rich Insights: Automated Survey Report Generation",
    excerpt: "Transform survey responses into professional, comprehensive reports automatically. Antelope analyzes your data, identifies key themes, generates visualizations, and produces executive summaries—all without manual effort. Get publication-ready insights in minutes, not days.",
    content: "",
    date: "05 Nov 2024",
    readTime: "4 min",
    tags: ["Report Generation", "Automation"],
    author: { name: "admin" }
  },
  {
    id: "7",
    title: "Multi-Source Intelligence: Combine Survey Data with Voter Profiles and Web Research",
    excerpt: "Go beyond traditional survey analysis. Antelope integrates your survey responses with voter profile predictions and real-time web research to provide context-rich insights. See how your data compares to broader trends and get a complete picture of your audience's perspectives.",
    content: "",
    date: "01 Nov 2024",
    readTime: "6 min",
    tags: ["Data Integration", "Market Research"],
    author: { name: "admin" }
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
  )
}
