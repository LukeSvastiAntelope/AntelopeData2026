"use client"

import React from "react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { Line, LineChart, CartesianGrid, XAxis, YAxis, ResponsiveContainer } from "recharts"
import { IBet } from "@/app/utils/interface"

const chartConfig = {
  yesOdds: {
    label: "Yes Odds",
    color: "#10b981",
  },
  noOdds: {
    label: "No Odds", 
    color: "#ef4444",
  },
} satisfies ChartConfig

interface AccumulatedOddsChartProps {
  bets: IBet[];
}

export function AccumulatedOddsChart({ bets }: AccumulatedOddsChartProps) {
  // Process bets data to create time series of accumulated odds
  const processOddsData = () => {
    if (!bets || bets.length === 0) return [];

    // Sort bets by creation date
    const sortedBets = [...bets].sort((a, b) => 
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    const oddsHistory = [];
            const runningTotals = { yes: 0, no: 0 };

    // Add initial point (before any bets)
    const firstBetDate = new Date(sortedBets[0].created_at);
    const dayBefore = new Date(firstBetDate);
    dayBefore.setDate(dayBefore.getDate() - 1);
    
    oddsHistory.push({
      date: dayBefore.toISOString().split('T')[0],
      displayDate: dayBefore.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric' 
      }),
      yesOdds: 2.0, // 50% probability = 2.0 odds
      noOdds: 2.0,
      yesPercentage: 50,
      noPercentage: 50,
      totalAmount: 0,
      betCount: 0
    });

    // Process each bet chronologically
    sortedBets.forEach((bet, index) => {
      // Update running totals
      if (bet.choice.toLowerCase() === 'yes') {
        runningTotals.yes += bet.amount;
      } else if (bet.choice.toLowerCase() === 'no') {
        runningTotals.no += bet.amount;
      }

      const totalAmount = runningTotals.yes + runningTotals.no;
      
      // Calculate percentages and odds
      let yesPercentage = 50;
      let noPercentage = 50;
      let yesOdds = 2.0;
      let noOdds = 2.0;

      if (totalAmount > 0) {
        yesPercentage = (runningTotals.yes / totalAmount) * 100;
        noPercentage = (runningTotals.no / totalAmount) * 100;
        
        // Calculate odds (100 / percentage)
        yesOdds = yesPercentage > 0 ? 100 / yesPercentage : 999;
        noOdds = noPercentage > 0 ? 100 / noPercentage : 999;
        
        // Cap odds at reasonable maximum for display
        yesOdds = Math.min(yesOdds, 50);
        noOdds = Math.min(noOdds, 50);
      }

      const betDate = new Date(bet.created_at);
      oddsHistory.push({
        date: betDate.toISOString().split('T')[0],
        displayDate: betDate.toLocaleDateString('en-US', { 
          month: 'short', 
          day: 'numeric' 
        }),
        yesOdds: Number(yesOdds.toFixed(2)),
        noOdds: Number(noOdds.toFixed(2)),
        yesPercentage: Number(yesPercentage.toFixed(1)),
        noPercentage: Number(noPercentage.toFixed(1)),
        totalAmount,
        betCount: index + 1
      });
    });

    return oddsHistory;
  };

  const chartData = processOddsData();

  if (chartData.length === 0) {
    return (
      <Card className="bg-card border-border">
        <CardHeader>
          <h3 className="text-lg font-semibold">Accumulated Odds Over Time</h3>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-[300px] text-muted-foreground">
            No betting data available
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Accumulated Odds Over Time</h3>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-green-500"></div>
              <span>Yes</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-red-500"></div>
              <span>No</span>
            </div>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          Shows how market odds evolved as agents placed bets over time
        </p>
      </CardHeader>
      <CardContent className="px-0 pt-4 sm:px-0 sm:pt-6">
        <ChartContainer config={chartConfig} className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="displayDate"
                tickLine={false}
                axisLine={false}
                className="text-muted-foreground"
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                className="text-muted-foreground"
                label={{ value: 'Odds (x)', angle: -90, position: 'insideLeft' }}
                domain={[1, 'dataMax']}
              />
              <ChartTooltip 
                content={({ active, payload, label }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <div className="bg-background border border-border rounded-lg p-3 shadow-lg">
                        <p className="font-medium">{label}</p>
                        <div className="space-y-1 mt-2">
                          <div className="flex items-center justify-between gap-4">
                            <span className="text-green-500">Yes:</span>
                            <span>{data.yesPercentage}% (x{data.yesOdds})</span>
                          </div>
                          <div className="flex items-center justify-between gap-4">
                            <span className="text-red-500">No:</span>
                            <span>{data.noPercentage}% (x{data.noOdds})</span>
                          </div>
                          <div className="border-t border-border pt-1 mt-2">
                            <div className="flex items-center justify-between gap-4 text-sm text-muted-foreground">
                              <span>Total Volume:</span>
                              <span>{data.totalAmount} ANML</span>
                            </div>
                            <div className="flex items-center justify-between gap-4 text-sm text-muted-foreground">
                              <span>Bets:</span>
                              <span>{data.betCount}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Line
                type="monotone"
                dataKey="yesOdds"
                stroke="#10b981"
                strokeWidth={2}
                dot={{ fill: "#10b981", strokeWidth: 2, r: 4 }}
                activeDot={{ r: 6, stroke: "#10b981", strokeWidth: 2 }}
              />
              <Line
                type="monotone"
                dataKey="noOdds"
                stroke="#ef4444"
                strokeWidth={2}
                dot={{ fill: "#ef4444", strokeWidth: 2, r: 4 }}
                activeDot={{ r: 6, stroke: "#ef4444", strokeWidth: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartContainer>
      </CardContent>
    </Card>
  );
} 