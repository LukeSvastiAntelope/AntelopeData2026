'use client'

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useFetch } from "@/app/utils/lib";

const AdminLayout = ({ children }: { children: React.ReactNode }) => {

    const fetch = useFetch();
    const router = useRouter();

    useEffect(() => {
        const getAgentProfile = async () => {
            const response = await fetch.get('/api/getAgentProfile');
            const user = response.user;
            if (user.role !== 'admin') {
                router.push('/');
            }
        }
        getAgentProfile();
    }, [])
    return (
        <div>
            {children}
        </div>
    )
}

export default AdminLayout;