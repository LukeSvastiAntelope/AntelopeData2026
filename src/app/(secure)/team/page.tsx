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
  FileText,
  MapPin,
  Vote
} from 'lucide-react'
import toast from 'react-hot-toast'
import { formatDistanceToNow } from 'date-fns'

// ---------------------------------------------------------------------------
// Constants for campaign fields
// ---------------------------------------------------------------------------

const OFFICE_TYPES: { value: string; label: string }[] = [
  { value: 'federal_house', label: 'U.S. House' },
  { value: 'federal_senate', label: 'U.S. Senate' },
  { value: 'governor', label: 'Governor' },
  { value: 'state_senate', label: 'State Senate' },
  { value: 'state_house', label: 'State House' },
  { value: 'mayor', label: 'Mayor' },
  { value: 'city_council', label: 'City Council' },
  { value: 'county', label: 'County' },
  { value: 'president', label: 'President' },
  { value: 'other', label: 'Other' },
]

const PARTIES: { value: string; label: string; color: string }[] = [
  { value: 'D', label: 'Democrat', color: 'text-blue-500' },
  { value: 'R', label: 'Republican', color: 'text-red-500' },
  { value: 'I', label: 'Independent', color: 'text-gray-500' },
  { value: 'L', label: 'Libertarian', color: 'text-yellow-500' },
  { value: 'G', label: 'Green', color: 'text-green-500' },
  { value: 'O', label: 'Other', color: 'text-gray-400' },
]

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN',
  'IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH',
  'NJ','NM','NY','NC','ND','OH','OK','OR','PA','PR','RI','SC','SD','TN','TX',
  'UT','VT','VA','WA','WV','WI','WY',
]

/** Number of congressional districts per state (119th Congress) */
const DISTRICTS_PER_STATE: Record<string, number> = {
  AL:7,AK:1,AZ:9,AR:4,CA:52,CO:8,CT:5,DE:1,FL:28,GA:14,HI:2,ID:2,IL:17,
  IN:9,IA:4,KS:4,KY:6,LA:6,ME:2,MD:8,MA:9,MI:13,MN:8,MS:4,MO:8,MT:2,NE:3,
  NV:4,NH:2,NJ:12,NM:3,NY:26,NC:14,ND:1,OH:15,OK:5,OR:6,PA:17,RI:2,SC:7,
  SD:1,TN:9,TX:38,UT:4,VT:1,VA:11,WA:10,WV:2,WI:8,WY:1,DC:1,PR:1,
}

function officeLabel(type: string | null | undefined): string {
  if (!type) return ''
  return OFFICE_TYPES.find(o => o.value === type)?.label || type
}

function partyLabel(p: string | null | undefined): string {
  if (!p) return ''
  return PARTIES.find(x => x.value === p)?.label || p
}

function partyColor(p: string | null | undefined): string {
  if (p === 'D') return 'text-blue-500'
  if (p === 'R') return 'text-red-500'
  return 'text-muted-foreground'
}

function partyDotColor(p: string | null | undefined): string {
  if (p === 'D') return 'bg-blue-500'
  if (p === 'R') return 'bg-red-500'
  if (p === 'I') return 'bg-gray-500'
  if (p === 'L') return 'bg-yellow-500'
  if (p === 'G') return 'bg-green-500'
  return 'bg-gray-400'
}

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

