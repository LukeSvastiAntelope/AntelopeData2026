"use client"

import Link from "next/link"
// Remove Image import as it's no longer used for logos
// import Image from "next/image"
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
import { useAgent } from "@/app/context/AgentContext"
import { MinimalThemeToggle } from "@/components/theme-toggle"
import {
  LayoutDashboard,
  BarChart3,
  LineChart,
  Users,
  LogOut,
  Info,
  Settings,
  Search,
  Shield,
  FileText,
  Brain,
  MessageCircle,
  FileBarChart
} from "lucide-react"
import LogoText from "@/components/logo-text"; // Added import
import LogoIcon from "@/components/logo-icon"; // Added import

interface SidebarProps extends React.HTMLAttributes<HTMLDivElement> {
  collapsible?: "offcanvas" | "icon" | "none";
}

export function AppSidebar({ className, collapsible = "offcanvas", ...props }: SidebarProps) {
  const pathname = usePathname()
  const { agent, user } = useAgent()

  const mainNavItems = [
    // {
    //   title: "Overview",
    //   href: "/overview",
    //   icon: LayoutDashboard
    // },
    // {
    //   title: "Markets",
    //   href: "/markets",
    //   icon: BarChart3
    // },
    // {
    //   title: "Strategy",
    //   href: "/strategy",
    //   icon: LineChart
    // },
    {
      title: "Surveys",
      href: "/surveys",
      icon: FileText
    },
    {
      title: "Digital Twins",
      href: "/digital-twins",
      icon: Brain
    },
    {
      title: "Reports",
      href: "/reports",
      icon: FileBarChart
    }
  ]

  // Conditional secondary navigation based on user role
  const secondaryNavItems = [
    {
      title: "Settings",
      href: "/profile",
      icon: Settings
    },
    ...(user?.role === "admin" ? [{
      title: "Admin",
      href: "/admin",
      icon: Shield
    }] : [])
  ]

  const footerNavItems = [
    {
      title: "About Us",
      href: "/about",
      icon: Info
    },
    {
      title: "Community",
      href: "https://t.me/+F5F2ah0bBzU0ZDAx",
      icon: Users
    },
    {
      title: "Logout",
      href: "/logout",
      icon: LogOut
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
        <div className="flex items-center px-2">
          <Link href="/surveys" className="flex items-center px-4">
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
          </Link>
        </div>
        <div className="px-4">
          <Link 
            href="/cohort-chat" 
            className="flex items-center gap-2 w-full px-4 py-2 text-sm font-medium rounded-md bg-foreground text-background border border-border hover:bg-foreground/90 transition-colors"
          >
            <MessageCircle className="h-4 w-4 group-data-[collapsible=offcanvas]:hidden text-background" />
            <span className="group-data-[collapsible=offcanvas]:hidden text-background">Chat</span>
          </Link>
        </div>
      </SidebarHeader>
      
      <SidebarContent className="flex flex-col gap-2">
        <SidebarMenu className="px-4">
          {mainNavItems.map((item) => (
            <SidebarMenuItem key={item.href}>
              <SidebarMenuButton
                asChild
                isActive={pathname === item.href || pathname.startsWith(`${item.href}/`)}
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
        
        {secondaryNavItems.length > 0 && (
          <SidebarMenu className="px-4">
            {secondaryNavItems.map((item) => (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton
                  asChild
                  isActive={pathname === item.href}
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
        )}
      </SidebarContent>
      
      <SidebarFooter className="py-4 mt-auto">
        <SidebarMenu className="px-4">
          {footerNavItems.map((item) => (
            <SidebarMenuItem key={item.href}>
              <SidebarMenuButton
                asChild
                isActive={pathname === item.href}
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
        
        {user ? (
          <div className="px-4 pt-4">
            <div className="flex items-center justify-between px-4">
              <div className="flex items-center min-w-0 flex-1">
                <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground overflow-hidden flex-shrink-0">
                  <span className="font-medium text-sm">
                    {(user.display_name || user.email)?.charAt(0)?.toUpperCase() || "U"}
                  </span>
                </div>
                <div className="ml-2 overflow-hidden group-data-[collapsible=offcanvas]:hidden min-w-0 flex-1">
                  <div className="font-medium text-sm truncate text-sidebar-foreground">
                    {user.display_name || user.email?.split('@')[0] || 'User'}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {agent ? `Balance: ${agent.wallet_balance || 0} ANML` : 'No agent'}
                  </div>
                </div>
              </div>
              <div className="flex-shrink-0 group-data-[collapsible=offcanvas]:hidden">
                <MinimalThemeToggle />
              </div>
            </div>
          </div>
        ) : (
          <div className="px-4 pt-4">
            <div className="flex items-center justify-between px-4">
              <div className="flex items-center min-w-0 flex-1">
                <div className="h-8 w-8 rounded-full bg-muted animate-pulse flex-shrink-0"></div>
                <div className="ml-2 overflow-hidden group-data-[collapsible=offcanvas]:hidden min-w-0 flex-1">
                  <div className="h-4 bg-muted rounded animate-pulse mb-1"></div>
                  <div className="h-3 bg-muted rounded animate-pulse w-3/4"></div>
                </div>
              </div>
              <div className="flex-shrink-0 group-data-[collapsible=offcanvas]:hidden">
                <MinimalThemeToggle />
              </div>
            </div>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  )
} 