'use client';
import { useRouter } from "next/navigation";

const SecureLayout = ({ children }: { children: React.ReactNode }) => {
    const route = useRouter();
    if (typeof window !== 'undefined' && !localStorage.getItem("token")) {
        route.push("/login");
    }

    return (
        <div className=' min-h-screen flex flex-col items-center justify-start'>
            {children}
        </div>
    )
}

export default SecureLayout;