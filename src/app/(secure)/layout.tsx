'use client';
import { AgentProvider } from "../context/AgentContext";
import { useAgent } from "../context/AgentContext";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

const SecureLayout = ({ children }: { children: React.ReactNode }) => {
    return (
        <SidebarProvider defaultOpen={true}>
            <div className="flex min-h-screen w-full bg-background">
                <AppSidebar />
                
                <div className="flex flex-col flex-1 min-w-0">
                    <SidebarInset className="bg-background">
                        {children}
                    </SidebarInset>
                </div>
            </div>
        </SidebarProvider>
    );
}

export default function SecureLayoutWrapper({ children }: { children: React.ReactNode }) {
    return (
        <AgentProvider>
            <SecureLayoutContent>
                {children}
            </SecureLayoutContent>
        </AgentProvider>
    );
}

function SecureLayoutContent({ children }: { children: React.ReactNode }) {
    const { user, isAgentProfileLoading } = useAgent();
    
    if (isAgentProfileLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-background">
                <div className="flex flex-col items-center space-y-4">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                    <p className="text-sm text-muted-foreground">Setting up your workspace...</p>
                </div>
            </div>
        );
    }

    if (!user) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-background">
                <div className="flex flex-col items-center space-y-4 max-w-md px-6 text-center">
                    <p className="text-sm text-muted-foreground">
                        We couldn&apos;t load your profile. This is usually a temporary server or database issue.
                    </p>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm"
                            onClick={() => window.location.reload()}
                        >
                            Reload
                        </button>
                        <a
                            className="px-4 py-2 rounded-md border border-input text-sm"
                            href="/logout"
                        >
                            Log out
                        </a>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        If this persists, check the Network tab for <code>/api/getAgentProfile</code> failing or timing out.
                    </p>
                </div>
            </div>
        );
    }
    
    return <SecureLayout>{children}</SecureLayout>;
}
