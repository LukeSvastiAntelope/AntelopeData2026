'use client';

import Link from "next/link";
import { toast } from "@/components/ui/sonner";
import { useState } from "react";
import { validateEmail, validatePassword, validateDisplayName } from "@/app/utils/validation";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

const RegisterPage = () => {
    const [formData, setFormData] = useState<{ email: string; displayName: string; password: string }>({
        email: '',
        displayName: '',
        password: '',
    });
    const [isLoading, setIsLoading] = useState(false);

    const router = useRouter();

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const emailCheck = validateEmail(formData.email);
        if (emailCheck) {
            toast.error(emailCheck);
            return;
        }
        const displayNameCheck = validateDisplayName(formData.displayName);
        if (displayNameCheck) {
            toast.error(displayNameCheck);
            return;
        }
        const passwordCheck = validatePassword(formData.password);
        if (passwordCheck) {
            toast.error(passwordCheck);
            return;
        }

        setIsLoading(true);
        try {
            const result = await fetch("/api/signup", {
                method: "POST",
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData),
            });
            const data = await result.json();
            if (data.status) {
                toast.success(data.message);
                if (data.autoLoggedIn) {
                    // User was automatically logged in, redirect to main app
                    router.push("/cohort-chat");
                } else {
                    // User needs to login manually
                    router.push("/login");
                }
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
                        <CardTitle className="text-2xl text-center">Create an account</CardTitle>
                        <CardDescription className="text-center">
                            Enter your details to get started
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="space-y-2">
                                <Input
                                    id="email"
                                    name="email"
                                    type="email"
                                    placeholder="Email"
                                    value={formData.email}
                                    onChange={handleChange}
                                    required
                                    className="bg-background"
                                    disabled={isLoading}
                                />
                            </div>
                            <div className="space-y-2">
                                <Input
                                    id="displayName"
                                    name="displayName"
                                    type="text"
                                    placeholder="Display Name"
                                    value={formData.displayName}
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
                                        Creating account...
                                    </>
                                ) : (
                                    "Create Account"
                                )}
                            </Button>
                        </form>
                    </CardContent>
                    <CardFooter>
                        <div className="text-sm text-muted-foreground text-center w-full">
                            Already have an account?{" "}
                            <Link 
                                href="/login" 
                                className="text-primary underline-offset-4 hover:underline"
                            >
                                Sign in
                            </Link>
                        </div>
                    </CardFooter>
                </Card>
            </div>
        </div>
    );
}

export default RegisterPage;