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
  Users,
  LogOut,
  Info,
  Shield,
  FileText,
  Brain,
  MessageCircle,
  MessageSquare,
  FileBarChart,
  Code,
  CircleUser,
  Building2,
} from "lucide-react"
import LogoText from "@/components/logo-text"; // Added import
import LogoIcon from "@/components/logo-icon"; // Added import
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

interface SidebarProps extends React.HTMLAttributes<HTMLDivElement> {
  collapsible?: "offcanvas" | "icon" | "none";
}

export function AppSidebar({ className, collapsible = "offcanvas", ...props }: SidebarProps) {
  const pathname = usePathname()
  const { agent, user } = useAgent()

  const mainNavItems = [
    {
      title: "Surveys",
      href: "/surveys",
      icon: FileText
    },
    {
      title: "Voter Profiles",
      href: "/digital-twins",
      icon: Brain
    },
    {
      title: "Channels",
      href: "/channels",
      icon: MessageCircle
    },
    {
      title: "Reports",
      href: "/reports",
      icon: FileBarChart
    },
    {
      title: "Python Analysis",
      href: "/python-analysis",
      icon: Code
    },
    {
      title: "Team",
      href: "/team",
      icon: Building2
    }
  ]

  // Conditional secondary navigation based on user role
  const secondaryNavItems: { title: string; href: string; icon: any }[] = []

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
            href="/cohort-chat/chat" 
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
          <SidebarMenuItem>
            <div className="flex w-full items-center gap-2">
              {user ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <SidebarMenuButton className="data-[slot=sidebar-menu-button]:!p-2 flex-1 data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground">
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar className="h-8 w-8 rounded-lg">
                          <AvatarImage src={undefined} alt={user.display_name || user.email || "User"} />
                          <AvatarFallback className="rounded-lg">
                            {(user.display_name || user.email)?.charAt(0)?.toUpperCase() || "U"}
                          </AvatarFallback>
                        </Avatar>
                        <div className="grid flex-1 overflow-hidden text-left leading-tight group-data-[collapsible=offcanvas]:hidden">
                          <span className="truncate text-sm font-medium text-sidebar-foreground">
                            {user.display_name || user.email?.split('@')[0] || 'User'}
                          </span>
                          <span className="truncate text-xs text-muted-foreground">
                            {user.email}
                          </span>
                        </div>
                        {/* removed kebab icon next to name */}
                      </div>
                    </SidebarMenuButton>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-60 rounded-lg translate-x-2" align="start" alignOffset={8} sideOffset={8}>
                    <DropdownMenuLabel className="p-0 font-normal">
                      <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                        <Avatar className="h-8 w-8 rounded-lg">
                          <AvatarImage src={undefined} alt={user.display_name || user.email || "User"} />
                          <AvatarFallback className="rounded-lg">
                            {(user.display_name || user.email)?.charAt(0)?.toUpperCase() || "U"}
                          </AvatarFallback>
                        </Avatar>
                        <div className="grid flex-1 text-left leading-tight">
                          <span className="truncate text-sm font-medium">
                            {user.display_name || user.email?.split('@')[0] || 'User'}
                          </span>
                          <span className="truncate text-xs text-muted-foreground">
                            {user.email}
                          </span>
                        </div>
                      </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuGroup>
                      <DropdownMenuItem asChild>
                        <Link href="/profile" className="flex items-center gap-2">
                          <CircleUser className="size-4" />
                          Profile
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link href="/register" className="flex items-center gap-2">
                          <CircleUser className="size-4" />
                          Sign up
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link href="/channels" className="flex items-center gap-2">
                          <MessageSquare className="size-4" />
                          Channels
                        </Link>
                      </DropdownMenuItem>
                      {user?.role === "admin" && (
                        <DropdownMenuItem asChild>
                          <Link href="/admin" className="flex items-center gap-2">
                            <Shield className="size-4" />
                            Admin
                          </Link>
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuGroup>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={(e)=>e.preventDefault()} className="justify-between">
                      <span>Theme</span>
                      <MinimalThemeToggle />
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link href="/logout" className="flex items-center gap-2 text-destructive">
                        <LogOut className="size-4" />
                        Logout
                      </Link>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <SidebarMenuButton className="data-[slot=sidebar-menu-button]:!p-2 flex-1">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-8 w-8 rounded-full bg-muted animate-pulse" />
                    <div className="flex flex-1 flex-col gap-1 overflow-hidden group-data-[collapsible=offcanvas]:hidden">
                      <span className="h-4 w-24 rounded bg-muted animate-pulse" />
                      <span className="h-3 w-16 rounded bg-muted animate-pulse" />
                    </div>
                  </div>
                </SidebarMenuButton>
              )}
              {/* theme toggle moved into dropdown */}
            </div>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
} 