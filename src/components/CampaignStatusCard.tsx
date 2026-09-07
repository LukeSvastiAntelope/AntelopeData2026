'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { 
  Play, 
  Square, 
  Calendar, 
  Clock,
  Users,
  AlertCircle,
  CheckCircle2,
  Pause
} from "lucide-react"
import { format } from "date-fns"

interface CampaignStatus {
  id: number
  title: string
  status: 'draft' | 'scheduled' | 'active' | 'stopped'
  is_public: boolean
  campaign_start_at?: string
  campaign_end_at?: string
  stopped_at?: string
  stopped_by?: number
  stop_reason?: string
  response_count: number
  can_start: boolean
  can_stop: boolean
  can_schedule: boolean
  created_at: string
  updated_at: string
}

interface CampaignStatusCardProps {
  campaign: CampaignStatus
  onStatusChange?: (surveyId: number, newStatus: string) => void
}

const statusConfig = {
  draft: {
    color: 'bg-gray-100 text-gray-800',
    icon: AlertCircle,
    label: 'Draft',
    description: 'Survey is being created'
  },
  scheduled: {
    color: 'bg-blue-100 text-blue-800',
    icon: Calendar,
    label: 'Scheduled',
    description: 'Campaign will start automatically'
  },
  active: {
    color: 'bg-green-100 text-green-800',
    icon: CheckCircle2,
    label: 'Active',
    description: 'Campaign is running'
  },
  stopped: {
    color: 'bg-red-100 text-red-800',
    icon: Pause,
    label: 'Stopped',
    description: 'Campaign has ended'
  }
}

export function CampaignStatusCard({ campaign, onStatusChange }: CampaignStatusCardProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const config = statusConfig[campaign.status]
  const StatusIcon = config.icon

  const handleAction = async (action: 'start' | 'stop' | 'schedule', data?: any) => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/surveys/${campaign.id}/campaign`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action,
          ...data
        }),
      })

      const result = await response.json()
      
      if (!result.status) {
        throw new Error(result.message || 'Failed to update campaign')
      }

      // Call callback to refresh data
      if (onStatusChange) {
        onStatusChange(campaign.id, action === 'start' ? 'active' : action === 'stop' ? 'stopped' : 'scheduled')
      }

    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (dateString: string) => {
    return format(new Date(dateString), 'MMM d, yyyy h:mm a')
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <StatusIcon className="h-5 w-5" />
            <CardTitle className="text-lg">{campaign.title}</CardTitle>
          </div>
          <Badge className={config.color}>
            {config.label}
          </Badge>
        </div>
        <CardDescription>
          {config.description}
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Campaign Stats */}
        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-center gap-2 text-sm">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{campaign.response_count}</span>
            <span className="text-muted-foreground">responses</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">
              Created {format(new Date(campaign.created_at), 'MMM d')}
            </span>
          </div>
        </div>

        {/* Campaign Timing */}
        {campaign.campaign_start_at && (
          <div className="text-sm">
            <span className="font-medium">Started: </span>
            <span className="text-muted-foreground">
              {formatDate(campaign.campaign_start_at)}
            </span>
          </div>
        )}

        {campaign.campaign_end_at && (
          <div className="text-sm">
            <span className="font-medium">Ends: </span>
            <span className="text-muted-foreground">
              {formatDate(campaign.campaign_end_at)}
            </span>
          </div>
        )}

        {campaign.stopped_at && (
          <div className="text-sm">
            <span className="font-medium">Stopped: </span>
            <span className="text-muted-foreground">
              {formatDate(campaign.stopped_at)}
            </span>
            {campaign.stop_reason && (
              <div className="text-xs text-muted-foreground mt-1">
                Reason: {campaign.stop_reason}
              </div>
            )}
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="text-sm text-red-600 bg-red-50 p-2 rounded">
            {error}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-2 pt-2">
          {campaign.can_start && (
            <Button
              size="sm"
              onClick={() => handleAction('start')}
              disabled={loading}
              className="gap-1"
            >
              <Play className="h-3 w-3" />
              Start Campaign
            </Button>
          )}

          {campaign.can_stop && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleAction('stop', { reason: 'Manually stopped' })}
              disabled={loading}
              className="gap-1"
            >
              <Square className="h-3 w-3" />
              Stop Campaign
            </Button>
          )}

          {campaign.can_schedule && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                // TODO: Open schedule dialog
                const startAt = prompt('Enter start date/time (YYYY-MM-DD HH:MM):')
                if (startAt) {
                  handleAction('schedule', { campaignStartAt: startAt })
                }
              }}
              disabled={loading}
              className="gap-1"
            >
              <Calendar className="h-3 w-3" />
              Schedule
            </Button>
          )}
        </div>

        {/* Visibility Status */}
        <div className="text-xs text-muted-foreground border-t pt-2">
          <span className="font-medium">Visibility: </span>
          {campaign.is_public ? (
            <span className="text-green-600">Public (anyone with link can participate)</span>
          ) : (
            <span className="text-orange-600">Private (restricted access)</span>
          )}
        </div>
      </CardContent>
    </Card>
  )
} 