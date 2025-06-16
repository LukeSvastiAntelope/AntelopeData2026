import { Button } from "@/components/ui/button"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Loader2 } from "lucide-react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useState } from "react"
import { toast } from "react-hot-toast"
import { validateUserName, validatePassword } from "@/app/utils/validation"

export default function FrontLanding() {
  const router = useRouter()
  const [formData, setFormData] = useState<{ username: string; password: string }>({
    username: '',
    password: '',
  })
  const [isLoading, setIsLoading] = useState(false)
  const [isResetting, setIsResetting] = useState(false)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const usernameCheck = validateUserName(formData.username)
    if (usernameCheck) {
      toast.error(usernameCheck)
      return
    }
    const passwordCheck = validatePassword(formData.password)
    if (passwordCheck) {
      toast.error(passwordCheck)
      return
    }

    setIsLoading(true)
    try {
      const result = await fetch("/api/signin", {
        method: "POST",
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })
      const data = await result.json()
      if (data.status) {
        toast.success(data.message)
        if (typeof window !== 'undefined') {
          localStorage.setItem("token", data.token)
          localStorage.setItem("userId", data.user.id)
        }
        router.push("/surveys")
      } else {
        toast.error(data.message.toString())
      }
    } catch (error) {
      console.error("An error occurred:", error)
      toast.error("An unexpected error occurred.")
    } finally {
      setIsLoading(false)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value })
  }

  const handleForgotPassword = async () => {
    const username = formData.username
    if (!username) {
      toast.error("Please enter your username first")
      return
    }

    const usernameCheck = validateUserName(username)
    if (usernameCheck) {
      toast.error(usernameCheck)
      return
    }

    setIsResetting(true)
    try {
      const result = await fetch("/api/forgotPassword", {
        method: "POST",
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      })
      const data = await result.json()
      
      if (data.status) {
        toast.success("Password reset instructions sent to your telegram")
      } else {
        toast.error(data.message)
      }
    } catch (error) {
      console.error("An error occurred:", error)
      toast.error("An unexpected error occurred")
    } finally {
      setIsResetting(false)
    }
  }

  return (
    <div className="flex-1 p-2 w-full bg-background">
      <div className="mx-auto rounded-lg bg-card text-card-foreground shadow-lg">
        {/* Header */}
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <SidebarTrigger className="-ml-0.5 h-5 w-5 text-muted-foreground hover:text-foreground" />
              <div className="h-4 border-l border-border mx-4" />
              <h1 className="text-base font-medium text-card-foreground">Antelope AI</h1>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="p-6">
          <div className="flex flex-col items-center justify-center min-h-[600px] space-y-8">
            {/* Welcome Message */}
            <div className="text-center space-y-4 max-w-md">
              <h2 className="text-3xl font-bold text-card-foreground">
                Welcome to Antelope AI
              </h2>
              <p className="text-muted-foreground">
                Sign in to access your dashboard, create surveys, and explore your Digital Twins.
              </p>
            </div>

            {/* Login Card */}
            <Card className="w-[400px] bg-background/60 backdrop-blur supports-[backdrop-filter]:bg-background/60">
              <CardHeader className="space-y-1">
                <CardTitle className="text-2xl text-center">Sign In</CardTitle>
                <CardDescription className="text-center">
                  Enter your credentials to access your account
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Input
                      id="username"
                      name="username"
                      type="text"
                      placeholder="Username"
                      value={formData.username}
                      onChange={handleChange}
                      required
                      className="bg-background"
                      disabled={isLoading}
                    />
                  </div>
                  <div className="space-y-2">
                    <Input
                      id="password"
                      name="password"
                      type="password"
                      placeholder="Password"
                      value={formData.password}
                      onChange={handleChange}
                      required
                      className="bg-background"
                      disabled={isLoading}
                    />
                  </div>
                  <Button 
                    className="w-full" 
                    type="submit"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Signing in...
                      </>
                    ) : (
                      "Sign In"
                    )}
                  </Button>
                </form>
              </CardContent>
              <CardFooter className="flex flex-col space-y-4">
                <Button 
                  variant="ghost" 
                  className="w-full text-sm"
                  onClick={handleForgotPassword}
                  disabled={isResetting}
                >
                  {isResetting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Resetting...
                    </>
                  ) : (
                    "Forgot password?"
                  )}
                </Button>
                <div className="text-sm text-muted-foreground text-center">
                  Don&apos;t have an account?{" "}
                  <Link 
                    href="/register" 
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    Sign up
                  </Link>
                </div>
              </CardFooter>
            </Card>

            {/* Preview Features */}
            <div className="text-center space-y-4 max-w-2xl">
              <p className="text-sm text-muted-foreground">
                After signing in, you&apos;ll have access to:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                <div className="p-3 rounded-lg bg-muted/20">
                  <div className="font-medium">Dashboard</div>
                  <div className="text-muted-foreground">View your surveys and analytics</div>
                </div>
                <div className="p-3 rounded-lg bg-muted/20">
                  <div className="font-medium">Digital Twins</div>
                  <div className="text-muted-foreground">Explore AI-powered insights</div>
                </div>
                <div className="p-3 rounded-lg bg-muted/20">
                  <div className="font-medium">Chat</div>
                  <div className="text-muted-foreground">Interact with your cohorts</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
} 