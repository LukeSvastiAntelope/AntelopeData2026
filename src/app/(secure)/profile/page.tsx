"use client";
import { useTheme } from "next-themes";

const ProfilePage = () => {
    const { theme } = useTheme();
    return <div>Profile: {theme}</div>
}

export default ProfilePage;