interface Organization {
  id: number
  name: string
  slug: string
  description: string | null
  role: string
  member_count: number
  survey_count: number
  office_type?: string | null
  state?: string | null
  district_code?: string | null
  candidate_name?: string | null
  party?: string | null
  election_year?: number | null
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
  const [newCandidateName, setNewCandidateName] = useState('')
  const [newParty, setNewParty] = useState<string>('')
  const [newElectionYear, setNewElectionYear] = useState<string>('2026')
  const [newOfficeType, setNewOfficeType] = useState<string>('')
  const [newState, setNewState] = useState<string>('')
  const [newDistrictCode, setNewDistrictCode] = useState<string>('')
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
        body: JSON.stringify({
          name: newOrgName,
          description: newOrgDescription || undefined,
          office_type: newOfficeType || undefined,
          state: newState || undefined,
          district_code: newDistrictCode || undefined,
          candidate_name: newCandidateName || undefined,
          party: newParty || undefined,
          election_year: newElectionYear ? parseInt(newElectionYear) : undefined,
        }),
      })
      const data = await res.json()
      if (data.status) {
        toast.success('Campaign created!')
        setShowCreate(false)
        setNewOrgName('')
        setNewOrgDescription('')
        setNewCandidateName('')
        setNewParty('')
        setNewElectionYear('2026')
        setNewOfficeType('')
        setNewState('')
        setNewDistrictCode('')
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

  // Whether this office type needs a district code
  const officeNeedsDistrict = (t: string) =>
    ['federal_house', 'state_senate', 'state_house', 'city_council', 'county'].includes(t)

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
          {/* Create Campaign Form */}
          {showCreate && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  Create Campaign
                </CardTitle>
                <CardDescription>
                  Set up a campaign team for a specific race. Your team can collaborate on surveys, voter data, and analysis.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                {/* Row 1: Name + Candidate */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="org-name">Campaign Name</Label>
                    <Input
                      id="org-name"
                      placeholder="e.g., Smith for Congress"
                      value={newOrgName}
                      onChange={(e) => setNewOrgName(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="candidate-name">Candidate Name</Label>
                    <Input
                      id="candidate-name"
                      placeholder="e.g., John Smith"
                      value={newCandidateName}
                      onChange={(e) => setNewCandidateName(e.target.value)}
                    />
                  </div>
                </div>

                {/* Row 2: Party + Year */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label>Party</Label>
                    <Select value={newParty} onValueChange={setNewParty}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select party" />
                      </SelectTrigger>
                      <SelectContent>
                        {PARTIES.map(p => (
                          <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="election-year">Election Year</Label>
                    <Input
                      id="election-year"
                      type="number"
                      min={2024}
                      max={2036}
                      value={newElectionYear}
                      onChange={(e) => setNewElectionYear(e.target.value)}
                    />
                  </div>
                </div>

                {/* Row 3: Office Type + State */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label>Office</Label>
                    <Select value={newOfficeType} onValueChange={(v) => { setNewOfficeType(v); setNewDistrictCode('') }}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select office type" />
                      </SelectTrigger>
                      <SelectContent>
                        {OFFICE_TYPES.map(o => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>State</Label>
                    <Select value={newState} onValueChange={(v) => { setNewState(v); setNewDistrictCode('') }}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select state" />
                      </SelectTrigger>
                      <SelectContent>
                        {US_STATES.map(s => (
                          <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Conditional: District code for office types that need it */}
                {newOfficeType === 'federal_house' && newState && (
                  <div className="max-w-xs">
                    <Label>Congressional District</Label>
                    <Select value={newDistrictCode} onValueChange={setNewDistrictCode}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select district" />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from(
                          { length: DISTRICTS_PER_STATE[newState] || 1 },
                          (_, i) => {
                            const num = (DISTRICTS_PER_STATE[newState] || 1) === 1 ? 'AL' : String(i + 1).padStart(2, '0')
                            const code = `${newState}-${num}`
                            return <SelectItem key={code} value={code}>{code}</SelectItem>
                          }
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {officeNeedsDistrict(newOfficeType) && newOfficeType !== 'federal_house' && (
                  <div className="max-w-xs">
                    <Label>District / Ward Code</Label>
                    <Input
                      placeholder={newOfficeType === 'state_senate' ? 'e.g., SD-26' : newOfficeType === 'state_house' ? 'e.g., LD-26' : 'e.g., Ward 3'}
                      value={newDistrictCode}
                      onChange={(e) => setNewDistrictCode(e.target.value)}
                    />
                  </div>
                )}

                {/* Optional description */}
                <div>
                  <Label htmlFor="org-desc">Description (optional)</Label>
                  <Textarea
                    id="org-desc"
                    placeholder="Additional notes about the campaign..."
                    value={newOrgDescription}
                    onChange={(e) => setNewOrgDescription(e.target.value)}
                    rows={2}
                  />
                </div>

                <div className="flex gap-2 pt-1">
                  <Button onClick={createOrganization} disabled={creating}>
                    {creating ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Vote className="h-4 w-4 mr-1" />}
                    Create Campaign
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
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {org.party && (
                              <div className={`h-2.5 w-2.5 rounded-full ${partyDotColor(org.party)}`} />
                            )}
                            <CardTitle className="text-lg">{org.name}</CardTitle>
                          </div>
                          <Badge className={roleColor(org.role)}>{org.role}</Badge>
                        </div>
                        {/* Campaign context line */}
                        {(org.office_type || org.district_code || org.state) && (
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
                            <MapPin className="h-3 w-3" />
                            {[
                              org.district_code || org.state,
                              officeLabel(org.office_type),
                              org.election_year,
                            ].filter(Boolean).join(' · ')}
                          </div>
                        )}
                        {org.candidate_name && (
                          <p className={`text-sm font-medium mt-0.5 ${partyColor(org.party)}`}>
                            {org.candidate_name} ({partyLabel(org.party) || org.party})
                          </p>
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
                  <div className="flex items-center gap-3">
                    {selectedOrg.party && (
                      <div className={`h-3 w-3 rounded-full ${partyDotColor(selectedOrg.party)}`} />
                    )}
                    <h2 className="text-2xl font-bold">{selectedOrg.name}</h2>
                  </div>
                  {/* Campaign context */}
                  {(selectedOrg.candidate_name || selectedOrg.office_type) && (
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                      {selectedOrg.candidate_name && (
                        <span className={`font-medium ${partyColor(selectedOrg.party)}`}>
                          {selectedOrg.candidate_name} ({partyLabel(selectedOrg.party) || selectedOrg.party})
                        </span>
                      )}
                      {selectedOrg.office_type && (
                        <Badge variant="outline" className="text-xs">
                          {officeLabel(selectedOrg.office_type)}
                        </Badge>
                      )}
                      {(selectedOrg.district_code || selectedOrg.state) && (
                        <span className="text-muted-foreground flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {selectedOrg.district_code || selectedOrg.state}
                        </span>
                      )}
                      {selectedOrg.election_year && (
                        <span className="text-muted-foreground">{selectedOrg.election_year}</span>
                      )}
                    </div>
                  )}
                  {selectedOrg.description && (
                    <p className="text-muted-foreground mt-1">{selectedOrg.description}</p>
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
