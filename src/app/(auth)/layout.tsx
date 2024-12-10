'use client';
import { useRouter } from "next/navigation";

const AuthLayout = ({ children }: { children: React.ReactNode }) => {
    const route = useRouter();
    if (typeof window !== 'undefined' && localStorage.getItem("token")) {
        route.push("/profile");
    }

    return (
        <div className="flex flex-col items-center justify-center w-screen h-screen bg-cover bg-center bg-no-repeat m-0">
            {children}
        </div>
    )
}

export default AuthLayout;