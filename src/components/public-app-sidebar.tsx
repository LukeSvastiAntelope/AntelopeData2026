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
import {
  LayoutDashboard,
  BarChart3,
  LineChart,
  Info,
  Users,
  LogIn,
  UserPlus
} from "lucide-react"
import { Button } from "@/components/ui/button"

interface SidebarProps extends React.HTMLAttributes<HTMLDivElement> {
  collapsible?: "offcanvas" | "icon" | "none";
}

export function PublicAppSidebar({ className, collapsible = "offcanvas", ...props }: SidebarProps) {
  const pathname = usePathname()

  const mainNavItems = [
    {
      title: "Overview",
      href: "/",
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
          <Link href="/" className="flex items-center px-4">
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

        <div className="px-8 pt-4 flex flex-col gap-2">
          <Button 
            asChild
            className="w-full bg-blue-600 hover:bg-blue-700"
          >
            <Link href="/login" className="flex items-center gap-2">
              <LogIn className="h-4 w-4" />
              <span>Login</span>
            </Link>
          </Button>
          <Button 
            asChild
            variant="outline"
            className="w-full border-zinc-700 hover:bg-zinc-800"
          >
            <Link href="/register" className="flex items-center gap-2">
              <UserPlus className="h-4 w-4" />
              <span>Register</span>
            </Link>
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
} 