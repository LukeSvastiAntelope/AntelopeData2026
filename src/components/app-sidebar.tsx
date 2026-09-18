'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { usePathname } from 'next/navigation'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarSeparator,
} from '@/components/ui/sidebar'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { useAgent } from '@/app/context/AgentContext'
import { MinimalThemeToggle } from '@/components/theme-toggle'
import {
  Users,
  LogOut,
  Info,
  Shield,
  LayoutDashboard,
  FileText,
  Brain,
  MessageCircle,
  MessageSquare,
  FileBarChart,
  Code,
  CircleUser,
  Building2,
  FileUp,
  HandCoins,
  ClipboardList,
  Scale,
  BookOpen,
  Mail,
  DollarSign,
  Settings,
  ScrollText,
  ShieldCheck,
  Bot,
  ChevronDown,
  Megaphone,
  Send,
  Check,
  ArrowRight,
  Clapperboard,
} from 'lucide-react'
import LogoText from '@/components/logo-text'
import LogoIcon from '@/components/logo-icon'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { PartyIcon, partyColor } from '@/components/party-icons'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

type NavItem = {
  title: string
  href: string
  icon: React.ComponentType<{ className?: string }>
}

type WorkflowStage = {
  id: 'plan' | 'know' | 'ask' | 'spread' | 'understand' | 'act'
  number: number
  title: string
  items: NavItem[]
}

