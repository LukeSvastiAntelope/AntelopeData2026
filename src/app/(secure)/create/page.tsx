'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { SidebarTrigger } from "@/components/ui/sidebar"
import Link from "next/link"
import { 
  ArrowRight,
  Lightbulb,
  Target,
  BarChart3,
  Users,
  MessageCircle
} from "lucide-react"

const CreatePage = () => {
  const predictionTypes = [
    {
      title: "AI Survey Builder",
      description: "Use AI to generate surveys from a simple description",
      icon: Lightbulb,
      href: "/create/survey/ai",
      color: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
      examples: ["Describe your survey needs", "AI creates questions", "Edit and refine results"]
    },
    {
      title: "Manual Survey",
      description: "Create surveys that turn respondents into digital twin agents",
      icon: Users,
      href: "/create/survey",
      color: "bg-pink-500/10 text-pink-600 dark:text-pink-400",
      examples: ["Market research surveys", "Opinion polls", "Customer feedback forms"]
    },
    {
      title: "Quiz Survey",
      description: "Build quizzes with right/wrong answers and configurable reveal behavior",
      icon: Users,
      href: "/create/survey/quiz",
      color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
      examples: ["Knowledge checks", "Onboarding assessments", "Training certification"]
    },
    {
      title: "Qualitative Survey",
      description: "Chat-style interviews that adapt questions to explore a topic in depth",
      icon: MessageCircle,
      href: "/create/survey/qualitative",
      color: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
      examples: ["User research interviews", "Exploratory discovery", "Open-ended insights"]
    }
  ]

  return (
    <div className="flex-1 p-2 w-full bg-background">
      <div className="mx-auto rounded-lg bg-card text-card-foreground shadow-lg">
        {/* Header */}
        <div className="px-6 py-4">
          <div className="flex items-center">
            <SidebarTrigger className="-ml-0.5 h-5 w-5 text-muted-foreground hover:text-foreground" />
            <div className="h-4 border-l border-border mx-4" />
            <h1 className="text-base font-medium text-card-foreground">Create Survey</h1>
          </div>
        </div>
        
        <div className="border-b border-border" />

        <div className="p-6">
          {/* Introduction Section */}
          <div className="mb-6">
            <h2 className="text-3xl font-bold mb-2">Choose Survey Type</h2>
            <p className="text-muted-foreground text-base max-w-3xl">
              Create surveys to build digital twin agents from real responses. Choose AI-powered generation or manual creation.
            </p>
          </div>

          {/* Survey Type Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            {predictionTypes.map((type) => (
              <Card key={type.href} className="group hover:shadow-lg transition-all duration-200 border-2 hover:border-primary/20">
                <CardHeader className="pb-4">
                  <div className="flex items-start justify-between">
                    <div className={`p-3 rounded-lg ${type.color} mb-3`}>
                      <type.icon className="h-6 w-6" />
                    </div>
                    <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>
                  <CardTitle className="text-xl">{type.title}</CardTitle>
                  <CardDescription className="text-base">
                    {type.description}
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="mb-4">
                    <h4 className="text-sm font-medium text-muted-foreground mb-2">Examples:</h4>
                    <ul className="text-sm space-y-1">
                      {type.examples.map((example, index) => (
                        <li key={index} className="flex items-start gap-2">
                          <Target className="h-3 w-3 text-muted-foreground mt-0.5 flex-shrink-0" />
                          <span className="text-muted-foreground">{example}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <Button asChild className="w-full group-hover:bg-primary group-hover:text-primary-foreground">
                    <Link href={type.href} className="flex items-center justify-center gap-2">
                      Create {type.title}
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Help Section */}
          <div className="bg-muted/50 rounded-lg p-6 text-center">
            <div className="flex items-center justify-center mb-3">
              <BarChart3 className="h-6 w-6 text-primary mr-2" />
              <h3 className="text-lg font-semibold">Need Help Choosing?</h3>
            </div>
            <p className="text-muted-foreground mb-4">
              Use <strong>AI Survey Builder</strong> for quick generation from descriptions, or <strong>Manual Survey</strong> for complete control over questions and structure.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link href="/surveys">View Surveys</Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link href="/about">Learn More</Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link href="/dashboard">View Dashboard</Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default CreatePage 