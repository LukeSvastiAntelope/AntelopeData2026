'use client';

import { usePathname } from 'next/navigation';
import { PublicAppSidebar } from '@/components/public-app-sidebar';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';

export function PublicLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  
  return (
    <SidebarProvider defaultOpen={false}>
      <div className="flex min-h-screen w-full">
        <PublicAppSidebar />
        
        <div className="flex flex-col flex-1 min-w-0">
          {/* Main Content */}
          <SidebarInset className="min-w-0">
            {children}
          </SidebarInset>
        </div>
      </div>
    </SidebarProvider>
  );
} 