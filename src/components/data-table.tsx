"use client"

import { useState } from "react"
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Check, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { formatDistanceToNow } from "date-fns"

interface ActivityItem {
  id: number
  type: string
  actor: string
  description: string
  market: string
  amount?: string
  timestamp: string
}

interface BetHistoryItem {
  id: number
  market: string
  position: string
  amount: string
  probability: string
  status: string
  result?: string
  payout?: string
  timestamp: string
}

interface PredictionItem {
  id: number
  market: string
  category: string
  probability: string
  status: string
  resolution?: string
  expires: string
  created: string
}

interface DataTableProps {
  data: any[]
  activityData?: ActivityItem[]
  betsHistoryData?: BetHistoryItem[]
  predictionsData?: PredictionItem[]
}

export function DataTable({ data, activityData = [], betsHistoryData = [], predictionsData = [] }: DataTableProps) {
  const [activeTab, setActiveTab] = useState("activity")
  
  const formatDate = (dateString: string) => {
    try {
      return formatDistanceToNow(new Date(dateString), { addSuffix: true })
    } catch (e) {
      return dateString
    }
  }

  return (
    <div className="px-4 lg:px-6">
      <div className="mb-4 flex items-center">
        <div className="flex items-center space-x-2">
          <Button variant="outline" onClick={() => setActiveTab("activity")} 
            className={`border-zinc-700 text-zinc-300 hover:bg-zinc-900/50 hover:text-white ${activeTab === "activity" ? "bg-zinc-900/50 text-white" : ""}`}>
            Activity
          </Button>
          <Button variant="outline" onClick={() => setActiveTab("bets-history")} 
            className={`border-zinc-700 text-zinc-300 hover:bg-zinc-900/50 hover:text-white ${activeTab === "bets-history" ? "bg-zinc-900/50 text-white" : ""}`}>
            Bets History
          </Button>
          <Button variant="outline" onClick={() => setActiveTab("predictions")} 
            className={`border-zinc-700 text-zinc-300 hover:bg-zinc-900/50 hover:text-white ${activeTab === "predictions" ? "bg-zinc-900/50 text-white" : ""}`}>
            Predictions
          </Button>
        </div>
      </div>
      <div className="rounded-md border border-zinc-800 text-zinc-100">
        <Table>
          <TableHeader>
            <TableRow className="border-zinc-800 hover:bg-zinc-900/50">
              {activeTab === "activity" && (
                <>
                  <TableHead className="text-zinc-400">Type</TableHead>
                  <TableHead className="text-zinc-400">Actor</TableHead>
                  <TableHead className="text-zinc-400">Description</TableHead>
                  <TableHead className="text-zinc-400">Market</TableHead>
                  <TableHead className="text-zinc-400">Amount</TableHead>
                  <TableHead className="text-zinc-400">Time</TableHead>
                </>
              )}
              {activeTab === "bets-history" && (
                <>
                  <TableHead className="text-zinc-400">Market</TableHead>
                  <TableHead className="text-zinc-400">Position</TableHead>
                  <TableHead className="text-zinc-400">Amount</TableHead>
                  <TableHead className="text-zinc-400">Probability</TableHead>
                  <TableHead className="text-zinc-400">Status</TableHead>
                  <TableHead className="text-zinc-400">Result</TableHead>
                  <TableHead className="text-zinc-400">Payout</TableHead>
                  <TableHead className="text-zinc-400">Date</TableHead>
                </>
              )}
              {activeTab === "predictions" && (
                <>
                  <TableHead className="text-zinc-400">Market</TableHead>
                  <TableHead className="text-zinc-400">Category</TableHead>
                  <TableHead className="text-zinc-400">Probability</TableHead>
                  <TableHead className="text-zinc-400">Status</TableHead>
                  <TableHead className="text-zinc-400">Resolution</TableHead>
                  <TableHead className="text-zinc-400">Expires</TableHead>
                  <TableHead className="text-zinc-400">Created</TableHead>
                </>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {activeTab === "activity" && activityData.map((item) => (
              <TableRow key={item.id} className="border-zinc-800 hover:bg-zinc-900/50">
                <TableCell>
                  <Badge variant="outline" className={`${item.type === 'join' ? 'border-blue-500 text-blue-400' : 'border-green-500 text-green-400'}`}>
                    {item.type === 'join' ? 'Join' : 'Wager'}
                  </Badge>
                </TableCell>
                <TableCell>{item.actor}</TableCell>
                <TableCell>{item.description}</TableCell>
                <TableCell className="max-w-[250px] truncate">{item.market}</TableCell>
                <TableCell>{item.amount || "—"}</TableCell>
                <TableCell>{formatDate(item.timestamp)}</TableCell>
              </TableRow>
            ))}
            {activeTab === "bets-history" && betsHistoryData.map((item) => (
              <TableRow key={item.id} className="border-zinc-800 hover:bg-zinc-900/50">
                <TableCell className="max-w-[250px] truncate">{item.market}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={`${item.position === 'YES' ? 'border-green-500 text-green-400' : 'border-red-500 text-red-400'}`}>
                    {item.position}
                  </Badge>
                </TableCell>
                <TableCell>{item.amount}</TableCell>
                <TableCell>{item.probability}</TableCell>
                <TableCell>
                  <Badge variant={item.status === 'Active' ? 'outline' : 'secondary'} className={`${item.status === 'Active' ? 'border-blue-500 text-blue-400' : 'bg-zinc-900/50'}`}>
                    {item.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  {item.result ? (
                    <span className={`inline-flex items-center ${item.result === 'Won' ? 'text-green-400' : 'text-red-400'}`}>
                      {item.result === 'Won' ? <Check className="mr-1 h-4 w-4" /> : <X className="mr-1 h-4 w-4" />}
                      {item.result}
                    </span>
                  ) : "—"}
                </TableCell>
                <TableCell>{item.payout || "—"}</TableCell>
                <TableCell>{formatDate(item.timestamp)}</TableCell>
              </TableRow>
            ))}
            {activeTab === "predictions" && predictionsData.map((item) => (
              <TableRow key={item.id} className="border-zinc-800 hover:bg-zinc-900/50">
                <TableCell className="max-w-[250px] truncate">{item.market}</TableCell>
                <TableCell>{item.category}</TableCell>
                <TableCell>{item.probability}</TableCell>
                <TableCell>
                  <Badge variant={item.status === 'Open' ? 'outline' : 'secondary'} className={`${item.status === 'Open' ? 'border-blue-500 text-blue-400' : 'bg-zinc-900/50'}`}>
                    {item.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  {item.resolution ? (
                    <Badge variant="outline" className={`${item.resolution === 'YES' ? 'border-green-500 text-green-400' : 'border-red-500 text-red-400'}`}>
                      {item.resolution}
                    </Badge>
                  ) : "—"}
                </TableCell>
                <TableCell>{formatDate(item.expires)}</TableCell>
                <TableCell>{formatDate(item.created)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
} 