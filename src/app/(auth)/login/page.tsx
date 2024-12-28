'use client';
import Link from "next/link";
import Image from "next/image";
import toast from "react-hot-toast";
import { useState } from "react";
import { validateUserName, validatePassword } from "@/app/utils/validation";
import { useRouter } from "next/navigation";
import { Button } from "@nextui-org/button";
import { Input } from "@nextui-org/input";

const LoginPage = () => {
    const [formData, setFormData] = useState<{ username: string; password: string }>({
        username: '',
        password: '',
    });

    const router = useRouter();

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const usernameCheck = validateUserName(formData.username);
        if (usernameCheck) {
            toast(usernameCheck,
                {
                    icon: '🤬',
                    style: {
                        borderRadius: '10px',
                        background: '#333',
                        color: '#fff',
                    },
                }
            );
            return;
        }
        const passwordCheck = validatePassword(formData.password);
        if (passwordCheck) {
            toast(passwordCheck,
                {
                    icon: '🤬',
                    style: {
                        borderRadius: '10px',
                        background: '#333',
                        color: '#fff',
                    },
                }
            );
            return;
        }

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
                router.push("/dashboard");
            } else {
                toast.error(data.message.toString());
            }
        } catch (error) {
            console.error("An error occurred:", error);
            toast.error("An unexpected error occurred.");
        }
    }

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    return (
        <div className="flex flex-col items-center justify-center h-screen">
            <Image
                src={"/assets/images/logo.svg"}
                alt="Hero Image"
                width={160}
                height={160}
                className=""
            />
            <h2 className="text-[1em] m-0 px-0 pt-0 pb-[10px] font-regular">Access Agent Account</h2>
            <form className="flex flex-col w-80 gap-3 items-center justify-center" onSubmit={handleSubmit}>
                <Input type="text" name="username" className="text-white" value={formData.username} placeholder={"Username"} onChange={handleChange} required={true} variant="bordered" classNames={{ inputWrapper: 'border-small border-default-200 rounded-sm' }} />
                <Input type="password" name="password" className="text-white" value={formData.password} placeholder={"Password"} onChange={handleChange} required={true} variant="bordered" classNames={{ inputWrapper: 'border-small border-default-200 rounded-sm' }} />
                <Button type="submit" className="bg-none p-2 rounded-sm text-xs w-full" color="primary">Login</Button>
            </form>
            <p className="my-[1em] text-white">Don&apos;t have an account? <Link href="/register" className="underline">Register</Link></p>
        </div>
    )
}

export default LoginPage;