const WORKFLOW_STAGES: WorkflowStage[] = [
  {
    id: 'plan',
    number: 1,
    title: 'Plan',
    items: [
      { title: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
      { title: 'Campaign Consultant', href: '/agents/campaign-consultant', icon: Bot },
    ],
  },
  {
    id: 'know',
    number: 2,
    title: 'Know',
    items: [
      { title: 'Voter Files', href: '/voter-file', icon: FileUp },
      { title: 'Voter Profiles', href: '/digital-twins', icon: Brain },
    ],
  },
  {
    id: 'ask',
    number: 3,
    title: 'Ask',
    items: [{ title: 'Surveys', href: '/surveys', icon: FileText }],
  },
  {
    id: 'spread',
    number: 4,
    title: 'Spread',
    items: [
      { title: 'Distribution', href: '/spread', icon: Megaphone },
      { title: 'Video', href: '/spread/video', icon: Clapperboard },
    ],
  },
  {
    id: 'understand',
    number: 5,
    title: 'Understand',
    items: [
      { title: 'Reports', href: '/reports', icon: FileBarChart },
      { title: 'Python Analysis', href: '/python-analysis', icon: Code },
    ],
  },
  {
    id: 'act',
    number: 6,
    title: 'Act',
    items: [
      { title: 'Fundraising', href: '/fundraising', icon: HandCoins },
      { title: 'Outbound', href: '/outbound', icon: Send },
    ],
  },
]

const ACCOUNT_ITEMS: NavItem[] = [
  { title: 'Volunteer/Staff', href: '/volunteer-staff', icon: ClipboardList },
  { title: 'Compliance', href: '/compliance', icon: Scale },
  { title: 'Team', href: '/team', icon: Building2 },
  { title: 'Settings', href: '/settings', icon: Settings },
  { title: 'Pricing', href: '/pricing', icon: DollarSign },
]

const RESOURCE_ITEMS: NavItem[] = [
  { title: 'Blog', href: '/blog', icon: BookOpen },
  { title: 'Our Clients', href: '/clients', icon: Users },
  { title: 'About Us', href: '/about', icon: Info },
  { title: 'Contact Us', href: '/contact', icon: Mail },
  { title: 'Community', href: 'https://t.me/+F5F2ah0bBzU0ZDAx', icon: Users },
]

const LEGAL_ITEMS: NavItem[] = [
  { title: 'Terms & Conditions', href: '/companypolicy/termsandconditions', icon: ScrollText },
  { title: 'Privacy Policy', href: '/companypolicy/privacypolicy', icon: ShieldCheck },
]

interface SidebarProps extends React.HTMLAttributes<HTMLDivElement> {
  collapsible?: 'offcanvas' | 'icon' | 'none'
}

function pathMatches(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function AppSidebar({ className, collapsible = 'offcanvas', ...props }: SidebarProps) {
  const pathname = usePathname()
  const { user, organization } = useAgent()
  const [recommendedNext, setRecommendedNext] = useState<WorkflowStage['id']>('plan')
  const [completedStages, setCompletedStages] = useState<WorkflowStage['id'][]>([])
  const [openStages, setOpenStages] = useState<Record<string, boolean>>({})

  useEffect(() => {
    let cancelled = false
    fetch('/api/workflow/progress')
      .then((r) => r.json())
      .then((data) => {
        if (cancelled || !data?.status || !data.progress) return
        const next = (data.progress.recommendedNext || 'plan') as WorkflowStage['id']
        const completed = (data.progress.completedStages || []) as WorkflowStage['id'][]
        setRecommendedNext(next)
        setCompletedStages(completed)
      })
      .catch(() => {
        // Non-blocking — sidebar always remains usable
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    // Auto-open the stage that contains the current route, plus the recommended next stage
    const nextOpen: Record<string, boolean> = {}
    for (const stage of WORKFLOW_STAGES) {
      const onStage = stage.items.some((item) => pathMatches(pathname, item.href))
      nextOpen[stage.id] = onStage || stage.id === recommendedNext
    }
    setOpenStages((prev) => ({ ...prev, ...nextOpen }))
  }, [pathname, recommendedNext])

  const recommendedStage = useMemo(
    () => WORKFLOW_STAGES.find((s) => s.id === recommendedNext) || WORKFLOW_STAGES[0],
    [recommendedNext]
  )

  const activeStage = useMemo(() => {
    return (
      WORKFLOW_STAGES.find((stage) =>
        stage.items.some((item) => pathMatches(pathname, item.href))
      ) || recommendedStage
    )
  }, [pathname, recommendedStage])

  return (
    <Sidebar className={className} collapsible={collapsible} variant="sidebar" {...props}>
      <SidebarHeader className="flex flex-col gap-4 pb-4">
        <div className="flex items-center px-2">
          <Link href="/dashboard" className="flex items-center px-4">
            <LogoText
              className="text-zinc-900 dark:text-zinc-100 transition-opacity group-data-[collapsible=offcanvas]:opacity-0"
              width={120}
              height={30}
            />
            <div className="hidden size-6 items-center justify-center rounded-md group-data-[collapsible=offcanvas]:flex">
              <LogoIcon className="text-zinc-900 dark:text-zinc-100" width={24} height={24} />
            </div>
          </Link>
        </div>
        <div className="px-4">
          <Link
            href="/cohort-chat/chat"
            onClick={() => {
              if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('antelope:analytics-home'))
              }
            }}
            className="flex items-center gap-2 w-full px-4 py-2 text-sm font-medium rounded-md bg-foreground text-background border border-border hover:bg-foreground/90 transition-colors"
          >
            <MessageCircle className="h-4 w-4 group-data-[collapsible=offcanvas]:hidden text-background" />
            <span className="group-data-[collapsible=offcanvas]:hidden text-background">Analytics</span>
          </Link>
        </div>
      </SidebarHeader>

      <SidebarContent className="flex flex-col gap-4">
        {/* Progress nudge — recommendation only, never a gate */}
        <div className="px-4 group-data-[collapsible=offcanvas]:hidden">
          <div className="rounded-md border border-border/70 bg-muted/30 px-3 py-2.5 space-y-1">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Campaign flow</p>
            <p className="text-xs text-sidebar-foreground flex items-center gap-1.5 flex-wrap">
              <span className="font-medium">You are here: {activeStage.title}</span>
              <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground">Next: {recommendedStage.title}</span>
            </p>
          </div>
        </div>

        <SidebarGroup className="px-4">
          <SidebarGroupLabel>Workflow</SidebarGroupLabel>
          <SidebarGroupContent className="space-y-1">
            <TooltipProvider delayDuration={200}>
              {WORKFLOW_STAGES.map((stage) => {
                const isRecommended = stage.id === recommendedNext
                const isComplete = completedStages.includes(stage.id)
                const isActiveStage = stage.items.some((item) => pathMatches(pathname, item.href))
                const open = openStages[stage.id] ?? isActiveStage ?? isRecommended

                return (
                  <Collapsible
                    key={stage.id}
                    open={open}
                    onOpenChange={(next) =>
                      setOpenStages((prev) => ({ ...prev, [stage.id]: next }))
                    }
                    className={cn(
                      'rounded-md border border-transparent',
                      isRecommended && 'border-border bg-sidebar-accent/40'
                    )}
                  >
                    <div className="flex items-center gap-1 px-1">
                      <CollapsibleTrigger asChild>
                        <button
                          type="button"
                          className="flex flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-sidebar-accent/60 transition-colors"
                        >
                          <span
                            className={cn(
                              'flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold shrink-0 tabular-nums',
                              isComplete
                                ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                                : isRecommended
                                  ? 'bg-foreground text-background'
                                  : 'bg-muted text-muted-foreground'
                            )}
                            aria-label={`Stage ${stage.number}${isComplete ? ', complete' : ''}`}
                          >
                            {stage.number}
                          </span>
                          <span className="flex-1 font-medium text-sidebar-foreground group-data-[collapsible=offcanvas]:hidden">
                            {stage.title}
                          </span>
                          {isComplete && (
                            <Check
                              className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0 group-data-[collapsible=offcanvas]:hidden"
                              aria-hidden
                            />
                          )}
                          {isRecommended && (
                            <Badge
                              variant="outline"
                              className="h-5 px-1.5 text-[10px] group-data-[collapsible=offcanvas]:hidden"
                            >
                              Next
                            </Badge>
                          )}
                          <ChevronDown
                            className={cn(
                              'h-3.5 w-3.5 text-muted-foreground transition-transform group-data-[collapsible=offcanvas]:hidden',
                              open && 'rotate-180'
                            )}
                          />
                        </button>
                      </CollapsibleTrigger>

                      {/* Phase 2 slot — disabled affordance only */}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            disabled
                            aria-label={`Ask the consultant about ${stage.title}`}
                            className="h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground/50 cursor-not-allowed group-data-[collapsible=offcanvas]:hidden"
                          >
                            <Bot className="h-3.5 w-3.5" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="right">
                          Ask the consultant — coming in Phase 2
                        </TooltipContent>
                      </Tooltip>
                    </div>

                    <CollapsibleContent>
                      <SidebarMenu className="pb-1 pl-3">
                        {stage.items.map((item) => (
                          <SidebarMenuItem key={item.href}>
                            <SidebarMenuButton
                              asChild
                              isActive={pathMatches(pathname, item.href)}
                              tooltip={item.title}
                            >
                              <Link
                                href={item.href}
                                className="flex items-center gap-2 px-3 py-1.5 text-sidebar-foreground"
                              >
                                <item.icon className="h-4 w-4 text-sidebar-foreground group-data-[collapsible=offcanvas]:hidden" />
                                <span className="text-sidebar-foreground">{item.title}</span>
                              </Link>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                        ))}
                      </SidebarMenu>
                    </CollapsibleContent>
                  </Collapsible>
                )
              })}
            </TooltipProvider>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator className="mx-4" />

        {/* Account tray — unnumbered, outside the flow */}
        <SidebarGroup className="px-4">
          <SidebarGroupLabel>Account</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {ACCOUNT_ITEMS.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathMatches(pathname, item.href)}
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

        {/* Marketing / legal stay out of the workflow spine */}
        <SidebarGroup className="px-4">
          <SidebarGroupLabel>Resources</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {RESOURCE_ITEMS.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton asChild isActive={pathname === item.href} tooltip={item.title}>
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

        <SidebarGroup className="px-4">
          <SidebarGroupLabel>Legal</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {LEGAL_ITEMS.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton asChild isActive={pathname === item.href} tooltip={item.title}>
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
        <SidebarMenu className="px-4 pt-4">
          <SidebarMenuItem>
            <div className="flex w-full items-center gap-2">
              {user ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <SidebarMenuButton className="data-[slot=sidebar-menu-button]:!p-2 flex-1 data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground">
                      <div className="flex items-center gap-3 min-w-0">
                        {organization?.party && (organization.party === 'R' || organization.party === 'D') ? (
                          <div
                            className={`h-8 w-8 rounded-lg flex items-center justify-center ${
                              organization.party === 'R' ? 'bg-red-500/15' : 'bg-blue-500/15'
                            }`}
                          >
                            <PartyIcon
                              party={organization.party}
                              size={18}
                              className={partyColor(organization.party)}
                            />
                          </div>
                        ) : (
                          <Avatar className="h-8 w-8 rounded-lg">
                            <AvatarImage src={undefined} alt={user.display_name || user.email || 'User'} />
                            <AvatarFallback className="rounded-lg">
                              {(user.display_name || user.email)?.charAt(0)?.toUpperCase() || 'U'}
                            </AvatarFallback>
                          </Avatar>
                        )}
                        <div className="grid flex-1 overflow-hidden text-left leading-tight group-data-[collapsible=offcanvas]:hidden">
                          <span className="truncate text-sm font-medium text-sidebar-foreground">
                            {user.display_name || user.email?.split('@')[0] || 'User'}
                          </span>
                          <span className="truncate text-xs text-muted-foreground">{user.email}</span>
                        </div>
                      </div>
                    </SidebarMenuButton>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    className="w-60 rounded-lg translate-x-2"
                    align="start"
                    alignOffset={8}
                    sideOffset={8}
                  >
                    <DropdownMenuLabel className="p-0 font-normal">
                      <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                        {organization?.party && (organization.party === 'R' || organization.party === 'D') ? (
                          <div
                            className={`h-8 w-8 rounded-lg flex items-center justify-center ${
                              organization.party === 'R' ? 'bg-red-500/15' : 'bg-blue-500/15'
                            }`}
                          >
                            <PartyIcon
                              party={organization.party}
                              size={18}
                              className={partyColor(organization.party)}
                            />
                          </div>
                        ) : (
                          <Avatar className="h-8 w-8 rounded-lg">
                            <AvatarImage src={undefined} alt={user.display_name || user.email || 'User'} />
                            <AvatarFallback className="rounded-lg">
                              {(user.display_name || user.email)?.charAt(0)?.toUpperCase() || 'U'}
                            </AvatarFallback>
                          </Avatar>
                        )}
                        <div className="grid flex-1 text-left leading-tight">
                          <span className="truncate text-sm font-medium">
                            {user.display_name || user.email?.split('@')[0] || 'User'}
                          </span>
                          <span className="truncate text-xs text-muted-foreground">{user.email}</span>
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
                        <Link href="/auth/register" className="flex items-center gap-2">
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
                      {user?.role === 'admin' && (
                        <DropdownMenuItem asChild>
                          <Link href="/admin" className="flex items-center gap-2">
                            <Shield className="size-4" />
                            Admin
                          </Link>
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuGroup>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="justify-between">
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
            </div>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
