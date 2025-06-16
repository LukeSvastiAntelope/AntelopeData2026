'use client';

import { usePathname } from 'next/navigation';
import { PreviewAppSidebar } from '@/components/preview-app-sidebar';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';

export function LoginPreviewLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  
  return (
    <SidebarProvider defaultOpen={true}>
      <div className="flex min-h-screen w-full">
        <PreviewAppSidebar />
        
        <div className="flex flex-col flex-1">
          {/* Main Content */}
          <SidebarInset>
            {children}
          </SidebarInset>
        </div>
      </div>
    </SidebarProvider>
  );
} 