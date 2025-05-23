"use client"

import React from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export function ChartAreaInteractive() {
  // Generate some dummy data for the chart
  const chartData = generateWaveData()

  return (
    <Card className="bg-black border-zinc-800">
      <CardHeader className="flex flex-row items-center justify-end space-y-0 pb-2">
        <Tabs defaultValue="month3" className="w-auto">
          <TabsList>
            <TabsTrigger value="month3">
              Last 3 months
            </TabsTrigger>
            <TabsTrigger value="month1">
              Last 30 days
            </TabsTrigger>
            <TabsTrigger value="week1">
              Last 7 days
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </CardHeader>
      <CardContent className="px-0 pb-4">
        <div className="h-[300px] w-full">
          <WaveChart data={chartData} />
        </div>
        <div className="flex justify-between px-6 pt-2 text-sm text-muted-foreground">
          <div>Jun 23</div>
          <div>Jun 24</div>
          <div>Jun 25</div>
          <div>Jun 26</div>
          <div>Jun 27</div>
          <div>Jun 28</div>
          <div>Jun 29</div>
        </div>
      </CardContent>
    </Card>
  )
}

function WaveChart({ data }: { data: { x: number; y: number }[] }) {
  const maxY = Math.max(...data.map(point => point.y))
  const minY = Math.min(...data.map(point => point.y))
  const height = 300
  const width = 100 // percentage
  
  // Create the SVG path data
  const line = data.map((point, i) => {
    const x = (point.x / data.length) * width
    const y = height - ((point.y - minY) / (maxY - minY)) * height * 0.8 - 20
    return `${i === 0 ? "M" : "L"} ${x} ${y}`
  }).join(" ")
  
  // Create another path for the area under the curve
  const area = `${line} L ${width} ${height} L 0 ${height} Z`
  
  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="h-full w-full">
      <defs>
        <linearGradient id="grad1" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" style={{ stopColor: "rgb(59, 130, 246)", stopOpacity: 0.5 }} />
          <stop offset="100%" style={{ stopColor: "rgb(59, 130, 246)", stopOpacity: 0.05 }} />
        </linearGradient>
        <linearGradient id="grad2" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" style={{ stopColor: "rgb(16, 185, 129)", stopOpacity: 0.5 }} />
          <stop offset="100%" style={{ stopColor: "rgb(16, 185, 129)", stopOpacity: 0.05 }} />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#grad1)" />
      
      {/* We'll add another wave with a slight offset for a layered effect */}
      <path 
        d={data.map((point, i) => {
          const x = (point.x / data.length) * width
          const y = height - ((point.y * 0.6 - minY) / (maxY - minY)) * height * 0.8 - 40
          return `${i === 0 ? "M" : "L"} ${x} ${y}`
        }).join(" ") + ` L ${width} ${height} L 0 ${height} Z`}
        fill="url(#grad2)"
        opacity={0.5}
      />
    </svg>
  )
}

function generateWaveData() {
  const count = 100
  const result = []
  
  for (let i = 0; i < count; i++) {
    const x = i
    // Create a wave pattern with some randomness
    const y = Math.sin(i / 10) * 20 + Math.sin(i / 6) * 10 + Math.random() * 5
    result.push({ x, y })
  }
  
  return result
} 