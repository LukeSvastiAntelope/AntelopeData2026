'use client'

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAgent } from "@/app/context/AgentContext";

const AdminLayout = ({ children }: { children: React.ReactNode }) => {

    const { user } = useAgent();
    const router = useRouter();

    useEffect(() => {
        if (!user || user.role !== 'admin') {
            router.push('/');
        }
    }, [user])
    return (
        <div>
            {children}
        </div>
    )
}

export default AdminLayout;