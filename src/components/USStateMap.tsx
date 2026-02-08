'use client'

import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

/**
 * US State choropleth map component for political survey visualization.
 * 
 * Uses a simplified rectangular cartogram approach (each state is a cell)
 * for clear, accessible visualization without requiring external map libraries.
 */

interface StateData {
  state: string
  count: number
  percentage?: number
  sentiment?: number // -1 to 1 scale for political sentiment
}

interface USStateMapProps {
  data: StateData[]
  title?: string
  description?: string
  colorMode?: 'count' | 'sentiment' // count = blue gradient, sentiment = red/blue
}

// State abbreviations to full names mapping
const STATE_ABBREVS: Record<string, string> = {
  'Alabama': 'AL', 'Alaska': 'AK', 'Arizona': 'AZ', 'Arkansas': 'AR',
  'California': 'CA', 'Colorado': 'CO', 'Connecticut': 'CT', 'Delaware': 'DE',
  'Florida': 'FL', 'Georgia': 'GA', 'Hawaii': 'HI', 'Idaho': 'ID',
  'Illinois': 'IL', 'Indiana': 'IN', 'Iowa': 'IA', 'Kansas': 'KS',
  'Kentucky': 'KY', 'Louisiana': 'LA', 'Maine': 'ME', 'Maryland': 'MD',
  'Massachusetts': 'MA', 'Michigan': 'MI', 'Minnesota': 'MN', 'Mississippi': 'MS',
  'Missouri': 'MO', 'Montana': 'MT', 'Nebraska': 'NE', 'Nevada': 'NV',
  'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY',
  'North Carolina': 'NC', 'North Dakota': 'ND', 'Ohio': 'OH', 'Oklahoma': 'OK',
  'Oregon': 'OR', 'Pennsylvania': 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC',
  'South Dakota': 'SD', 'Tennessee': 'TN', 'Texas': 'TX', 'Utah': 'UT',
  'Vermont': 'VT', 'Virginia': 'VA', 'Washington': 'WA', 'West Virginia': 'WV',
  'Wisconsin': 'WI', 'Wyoming': 'WY', 'District of Columbia': 'DC'
}

// Tile grid map layout (row, col) for US states
// Based on the NPR-style tile grid map
const GRID_LAYOUT: Record<string, [number, number]> = {
  'AK': [0, 0], 'ME': [0, 10],
  'WI': [1, 5], 'VT': [1, 9], 'NH': [1, 10],
  'WA': [2, 0], 'ID': [2, 1], 'MT': [2, 2], 'ND': [2, 3], 'MN': [2, 4],
  'IL': [2, 5], 'MI': [2, 6], 'NY': [2, 8], 'MA': [2, 9], 'CT': [2, 10],
  'OR': [3, 0], 'NV': [3, 1], 'WY': [3, 2], 'SD': [3, 3], 'IA': [3, 4],
  'IN': [3, 5], 'OH': [3, 6], 'PA': [3, 7], 'NJ': [3, 8], 'RI': [3, 9],
  'CA': [4, 0], 'UT': [4, 1], 'CO': [4, 2], 'NE': [4, 3], 'MO': [4, 4],
  'KY': [4, 5], 'WV': [4, 6], 'VA': [4, 7], 'MD': [4, 8], 'DE': [4, 9],
  'AZ': [5, 1], 'NM': [5, 2], 'KS': [5, 3], 'AR': [5, 4],
  'TN': [5, 5], 'NC': [5, 6], 'SC': [5, 7], 'DC': [5, 8],
  'OK': [6, 3], 'LA': [6, 4], 'MS': [6, 5], 'AL': [6, 6], 'GA': [6, 7],
  'HI': [7, 0], 'TX': [7, 3], 'FL': [7, 7],
}

function getCountColor(value: number, max: number): string {
  if (max === 0) return 'hsl(0, 0%, 95%)'
  const intensity = value / max
  // Gray to primary gradient
  const lightness = 95 - (intensity * 55)
  return `hsl(220, ${Math.round(intensity * 60)}%, ${Math.round(lightness)}%)`
}

function getSentimentColor(value: number): string {
  // -1 (red/conservative) to +1 (blue/progressive)
  if (value > 0) {
    const intensity = Math.min(1, value)
    return `hsl(220, ${Math.round(intensity * 80)}%, ${Math.round(70 - intensity * 30)}%)`
  } else {
    const intensity = Math.min(1, Math.abs(value))
    return `hsl(0, ${Math.round(intensity * 80)}%, ${Math.round(70 - intensity * 30)}%)`
  }
}

export default function USStateMap({ data, title, description, colorMode = 'count' }: USStateMapProps) {
  const { stateMap, maxCount } = useMemo(() => {
    const map: Record<string, StateData> = {}
    let max = 0
    data.forEach(d => {
      const abbrev = STATE_ABBREVS[d.state] || d.state
      map[abbrev] = d
      if (d.count > max) max = d.count
    })
    return { stateMap: map, maxCount: max }
  }, [data])

  const totalResponses = data.reduce((sum, d) => sum + d.count, 0)
  const statesRepresented = data.filter(d => d.count > 0).length

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title || 'Geographic Distribution'}</CardTitle>
        <CardDescription>
          {description || `${totalResponses} responses across ${statesRepresented} states`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="w-full overflow-x-auto">
          <div className="grid gap-1 min-w-[500px]" style={{ gridTemplateColumns: 'repeat(11, 1fr)', gridTemplateRows: 'repeat(8, 1fr)' }}>
            {Object.entries(GRID_LAYOUT).map(([abbrev, [row, col]]) => {
              const stateData = stateMap[abbrev]
              const count = stateData?.count || 0
              const bgColor = colorMode === 'sentiment' && stateData?.sentiment !== undefined
                ? getSentimentColor(stateData.sentiment)
                : getCountColor(count, maxCount)

              return (
                <div
                  key={abbrev}
                  className="aspect-square flex flex-col items-center justify-center rounded text-xs border border-border/50 cursor-default transition-colors hover:ring-1 hover:ring-primary"
                  style={{
                    gridRow: row + 1,
                    gridColumn: col + 1,
                    backgroundColor: bgColor,
                  }}
                  title={`${Object.entries(STATE_ABBREVS).find(([_, a]) => a === abbrev)?.[0] || abbrev}: ${count} responses`}
                >
                  <span className="font-bold text-[10px] leading-none">{abbrev}</span>
                  {count > 0 && (
                    <span className="text-[8px] leading-none mt-0.5 opacity-75">{count}</span>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center justify-between mt-4 pt-4 border-t">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <div className="w-3 h-3 rounded" style={{ backgroundColor: getCountColor(0, 1) }} />
            <span>No data</span>
            <div className="w-12 h-3 rounded" style={{ background: `linear-gradient(to right, ${getCountColor(1, maxCount || 1)}, ${getCountColor(maxCount || 1, maxCount || 1)})` }} />
            <span>Most responses</span>
          </div>
          <div className="flex gap-2">
            <Badge variant="outline" className="text-xs">{statesRepresented} states</Badge>
            <Badge variant="outline" className="text-xs">{totalResponses} responses</Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
