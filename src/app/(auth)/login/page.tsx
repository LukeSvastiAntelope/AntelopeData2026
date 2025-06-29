'use client';

import Link from "next/link";
import { toast } from "react-hot-toast";
import { useState } from "react";
import { validateUserName, validatePassword } from "@/app/utils/validation";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

const LoginPage = () => {
    const [formData, setFormData] = useState<{ username: string; password: string }>({
        username: '',
        password: '',
    });
    const [isLoading, setIsLoading] = useState(false);
    const [isResetting, setIsResetting] = useState(false);

    const router = useRouter();

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const usernameCheck = validateUserName(formData.username);
        if (usernameCheck) {
            toast.error(usernameCheck);
            return;
        }
        const passwordCheck = validatePassword(formData.password);
        if (passwordCheck) {
            toast.error(passwordCheck);
            return;
        }

        setIsLoading(true);
        try {
            const result = await fetch("/api/signin", {
                method: "POST",
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData),
            });
            const data = await result.json();
            if (data.status) {
                toast.success(data.message);
                if (typeof window !== 'undefined') {
                    localStorage.setItem("token", data.token);
                    localStorage.setItem("userId", data.user.id);
                }
                router.push("/cohort-chat");
            } else {
                toast.error(data.message.toString());
            }
        } catch (error) {
            console.error("An error occurred:", error);
            toast.error("An unexpected error occurred.");
        } finally {
            setIsLoading(false);
        }
    }

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleForgotPassword = async () => {
        const username = formData.username;
        if (!username) {
            toast.error("Please enter your username first");
            return;
        }

        const usernameCheck = validateUserName(username);
        if (usernameCheck) {
            toast.error(usernameCheck);
            return;
        }

        setIsResetting(true);
        try {
            const result = await fetch("/api/forgotPassword", {
                method: "POST",
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username }),
            });
            const data = await result.json();
            
            if (data.status) {
                toast.success("Password reset instructions sent to your telegram");
            } else {
                toast.error(data.message);
            }
        } catch (error) {
            console.error("An error occurred:", error);
            toast.error("An unexpected error occurred");
        } finally {
            setIsResetting(false);
        }
    };

    return (
        <div className="container relative min-h-screen flex-col items-center justify-center grid lg:max-w-none lg:grid-cols-1 lg:px-0">
            <div className="flex flex-col items-center space-y-6">
                <img 
                    src="/assets/images/logo.svg"
                    alt="Logo"
                    width={120}
                    height={120}
                    className="mb-2 brightness-0 dark:brightness-0 dark:invert"
                />
                
                <Card className="w-[350px] bg-background/60 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                    <CardHeader className="space-y-1">
                        <CardTitle className="text-2xl text-center">Welcome back</CardTitle>
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
            </div>
        </div>
    );
}

export default LoginPage;