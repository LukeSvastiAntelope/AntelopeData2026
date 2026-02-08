'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { 
  Users, 
  Plus, 
  Building2, 
  Mail, 
  Shield, 
  Eye, 
  BarChart3, 
  UserPlus, 
  Loader2,
  Clock,
  FileText
} from 'lucide-react'
import toast from 'react-hot-toast'
import { formatDistanceToNow } from 'date-fns'

interface Organization {
  id: number
  name: string
  slug: string
  description: string | null
  role: string
  member_count: number
  survey_count: number
}

interface OrgMember {
  id: number
  user_id: number
  role: string
  status: string
  email: string
  display_name: string
  invited_at: string
  accepted_at: string | null
}

interface OrgSurvey {
  id: number
  title: string
  status: string
  response_count: number
  created_at: string
}

interface ActivityItem {
  id: number
  action: string
  display_name: string
  email: string
  details: any
  created_at: string
}

export default function TeamPage() {
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null)
  const [members, setMembers] = useState<OrgMember[]>([])
  const [surveys, setSurveys] = useState<OrgSurvey[]>([])
  const [activity, setActivity] = useState<ActivityItem[]>([])
  const [userRole, setUserRole] = useState<string>('')
  const [loading, setLoading] = useState(true)

  // Create org form
  const [showCreate, setShowCreate] = useState(false)
  const [newOrgName, setNewOrgName] = useState('')
  const [newOrgDescription, setNewOrgDescription] = useState('')
  const [creating, setCreating] = useState(false)

  // Invite form
  const [showInvite, setShowInvite] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<string>('analyst')
  const [inviting, setInviting] = useState(false)

  useEffect(() => {
    loadOrganizations()
  }, [])

  const loadOrganizations = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/organizations', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
      })
      const data = await res.json()
      if (data.status) {
        setOrganizations(data.organizations)
      }
    } catch (error) {
      console.error('Failed to load organizations:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadOrgDetails = async (org: Organization) => {
    setSelectedOrg(org)
    try {
      const res = await fetch(`/api/organizations/${org.id}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
      })
      const data = await res.json()
      if (data.status) {
        setMembers(data.members || [])
        setSurveys(data.surveys || [])
        setActivity(data.activity || [])
        setUserRole(data.userRole || '')
      }
    } catch (error) {
      console.error('Failed to load org details:', error)
    }
  }

  const createOrganization = async () => {
    if (!newOrgName.trim()) {
      toast.error('Organization name is required')
      return
    }
    setCreating(true)
    try {
      const res = await fetch('/api/organizations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ name: newOrgName, description: newOrgDescription }),
      })
      const data = await res.json()
      if (data.status) {
        toast.success('Organization created!')
        setShowCreate(false)
        setNewOrgName('')
        setNewOrgDescription('')
        loadOrganizations()
      } else {
        toast.error(data.message || 'Failed to create organization')
      }
    } catch (error) {
      toast.error('Failed to create organization')
    } finally {
      setCreating(false)
    }
  }

  const inviteMember = async () => {
    if (!selectedOrg || !inviteEmail.trim()) return
    setInviting(true)
    try {
      const res = await fetch(`/api/organizations/${selectedOrg.id}/members`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      })
      const data = await res.json()
      if (data.status) {
        toast.success(data.message)
        setShowInvite(false)
        setInviteEmail('')
        loadOrgDetails(selectedOrg)
      } else {
        toast.error(data.message || 'Failed to invite member')
      }
    } catch (error) {
      toast.error('Failed to invite member')
    } finally {
      setInviting(false)
    }
  }

  const roleColor = (role: string) => {
    switch (role) {
      case 'owner': return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400'
      case 'admin': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
      case 'analyst': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
      case 'viewer': return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400'
      default: return ''
    }
  }

  const roleIcon = (role: string) => {
    switch (role) {
      case 'owner': return <Shield className="h-3 w-3" />
      case 'admin': return <Shield className="h-3 w-3" />
      case 'analyst': return <BarChart3 className="h-3 w-3" />
      case 'viewer': return <Eye className="h-3 w-3" />
      default: return null
    }
  }

  return (
    <div className="flex-1 p-2 w-full bg-background">
      <div className="mx-auto rounded-lg bg-card text-card-foreground shadow-lg">
        {/* Header */}
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <SidebarTrigger className="-ml-0.5 h-5 w-5 text-muted-foreground hover:text-foreground" />
              <div className="h-4 border-l border-border mx-4" />
              <h1 className="text-base font-medium text-card-foreground">Team</h1>
            </div>
            <Button size="sm" onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4 mr-1" />
              New Organization
            </Button>
          </div>
        </div>

        <div className="border-b border-border" />

        <div className="p-6 space-y-6">
          {/* Create Organization Form */}
          {showCreate && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  Create Organization
                </CardTitle>
                <CardDescription>
                  Create a campaign team or organization to collaborate on surveys and analysis.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="org-name">Organization Name</Label>
                  <Input
                    id="org-name"
                    placeholder="e.g., Smith for Governor Campaign"
                    value={newOrgName}
                    onChange={(e) => setNewOrgName(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="org-desc">Description (optional)</Label>
                  <Textarea
                    id="org-desc"
                    placeholder="Describe the team or campaign..."
                    value={newOrgDescription}
                    onChange={(e) => setNewOrgDescription(e.target.value)}
                    rows={2}
                  />
                </div>
                <div className="flex gap-2">
                  <Button onClick={createOrganization} disabled={creating}>
                    {creating ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
                    Create
                  </Button>
                  <Button variant="ghost" onClick={() => setShowCreate(false)}>
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Organization List */}
          {!selectedOrg && (
            <>
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : organizations.length === 0 ? (
                <div className="text-center py-12">
                  <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No organizations yet</h3>
                  <p className="text-muted-foreground mb-4">
                    Create an organization to collaborate with your campaign team on surveys and analysis.
                  </p>
                  <Button onClick={() => setShowCreate(true)}>
                    <Plus className="h-4 w-4 mr-1" />
                    Create Organization
                  </Button>
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {organizations.map((org) => (
                    <Card
                      key={org.id}
                      className="cursor-pointer hover:border-primary transition-colors"
                      onClick={() => loadOrgDetails(org)}
                    >
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-lg">{org.name}</CardTitle>
                          <Badge className={roleColor(org.role)}>{org.role}</Badge>
                        </div>
                        {org.description && (
                          <CardDescription>{org.description}</CardDescription>
                        )}
                      </CardHeader>
                      <CardContent>
                        <div className="flex gap-4 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            {org.member_count} members
                          </span>
                          <span className="flex items-center gap-1">
                            <FileText className="h-3 w-3" />
                            {org.survey_count} surveys
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Organization Detail */}
          {selectedOrg && (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <Button variant="ghost" size="sm" onClick={() => setSelectedOrg(null)} className="mb-2">
                    &larr; Back to organizations
                  </Button>
                  <h2 className="text-2xl font-bold">{selectedOrg.name}</h2>
                  {selectedOrg.description && (
                    <p className="text-muted-foreground">{selectedOrg.description}</p>
                  )}
                </div>
                {['owner', 'admin'].includes(userRole) && (
                  <Button size="sm" onClick={() => setShowInvite(true)}>
                    <UserPlus className="h-4 w-4 mr-1" />
                    Invite Member
                  </Button>
                )}
              </div>

              {/* Invite Member Form */}
              {showInvite && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Invite Team Member</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex gap-4">
                      <div className="flex-1">
                        <Label>Email Address</Label>
                        <Input
                          type="email"
                          placeholder="colleague@campaign.com"
                          value={inviteEmail}
                          onChange={(e) => setInviteEmail(e.target.value)}
                        />
                      </div>
                      <div className="w-40">
                        <Label>Role</Label>
                        <Select value={inviteRole} onValueChange={setInviteRole}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin">Admin</SelectItem>
                            <SelectItem value="analyst">Analyst</SelectItem>
                            <SelectItem value="viewer">Viewer</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground space-y-1">
                      <p><strong>Admin:</strong> Can manage members, create surveys, and access all data</p>
                      <p><strong>Analyst:</strong> Can create surveys, run analysis, and generate reports</p>
                      <p><strong>Viewer:</strong> Can view surveys, results, and reports (read-only)</p>
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={inviteMember} disabled={inviting}>
                        {inviting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Mail className="h-4 w-4 mr-1" />}
                        Send Invite
                      </Button>
                      <Button variant="ghost" onClick={() => setShowInvite(false)}>Cancel</Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Members Table */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    Team Members ({members.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Member</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Joined</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {members.map((member) => (
                        <TableRow key={member.id}>
                          <TableCell>
                            <div>
                              <p className="font-medium">{member.display_name || member.email}</p>
                              <p className="text-xs text-muted-foreground">{member.email}</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge className={`${roleColor(member.role)} gap-1`}>
                              {roleIcon(member.role)}
                              {member.role}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={member.status === 'active' ? 'default' : 'outline'}>
                              {member.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {member.accepted_at
                              ? formatDistanceToNow(new Date(member.accepted_at), { addSuffix: true })
                              : 'Pending'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              {/* Shared Surveys */}
              {surveys.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <FileText className="h-5 w-5" />
                      Shared Surveys ({surveys.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Survey</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Responses</TableHead>
                          <TableHead>Created</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {surveys.map((survey) => (
                          <TableRow key={survey.id}>
                            <TableCell className="font-medium">{survey.title}</TableCell>
                            <TableCell>
                              <Badge variant="outline">{survey.status}</Badge>
                            </TableCell>
                            <TableCell>{survey.response_count}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {formatDistanceToNow(new Date(survey.created_at), { addSuffix: true })}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}

              {/* Activity Log */}
              {activity.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Clock className="h-5 w-5" />
                      Recent Activity
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {activity.map((item) => (
                        <div key={item.id} className="flex items-center gap-3 text-sm">
                          <span className="text-muted-foreground whitespace-nowrap">
                            {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                          </span>
                          <span>
                            <strong>{item.display_name || item.email}</strong>
                            {' '}
                            {item.action.replace(/_/g, ' ')}
                          </span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
