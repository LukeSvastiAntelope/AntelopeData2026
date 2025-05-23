"use client"

import Link from "next/link"
import Image from "next/image"
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
import {
  LayoutDashboard,
  BarChart3,
  LineChart,
  PlusCircle,
  Users,
  LogOut,
  Info,
  Settings,
  Search
} from "lucide-react"

interface SidebarProps extends React.HTMLAttributes<HTMLDivElement> {
  collapsible?: "offcanvas" | "icon" | "none";
}

export function AppSidebar({ className, collapsible = "offcanvas", ...props }: SidebarProps) {
  const pathname = usePathname()
  const { agent } = useAgent()

  const mainNavItems = [
    {
      title: "Dashboard",
      href: "/dashboard",
      icon: LayoutDashboard
    },
    {
      title: "Markets",
      href: "/markets",
      icon: BarChart3
    },
    {
      title: "Strategy",
      href: "/strategy",
      icon: LineChart
    }
  ]

  const secondaryNavItems = [
    {
      title: "Settings",
      href: "/profile",
      icon: Settings
    }
  ]

  const footerNavItems = [
    {
      title: "About Us",
      href: "/about",
      icon: Info
    },
    {
      title: "Community",
      href: "/community",
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
        <div className="flex items-center px-4">
          <Link href="/dashboard" className="flex items-center px-4">
            <Image 
              src="/assets/images/logo-text.svg"
              alt="Antelope Logo"
              width={120}
              height={30}
              className="transition-opacity group-data-[collapsible=offcanvas]:opacity-0"
            />
            <div className="hidden size-6 items-center justify-center rounded-md group-data-[collapsible=offcanvas]:flex">
              <Image 
                src="/assets/images/logo-icon.svg"
                alt="Antelope"
                width={24}
                height={24}
              />
            </div>
          </Link>
        </div>
        <div className="px-4">
          <Link 
            href="/create" 
            className="flex items-center gap-2 w-full px-4 py-2 text-sm font-medium rounded-md bg-white text-zinc-900 hover:bg-zinc-100 transition-colors"
          >
            <PlusCircle className="h-4 w-4 text-zinc-900 group-data-[collapsible=offcanvas]:hidden" />
            <span className="group-data-[collapsible=offcanvas]:hidden text-zinc-900">Create Prediction</span>
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
                  <item.icon className="h-4 w-4 text-white group-data-[collapsible=offcanvas]:hidden" />
                  <span className="text-white">{item.title}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
        
        <SidebarMenu className="px-4">
          {secondaryNavItems.map((item) => (
            <SidebarMenuItem key={item.href}>
              <SidebarMenuButton
                asChild
                isActive={pathname === item.href}
                tooltip={item.title}
              >
                <Link href={item.href} className="flex items-center gap-2 px-4 py-2 text-sidebar-foreground">
                  <item.icon className="h-4 w-4 text-white group-data-[collapsible=offcanvas]:hidden" />
                  <span className="text-white">{item.title}</span>
                </Link>
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
                isActive={pathname === item.href}
                tooltip={item.title}
              >
                <Link href={item.href} className="flex items-center gap-2 px-4 py-2 text-sidebar-foreground">
                  <item.icon className="h-4 w-4 text-white group-data-[collapsible=offcanvas]:hidden" />
                  <span className="text-white">{item.title}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
        
        {agent && (
          <div className="px-4 pt-4">
            <div className="flex items-center px-4">
              {agent && agent.image ? (
                <div className="h-8 w-8 rounded-full overflow-hidden">
                  <img src={agent.image} alt={agent.name || "Agent"} className="w-full h-full object-cover" />
                </div>
              ) : (
                <div className="h-8 w-8 rounded-full bg-blue-500 flex items-center justify-center text-white overflow-hidden">
                  <span className="font-medium">{agent?.name?.charAt(0) || "A"}</span>
                </div>
              )}
              <div className="ml-2 overflow-hidden group-data-[collapsible=offcanvas]:hidden">
                <div className="font-medium text-sm truncate text-white">{agent?.name || "Agent"}</div>
                <div className="text-xs text-zinc-400 truncate">Balance: {agent?.wallet_balance || 0} ANML</div>
              </div>
            </div>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  )
} 