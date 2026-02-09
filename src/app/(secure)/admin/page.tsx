'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Users,
  FileText,
  Brain,
  Activity,
  Loader2,
  Trash2,
  Search,
  RefreshCw,
  Shield,
  Clock,
  AlertTriangle,
} from 'lucide-react'
import { useFetch } from '@/app/utils/lib'
import toast from 'react-hot-toast'
import { formatDistanceToNow } from 'date-fns'
import { useRouter } from 'next/navigation'
import { handleAuthError } from '../../utils/lib'

// -----------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------

interface AdminUser {
  id: number
  email: string
  display_name: string | null
  role: 'user' | 'admin'
}

interface AdminSurvey {
  id: number
  title: string
  slug: string
  status: string
  created_by: number
  response_count: number
  created_at: string
}

interface PlatformStats {
  userCount: number
  surveyCount: number
  responseCount: number
  twinCount: number
}

// -----------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------

export default function AdminPage() {
  const fetch = useFetch()
  const router = useRouter()

  // Users
  const [users, setUsers] = useState<AdminUser[]>([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [userSearch, setUserSearch] = useState('')
  const [deleteUser, setDeleteUser] = useState<AdminUser | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  // Surveys
  const [surveys, setSurveys] = useState<AdminSurvey[]>([])
  const [surveysLoading, setSurveysLoading] = useState(false)
  const [surveySearch, setSurveySearch] = useState('')

  // Stats
  const [stats, setStats] = useState<PlatformStats>({
    userCount: 0,
    surveyCount: 0,
    responseCount: 0,
    twinCount: 0,
  })

  // ------------------------------------------------------------------
  // Fetch users
  // ------------------------------------------------------------------

  const fetchUsers = useCallback(async () => {
    setUsersLoading(true)
    try {
      const response = await fetch.get('/api/admin/users')
      if (response.status) {
        setUsers(response.users || [])
      } else {
        toast.error(response.message || 'Failed to fetch users')
      }
    } catch (error) {
      console.error('Error fetching users:', error)
      toast.error('Failed to fetch users')
    } finally {
      setUsersLoading(false)
    }
  }, [])

  // ------------------------------------------------------------------
  // Fetch surveys (uses the regular surveys endpoint with admin context)
  // ------------------------------------------------------------------

  const fetchSurveys = useCallback(async () => {
    setSurveysLoading(true)
    try {
      const response = await fetch.get('/api/admin/surveys')
      if (response.status !== false) {
        const surveyList = response.surveys || []
        setSurveys(surveyList)
      }
    } catch (error) {
      console.error('Error fetching surveys:', error)
      // Don't toast on this — it might not exist as an admin endpoint yet
    } finally {
      setSurveysLoading(false)
    }
  }, [])

  // ------------------------------------------------------------------
  // Initial load
  // ------------------------------------------------------------------

  useEffect(() => {
    fetchUsers()
    fetchSurveys()
  }, [])

  // Derive stats from loaded data
  useEffect(() => {
    setStats((prev) => ({
      ...prev,
      userCount: users.length,
      surveyCount: surveys.length,
      responseCount: surveys.reduce((sum, s) => sum + (s.response_count || 0), 0),
    }))
  }, [users, surveys])

  // ------------------------------------------------------------------
  // Delete user
  // ------------------------------------------------------------------

  const handleConfirmDelete = async () => {
    if (!deleteUser) return
    setDeleteLoading(true)

    try {
      const token =
        typeof window !== 'undefined'
          ? localStorage.getItem('token') ?? ''
          : ''
      if (!token && process.env.NODE_ENV !== 'development') {
        handleAuthError(undefined, false)
        setDeleteUser(null)
        return
      }

      const response = await window.fetch(
        `/api/admin/deleteUser/${deleteUser.id}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      )

      const result = await response.json()

      if (response.ok && result.status) {
        toast.success(
          `User ${deleteUser.display_name || deleteUser.email} deleted`
        )
        setUsers((prev) => prev.filter((u) => u.id !== deleteUser.id))
      } else {
        toast.error(result.message || 'Failed to delete user')
      }
    } catch (error) {
      console.error('Error deleting user:', error)
      toast.error('An error occurred while deleting the user')
    } finally {
      setDeleteLoading(false)
      setDeleteUser(null)
    }
  }

  // ------------------------------------------------------------------
  // Filtered lists
  // ------------------------------------------------------------------

  const filteredUsers = users.filter((u) => {
    if (!userSearch) return true
    const q = userSearch.toLowerCase()
    return (
      (u.email || '').toLowerCase().includes(q) ||
      (u.display_name || '').toLowerCase().includes(q) ||
      String(u.id).includes(q)
    )
  })

  const filteredSurveys = surveys.filter((s) => {
    if (!surveySearch) return true
    const q = surveySearch.toLowerCase()
    return (
      (s.title || '').toLowerCase().includes(q) ||
      (s.slug || '').toLowerCase().includes(q) ||
      String(s.id).includes(q)
    )
  })

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <div className="flex items-center gap-2 p-4 border-b">
        <SidebarTrigger />
        <div className="flex-1">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Admin Dashboard
          </h1>
          <p className="text-sm text-muted-foreground">
            Platform management and user administration
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => router.push('/admin/scheduler')}
        >
          <Clock className="h-4 w-4 mr-1" />
          Scheduler
        </Button>
      </div>

      <div className="flex-1 p-6 max-w-6xl mx-auto w-full space-y-6">
        {/* Stats cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatsCard
            icon={<Users className="h-5 w-5" />}
            label="Total Users"
            value={stats.userCount}
            loading={usersLoading}
          />
          <StatsCard
            icon={<FileText className="h-5 w-5" />}
            label="Surveys"
            value={stats.surveyCount}
            loading={surveysLoading}
          />
          <StatsCard
            icon={<Activity className="h-5 w-5" />}
            label="Responses"
            value={stats.responseCount}
            loading={surveysLoading}
          />
          <StatsCard
            icon={<Brain className="h-5 w-5" />}
            label="Voter Profiles"
            value={stats.twinCount}
            loading={false}
            note="—"
          />
        </div>

        {/* Main tabs */}
        <Tabs defaultValue="users">
          <TabsList>
            <TabsTrigger value="users" className="flex items-center gap-1">
              <Users className="h-4 w-4" />
              Users
            </TabsTrigger>
            <TabsTrigger value="surveys" className="flex items-center gap-1">
              <FileText className="h-4 w-4" />
              Surveys
            </TabsTrigger>
          </TabsList>

          {/* ---- USERS TAB ---- */}
          <TabsContent value="users" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>User Management</CardTitle>
                    <CardDescription>
                      {users.length} registered users
                    </CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={fetchUsers}
                    disabled={usersLoading}
                  >
                    <RefreshCw
                      className={`h-4 w-4 mr-1 ${usersLoading ? 'animate-spin' : ''}`}
                    />
                    Refresh
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {/* Search */}
                <div className="relative mb-4">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by name, email, or ID..."
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>

                {/* Table */}
                {usersLoading && users.length === 0 ? (
                  <div className="flex justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : filteredUsers.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    {userSearch ? 'No users match your search' : 'No users found'}
                  </div>
                ) : (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[80px]">ID</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Display Name</TableHead>
                          <TableHead className="w-[100px]">Role</TableHead>
                          <TableHead className="w-[80px] text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredUsers.map((u) => (
                          <TableRow key={u.id}>
                            <TableCell className="font-mono text-sm">
                              {u.id}
                            </TableCell>
                            <TableCell className="text-sm">
                              {u.email || '—'}
                            </TableCell>
                            <TableCell className="text-sm">
                              {u.display_name || '—'}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={u.role === 'admin' ? 'default' : 'secondary'}
                              >
                                {u.role || 'user'}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                                onClick={() => setDeleteUser(u)}
                                disabled={u.role === 'admin'}
                                title={
                                  u.role === 'admin'
                                    ? 'Cannot delete admin users'
                                    : 'Delete user'
                                }
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ---- SURVEYS TAB ---- */}
          <TabsContent value="surveys" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Survey Management</CardTitle>
                    <CardDescription>
                      {surveys.length} surveys across all users
                    </CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={fetchSurveys}
                    disabled={surveysLoading}
                  >
                    <RefreshCw
                      className={`h-4 w-4 mr-1 ${surveysLoading ? 'animate-spin' : ''}`}
                    />
                    Refresh
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {/* Search */}
                <div className="relative mb-4">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by title, slug, or ID..."
                    value={surveySearch}
                    onChange={(e) => setSurveySearch(e.target.value)}
                    className="pl-9"
                  />
                </div>

                {/* Table */}
                {surveysLoading && surveys.length === 0 ? (
                  <div className="flex justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : filteredSurveys.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    {surveySearch ? 'No surveys match your search' : 'No surveys found'}
                  </div>
                ) : (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[80px]">ID</TableHead>
                          <TableHead>Title</TableHead>
                          <TableHead className="w-[100px]">Status</TableHead>
                          <TableHead className="w-[100px] text-right">Responses</TableHead>
                          <TableHead className="w-[120px]">Created</TableHead>
                          <TableHead className="w-[80px]">Owner</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredSurveys.map((s) => (
                          <TableRow
                            key={s.id}
                            className="cursor-pointer"
                            onClick={() => router.push(`/surveys/${s.id}/analytics`)}
                          >
                            <TableCell className="font-mono text-sm">
                              {s.id}
                            </TableCell>
                            <TableCell className="text-sm font-medium">
                              {s.title || '—'}
                            </TableCell>
                            <TableCell>
                              <SurveyStatusBadge status={s.status} />
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm">
                              {s.response_count || 0}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {s.created_at
                                ? formatDistanceToNow(new Date(s.created_at), {
                                    addSuffix: true,
                                  })
                                : '—'}
                            </TableCell>
                            <TableCell className="font-mono text-sm">
                              {s.created_by}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteUser} onOpenChange={(open) => !open && setDeleteUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Confirm User Deletion
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{' '}
              <span className="font-semibold text-foreground">
                {deleteUser?.display_name || deleteUser?.email || `User #${deleteUser?.id}`}
              </span>
              ? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteUser(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmDelete}
              disabled={deleteLoading}
            >
              {deleteLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  Deleting...
                </>
              ) : (
                'Delete User'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// -----------------------------------------------------------------------
// Sub-components
// -----------------------------------------------------------------------

function StatsCard({
  icon,
  label,
  value,
  loading,
  note,
}: {
  icon: React.ReactNode
  label: string
  value: number
  loading: boolean
  note?: string
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-3">
          <div className="text-muted-foreground">{icon}</div>
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            {loading ? (
              <Loader2 className="h-5 w-5 animate-spin mt-1" />
            ) : note ? (
              <p className="text-2xl font-bold text-muted-foreground">{note}</p>
            ) : (
              <p className="text-2xl font-bold">{value.toLocaleString()}</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function SurveyStatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'active':
      return <Badge className="bg-green-500/15 text-green-700 dark:text-green-400 border-0">Active</Badge>
    case 'draft':
      return <Badge variant="secondary">Draft</Badge>
    case 'stopped':
      return <Badge variant="outline" className="text-muted-foreground">Stopped</Badge>
    case 'scheduled':
      return <Badge className="bg-blue-500/15 text-blue-700 dark:text-blue-400 border-0">Scheduled</Badge>
    default:
      return <Badge variant="secondary">{status}</Badge>
  }
}
