"use client"

import React from "react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { Area, AreaChart, CartesianGrid, XAxis } from "recharts"

const chartConfig = {
  primary: {
    label: "Primary Metric",
    color: "#3b82f6",
  },
  secondary: {
    label: "Secondary Metric", 
    color: "#10b981",
  },
} satisfies ChartConfig

export function ChartAreaInteractive() {
  // Generate realistic chart data for different time periods
  const generateChartData = (days: number) => {
    const data = []
    const now = new Date()
    
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(now)
      date.setDate(date.getDate() - i)
      
      // Create more realistic data with trends
      const baseValue = 100 + Math.sin(i / 10) * 20
      const trend = (days - i) * 0.5 // Slight upward trend
      const noise = (Math.random() - 0.5) * 15
      
      const primary = Math.max(0, baseValue + trend + noise)
      const secondary = Math.max(0, primary * 0.7 + (Math.random() - 0.5) * 10)
      
      data.push({
        date: date.toISOString().split('T')[0],
        primary: Math.round(primary),
        secondary: Math.round(secondary),
        displayDate: date.toLocaleDateString('en-US', { 
          month: 'short', 
          day: 'numeric' 
        })
      })
    }
    
    return data
  }

  const chartData = {
    week1: generateChartData(7),
    month1: generateChartData(30),
    month3: generateChartData(90)
  }

  // Debug logging
  console.log('Chart data generated:', {
    week1: chartData.week1.length,
    month1: chartData.month1.length,
    month3: chartData.month3.length,
    sampleData: chartData.month3.slice(0, 3)
  })

  return (
    <Tabs defaultValue="month3" className="w-full">
      <Card className="bg-card border-border">
        <CardHeader className="flex flex-row items-center justify-end space-y-0 pb-2">
          <TabsList className="bg-muted border border-border">
            <TabsTrigger 
              value="month3"
              className="data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
            >
              Last 3 months
            </TabsTrigger>
            <TabsTrigger 
              value="month1"
              className="data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
            >
              Last 30 days
            </TabsTrigger>
            <TabsTrigger 
              value="week1"
              className="data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
            >
              Last 7 days
            </TabsTrigger>
          </TabsList>
        </CardHeader>
        
        <TabsContent value="week1" className="mt-0">
          <CardContent className="px-0 pt-4 sm:px-0 sm:pt-6">
            <ChartContainer config={chartConfig} className="h-[300px] w-full">
              <AreaChart data={chartData.week1}>
                <defs>
                  <linearGradient id="fillPrimary" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="5%"
                      stopColor="#3b82f6"
                      stopOpacity={0.8}
                    />
                    <stop
                      offset="95%"
                      stopColor="#3b82f6"
                      stopOpacity={0.1}
                    />
                  </linearGradient>
                  <linearGradient id="fillSecondary" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="5%"
                      stopColor="#10b981"
                      stopOpacity={0.6}
                    />
                    <stop
                      offset="95%"
                      stopColor="#10b981"
                      stopOpacity={0.1}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="displayDate"
                  tickLine={false}
                  axisLine={false}
                  className="text-muted-foreground"
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Area
                  dataKey="secondary"
                  type="monotone"
                  fill="url(#fillSecondary)"
                  stroke="#10b981"
                  strokeWidth={2}
                />
                <Area
                  dataKey="primary"
                  type="monotone"
                  fill="url(#fillPrimary)"
                  stroke="#3b82f6"
                  strokeWidth={2}
                />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </TabsContent>
        
        <TabsContent value="month1" className="mt-0">
          <CardContent className="px-0 pt-4 sm:px-0 sm:pt-6">
            <ChartContainer config={chartConfig} className="h-[300px] w-full">
              <AreaChart data={chartData.month1}>
                <defs>
                  <linearGradient id="fillPrimary" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="5%"
                      stopColor="#3b82f6"
                      stopOpacity={0.8}
                    />
                    <stop
                      offset="95%"
                      stopColor="#3b82f6"
                      stopOpacity={0.1}
                    />
                  </linearGradient>
                  <linearGradient id="fillSecondary" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="5%"
                      stopColor="#10b981"
                      stopOpacity={0.6}
                    />
                    <stop
                      offset="95%"
                      stopColor="#10b981"
                      stopOpacity={0.1}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="displayDate"
                  tickLine={false}
                  axisLine={false}
                  className="text-muted-foreground"
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Area
                  dataKey="secondary"
                  type="monotone"
                  fill="url(#fillSecondary)"
                  stroke="#10b981"
                  strokeWidth={2}
                />
                <Area
                  dataKey="primary"
                  type="monotone"
                  fill="url(#fillPrimary)"
                  stroke="#3b82f6"
                  strokeWidth={2}
                />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </TabsContent>
        
        <TabsContent value="month3" className="mt-0">
          <CardContent className="px-0 pt-4 sm:px-0 sm:pt-6">
            <ChartContainer config={chartConfig} className="h-[300px] w-full">
              <AreaChart data={chartData.month3}>
                <defs>
                  <linearGradient id="fillPrimary" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="5%"
                      stopColor="#3b82f6"
                      stopOpacity={0.8}
                    />
                    <stop
                      offset="95%"
                      stopColor="#3b82f6"
                      stopOpacity={0.1}
                    />
                  </linearGradient>
                  <linearGradient id="fillSecondary" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="5%"
                      stopColor="#10b981"
                      stopOpacity={0.6}
                    />
                    <stop
                      offset="95%"
                      stopColor="#10b981"
                      stopOpacity={0.1}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="displayDate"
                  tickLine={false}
                  axisLine={false}
                  className="text-muted-foreground"
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Area
                  dataKey="secondary"
                  type="monotone"
                  fill="url(#fillSecondary)"
                  stroke="#10b981"
                  strokeWidth={2}
                />
                <Area
                  dataKey="primary"
                  type="monotone"
                  fill="url(#fillPrimary)"
                  stroke="#3b82f6"
                  strokeWidth={2}
                />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </TabsContent>
      </Card>
    </Tabs>
  )
} 