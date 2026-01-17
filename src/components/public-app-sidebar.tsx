"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import LogoText from "@/components/logo-text"
import LogoIcon from "@/components/logo-icon"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/ui/sidebar"
import {
  FileText as FileTextIcon,
  Brain as BrainIcon,
  MessageCircle as MessageCircleIcon,
  Info as InfoIcon,
  Users as UsersIcon,
  LogIn as LogInIcon,
  UserPlus as UserPlusIcon,
  FileBarChart as FileBarChartIcon,
  Settings as SettingsIcon,
  BookOpen as BookOpenIcon,
  Mail as MailIcon,
  DollarSign as DollarSignIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"

interface SidebarProps extends React.HTMLAttributes<HTMLDivElement> {
  collapsible?: "offcanvas" | "icon" | "none";
}

export function PublicAppSidebar({ className, collapsible = "offcanvas", ...props }: SidebarProps) {
  const pathname = usePathname()

  // Platform section - only show when logged in (not shown in public sidebar)
  const platformNavItems = [
    {
      title: "Surveys",
      href: "/login",
      icon: FileTextIcon,
      key: "surveys"
    },
    {
      title: "Digital Twins",
      href: "/login",
      icon: BrainIcon,
      key: "digital-twins"
    },
    {
      title: "Channels",
      href: "/login",
      icon: MessageCircleIcon,
      key: "channels"
    },
    {
      title: "Reports",
      href: "/login",
      icon: FileBarChartIcon,
      key: "reports"
    },
    {
      title: "Python Analysis",
      href: "/login",
      icon: FileTextIcon,
      key: "python-analysis"
    }
  ]

  // Workspace section - only show when logged in (not shown in public sidebar)
  const workspaceNavItems = [
    {
      title: "Settings",
      href: "/login",
      icon: SettingsIcon,
      key: "settings"
    }
  ]

  // Resources section - accessible both logged in and logged out
  const resourceNavItems = [
    {
      title: "Pricing",
      href: "/pricing",
      icon: DollarSignIcon
    },
    {
      title: "Blog",
      href: "/blog",
      icon: BookOpenIcon
    },
    {
      title: "Our Clients",
      href: "/clients",
      icon: UsersIcon
    },
    {
      title: "About Us",
      href: "/about",
      icon: InfoIcon
    },
    {
      title: "Contact Us",
      href: "/contact",
      icon: MailIcon
    },
    {
      title: "Community",
      href: "https://t.me/+F5F2ah0bBzU0ZDAx",
      icon: UsersIcon
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
          <Link href="/" className="flex items-center px-4">
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
            href="/login" 
            className="flex items-center gap-2 w-full px-4 py-2 text-sm font-medium rounded-md bg-foreground text-background border border-border hover:bg-foreground/90 transition-colors"
          >
            <MessageCircleIcon className="h-4 w-4 group-data-[collapsible=offcanvas]:hidden text-background" />
            <span className="group-data-[collapsible=offcanvas]:hidden text-background">DataChat(™)</span>
          </Link>
        </div>
      </SidebarHeader>
      
      <SidebarContent className="flex flex-col gap-4">
        {/* Platform Section - Hidden in public sidebar, only shown when logged in */}
        <SidebarGroup className="px-4">
          <SidebarGroupLabel className="text-muted-foreground">Platform</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {platformNavItems.map((item) => (
                <SidebarMenuItem key={item.key || item.href}>
                  <SidebarMenuButton
                    asChild
                    tooltip={item.title}
                    className="opacity-50 cursor-not-allowed"
                  >
                    <Link href={item.href} className="flex items-center gap-2 px-4 py-2 text-sidebar-foreground">
                      <item.icon className="h-4 w-4 text-sidebar-foreground group-data-[collapsible=offcanvas]:hidden" />
                      <span className="text-sidebar-foreground">{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Workspace Section - Hidden in public sidebar, only shown when logged in */}
        <SidebarGroup className="px-4">
          <SidebarGroupLabel className="text-muted-foreground">Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {workspaceNavItems.map((item) => (
                <SidebarMenuItem key={item.key || item.href}>
                  <SidebarMenuButton
                    asChild
                    tooltip={item.title}
                    className="opacity-50 cursor-not-allowed"
                  >
                    <Link href={item.href} className="flex items-center gap-2 px-4 py-2 text-sidebar-foreground">
                      <item.icon className="h-4 w-4 text-sidebar-foreground group-data-[collapsible=offcanvas]:hidden" />
                      <span className="text-sidebar-foreground">{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Resources Section - Accessible to everyone */}
        <SidebarGroup className="px-4">
          <SidebarGroupLabel>Resources</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {resourceNavItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === item.href}
                    tooltip={item.title}
                  >
                    <Link href={item.href} className="flex items-center gap-2 px-4 py-2 text-sidebar-foreground">
                      <item.icon className="h-4 w-4 text-sidebar-foreground group-data-[collapsible=offcanvas]:hidden" />
                      <span className="text-sidebar-foreground">{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      
      <SidebarFooter className="py-4 mt-auto">
        <SidebarSeparator className="mx-8" />
        <div className="px-8 pt-4 flex flex-col gap-2">
          <Button 
            asChild
            className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Link href="/login" className="flex items-center gap-2">
              <LogInIcon className="h-4 w-4" />
              <span className="text-primary-foreground">Login</span>
            </Link>
          </Button>
          <Button 
            asChild
            variant="outline"
            className="w-full border-border hover:bg-accent"
          >
            <Link href="/register" className="flex items-center gap-2">
              <UserPlusIcon className="h-4 w-4" />
              <span>Register</span>
            </Link>
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
} 