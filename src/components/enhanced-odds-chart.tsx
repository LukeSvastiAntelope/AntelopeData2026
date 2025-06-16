"use client"

import React, { useState, useEffect } from "react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { Line, LineChart, CartesianGrid, XAxis, YAxis, ResponsiveContainer } from "recharts"
import { IBet } from "@/app/utils/interface"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { TrendingUp, TrendingDown, Minus, Brain, Target } from "lucide-react"

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

interface MarketSentimentData {
  date: string;
  displayDate: string;
  yesOdds: number;
  noOdds: number;
  yesPercentage: number;
  noPercentage: number;
  agentCount: number;
  confidenceChange: number;
  dataSource: 'bet' | 'analysis';
  reasoning?: string;
  totalAmount?: number;
  betCount?: number;
}

interface EnhancedOddsChartProps {
  bets: IBet[];
  predictionId: number;
  showAnalysisData?: boolean;
}

export function EnhancedOddsChart({ bets, predictionId, showAnalysisData = true }: EnhancedOddsChartProps) {
  const [chartData, setChartData] = useState<MarketSentimentData[]>([]);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'combined' | 'bets' | 'analysis'>('combined');
  const [analysisData, setAnalysisData] = useState<MarketSentimentData[]>([]);

  // Process bets data to create time series of accumulated odds
  const processBetsData = (): MarketSentimentData[] => {
    if (!bets || bets.length === 0) return [];

    // Sort bets by creation date
    const sortedBets = [...bets].sort((a, b) => 
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    const oddsHistory: MarketSentimentData[] = [];
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
      agentCount: 0,
      confidenceChange: 0,
      dataSource: 'bet',
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
        agentCount: 1,
        confidenceChange: 0,
        dataSource: 'bet',
        totalAmount,
        betCount: index + 1
      });
    });

    return oddsHistory;
  };

  // Fetch analysis-based odds data
  const fetchAnalysisData = async () => {
    if (!showAnalysisData) return;
    
    setLoading(true);
    try {
      const response = await fetch(`/api/predictions/${predictionId}/odds-history?days=30&includeBets=false&includeAnalysis=true`);
      if (response.ok) {
        const data = await response.json();
        setAnalysisData(data.oddsHistory || []);
      }
    } catch (error) {
      console.error('Error fetching analysis data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Combine and filter data based on view mode
  const getCombinedData = (): MarketSentimentData[] => {
    const betsData = processBetsData();
    
    const combinedData: MarketSentimentData[] = [];
    
    if (viewMode === 'bets' || viewMode === 'combined') {
      combinedData.push(...betsData);
    }
    
    if (viewMode === 'analysis' || viewMode === 'combined') {
      combinedData.push(...analysisData);
    }

    // Sort by date and remove duplicates (prefer analysis data)
    const sortedData = combinedData.sort((a, b) => 
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    // Remove duplicates by date, preferring analysis data
    const uniqueData = new Map<string, MarketSentimentData>();
    for (const item of sortedData) {
      const existing = uniqueData.get(item.date);
      if (!existing || (item.dataSource === 'analysis' && existing.dataSource === 'bet')) {
        uniqueData.set(item.date, item);
      }
    }

    return Array.from(uniqueData.values()).sort((a, b) => 
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );
  };

  useEffect(() => {
    fetchAnalysisData();
  }, [predictionId, showAnalysisData]);

  useEffect(() => {
    setChartData(getCombinedData());
  }, [bets, analysisData, viewMode]);

  const getConfidenceIcon = (change: number) => {
    if (change > 5) return <TrendingUp className="w-3 h-3 text-green-500" />;
    if (change < -5) return <TrendingDown className="w-3 h-3 text-red-500" />;
    return <Minus className="w-3 h-3 text-gray-500" />;
  };

  const getDataSourceIcon = (source: 'bet' | 'analysis') => {
    return source === 'analysis' ? 
      <Brain className="w-3 h-3 text-blue-500" /> : 
      <Target className="w-3 h-3 text-purple-500" />;
  };

  if (chartData.length === 0) {
    return (
      <Card className="bg-card border-border">
        <CardHeader>
          <h3 className="text-lg font-semibold">Market Odds Evolution</h3>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-[300px] text-muted-foreground">
            {loading ? 'Loading market data...' : 'No market data available'}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">Market Odds Evolution</h3>
            <p className="text-sm text-muted-foreground">
              {viewMode === 'combined' && 'Shows both betting activity and daily analysis sentiment'}
              {viewMode === 'bets' && 'Shows how odds changed as agents placed bets'}
              {viewMode === 'analysis' && 'Shows daily market sentiment from agent analysis'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant={viewMode === 'combined' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('combined')}
              className="text-xs"
            >
              Combined
            </Button>
            <Button
              variant={viewMode === 'bets' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('bets')}
              className="text-xs"
            >
              Bets Only
            </Button>
            {showAnalysisData && (
              <Button
                variant={viewMode === 'analysis' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('analysis')}
                className="text-xs"
              >
                Analysis Only
              </Button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-6 text-sm text-muted-foreground mt-2">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-green-500"></div>
            <span>Yes</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-red-500"></div>
            <span>No</span>
          </div>
          <div className="flex items-center gap-2">
            <Brain className="w-3 h-3 text-blue-500" />
            <span>Analysis</span>
          </div>
          <div className="flex items-center gap-2">
            <Target className="w-3 h-3 text-purple-500" />
            <span>Bets</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-0 pt-4 sm:px-0 sm:pt-6">
        <ChartContainer config={chartConfig} className="h-[350px] w-full">
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
                    const data = payload[0].payload as MarketSentimentData;
                    return (
                      <div className="bg-background border border-border rounded-lg p-3 shadow-lg max-w-xs">
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <p className="font-medium">{label}</p>
                          <div className="flex items-center gap-1">
                            {getDataSourceIcon(data.dataSource)}
                            <Badge variant="outline" className="text-xs">
                              {data.dataSource === 'analysis' ? 'Analysis' : 'Bet'}
                            </Badge>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center justify-between gap-4">
                            <span className="text-green-500">Yes:</span>
                            <span>{data.yesPercentage}% (x{data.yesOdds})</span>
                          </div>
                          <div className="flex items-center justify-between gap-4">
                            <span className="text-red-500">No:</span>
                            <span>{data.noPercentage}% (x{data.noOdds})</span>
                          </div>
                          {data.dataSource === 'analysis' && data.confidenceChange !== 0 && (
                            <div className="flex items-center justify-between gap-4">
                              <span className="text-blue-500">Confidence:</span>
                              <div className="flex items-center gap-1">
                                {getConfidenceIcon(data.confidenceChange)}
                                <span>{data.confidenceChange > 0 ? '+' : ''}{data.confidenceChange.toFixed(1)}%</span>
                              </div>
                            </div>
                          )}
                          <div className="border-t border-border pt-1 mt-2">
                            {data.dataSource === 'bet' && (
                              <>
                                <div className="flex items-center justify-between gap-4 text-sm text-muted-foreground">
                                  <span>Total Volume:</span>
                                  <span>{data.totalAmount} ANML</span>
                                </div>
                                <div className="flex items-center justify-between gap-4 text-sm text-muted-foreground">
                                  <span>Bets:</span>
                                  <span>{data.betCount}</span>
                                </div>
                              </>
                            )}
                            {data.dataSource === 'analysis' && (
                              <>
                                <div className="flex items-center justify-between gap-4 text-sm text-muted-foreground">
                                  <span>Agents:</span>
                                  <span>{data.agentCount}</span>
                                </div>
                                {data.reasoning && (
                                  <div className="text-xs text-muted-foreground mt-1 max-w-xs">
                                    {data.reasoning}
                                  </div>
                                )}
                              </>
                            )}
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
                dot={(props) => {
                  const data = props.payload as MarketSentimentData;
                  return (
                    <circle
                      cx={props.cx}
                      cy={props.cy}
                      r={4}
                      fill="#10b981"
                      stroke={data?.dataSource === 'analysis' ? '#3b82f6' : '#10b981'}
                      strokeWidth={data?.dataSource === 'analysis' ? 3 : 2}
                      strokeDasharray={data?.dataSource === 'analysis' ? '2,2' : 'none'}
                    />
                  );
                }}
                activeDot={{ r: 6, stroke: "#10b981", strokeWidth: 2 }}
              />
              <Line
                type="monotone"
                dataKey="noOdds"
                stroke="#ef4444"
                strokeWidth={2}
                dot={(props) => {
                  const data = props.payload as MarketSentimentData;
                  return (
                    <circle
                      cx={props.cx}
                      cy={props.cy}
                      r={4}
                      fill="#ef4444"
                      stroke={data?.dataSource === 'analysis' ? '#3b82f6' : '#ef4444'}
                      strokeWidth={data?.dataSource === 'analysis' ? 3 : 2}
                      strokeDasharray={data?.dataSource === 'analysis' ? '2,2' : 'none'}
                    />
                  );
                }}
                activeDot={{ r: 6, stroke: "#ef4444", strokeWidth: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartContainer>
      </CardContent>
    </Card>
  );
} 