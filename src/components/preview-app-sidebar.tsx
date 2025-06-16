"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { 
  Sidebar, 
  SidebarContent, 
  SidebarFooter, 
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton
} from "@/components/ui/sidebar"
import {
  LayoutDashboard,
  PlusCircle,
  Users,
  Info,
  Settings,
  Brain,
  MessageCircle,
  Lock
} from "lucide-react"
import LogoText from "@/components/logo-text"
import LogoIcon from "@/components/logo-icon"

interface SidebarProps extends React.HTMLAttributes<HTMLDivElement> {
  collapsible?: "offcanvas" | "icon" | "none";
}

export function PreviewAppSidebar({ className, collapsible = "offcanvas", ...props }: SidebarProps) {
  const pathname = usePathname()

  const mainNavItems = [
    {
      title: "Dashboard",
      href: "#",
      icon: LayoutDashboard
    },
    {
      title: "Chat",
      href: "#",
      icon: MessageCircle
    },
    {
      title: "Digital Twins",
      href: "#",
      icon: Brain
    }
  ]

  const secondaryNavItems = [
    {
      title: "Settings",
      href: "#",
      icon: Settings
    }
  ]

  const footerNavItems = [
    {
      title: "About Us",
      href: "#",
      icon: Info
    },
    {
      title: "Community",
      href: "#",
      icon: Users
    }
  ]

  return (
    <Sidebar 
      className={className} 
      collapsible={collapsible} 
      variant="sidebar"
      {...props}
    >
      <SidebarHeader className="flex flex-col gap-4 pb-4">
        <div className="flex items-center px-4">
          <div className="flex items-center px-4">
            <LogoText 
              className="text-zinc-900 dark:text-zinc-100 transition-opacity group-data-[collapsible=offcanvas]:opacity-0"
              width={120} 
              height={30} 
            />
            <div className="hidden size-6 items-center justify-center rounded-md group-data-[collapsible=offcanvas]:flex">
              <LogoIcon 
                className="text-zinc-900 dark:text-zinc-100"
                width={24} 
                height={24} 
              />
            </div>
          </div>
        </div>
        <div className="px-4">
          <div className="flex items-center gap-2 w-full px-4 py-2 text-sm font-medium rounded-md bg-muted text-muted-foreground border border-border cursor-not-allowed">
            <PlusCircle className="h-4 w-4 group-data-[collapsible=offcanvas]:hidden" />
            <span className="group-data-[collapsible=offcanvas]:hidden">Create Survey</span>
            <Lock className="h-3 w-3 ml-auto" />
          </div>
        </div>
      </SidebarHeader>
      
      <SidebarContent className="flex flex-col gap-2">
        <SidebarMenu className="px-4">
          {mainNavItems.map((item) => (
            <SidebarMenuItem key={item.href}>
              <SidebarMenuButton
                disabled
                tooltip={`${item.title} (Login Required)`}
              >
                <div className="flex items-center gap-2 px-4 py-2 text-muted-foreground cursor-not-allowed">
                  <item.icon className="h-4 w-4 group-data-[collapsible=offcanvas]:hidden" />
                  <span>{item.title}</span>
                  <Lock className="h-3 w-3 ml-auto" />
                </div>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
        
        <SidebarMenu className="px-4">
          {secondaryNavItems.map((item) => (
            <SidebarMenuItem key={item.href}>
              <SidebarMenuButton
                disabled
                tooltip={`${item.title} (Login Required)`}
              >
                <div className="flex items-center gap-2 px-4 py-2 text-muted-foreground cursor-not-allowed">
                  <item.icon className="h-4 w-4 group-data-[collapsible=offcanvas]:hidden" />
                  <span>{item.title}</span>
                  <Lock className="h-3 w-3 ml-auto" />
                </div>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarContent>
      
      <SidebarFooter className="py-4 mt-auto">
        <SidebarMenu className="px-4">
          {footerNavItems.map((item) => (
            <SidebarMenuItem key={item.href}>
              <SidebarMenuButton
                asChild
                tooltip={item.title}
              >
                <Link href={item.href} className="flex items-center gap-2 px-4 py-2 text-sidebar-foreground">
                  <item.icon className="h-4 w-4 group-data-[collapsible=offcanvas]:hidden" />
                  <span>{item.title}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
        
        <div className="px-4 pt-4">
          <div className="flex items-center justify-between px-4">
            <div className="flex items-center min-w-0 flex-1">
              <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-muted-foreground overflow-hidden flex-shrink-0">
                <Lock className="h-4 w-4" />
              </div>
              <div className="ml-2 overflow-hidden group-data-[collapsible=offcanvas]:hidden min-w-0 flex-1">
                <div className="font-medium text-sm truncate text-muted-foreground">Login Required</div>
                <div className="text-xs text-muted-foreground truncate">Sign in to access features</div>
              </div>
            </div>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
} 