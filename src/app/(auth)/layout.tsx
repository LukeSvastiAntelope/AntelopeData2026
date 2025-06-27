'use client';
import { useRouter, usePathname } from "next/navigation";
import { useEffect } from "react";

const AuthLayout = ({ children }: { children: React.ReactNode }) => {
    const route = useRouter();
    const pathname = usePathname();
    
    useEffect(() => {
        // Only redirect to dashboard if we're on an auth page and have a token
        if (typeof window !== 'undefined' && 
            localStorage.getItem("token") && 
            (pathname === '/login' || pathname === '/register')) {
            route.push("/overview");
        }
    }, [route, pathname]);

    return (
        <div className="flex flex-col items-center justify-center w-screen h-screen bg-cover bg-center bg-no-repeat m-0">
            {children}
        </div>
    )
}

export default AuthLayout;