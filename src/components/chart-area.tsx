"use client"

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Filler,
  Legend,
  TimeScale,
  TooltipItem,
} from "chart.js"
import { Scatter } from "react-chartjs-2"
import 'chartjs-adapter-date-fns'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { IBet } from "@/types/bet"

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Filler,
  Legend,
  TimeScale
)

interface ChartAreaProps {
  bets: IBet[]
}

export function ChartArea({ bets }: ChartAreaProps) {
  const scatterData = {
    datasets: [
      {
        label: "",
        data: bets.map((bet, index) => {
          return {
            x: bet.resolution_date ? new Date(bet.resolution_date) : null,
            y: index + 1, // or any number that spaces them out
            betName: bet.description,
          }
        }),
        backgroundColor: "#36A2EB",
      },
    ],
  }

  const scatterOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      tooltip: {
        callbacks: {
          label: function (context: TooltipItem<'scatter'>) {
            return (context.raw as { betName: string }).betName || "Unknown Bet"
          },
        },
      },
      legend: {
        display: false,
      },
      title: {
        display: false,
        text: "Bet Resolution Timeline",
      },
    },
    scales: {
      x: {
        type: 'time' as const,
        time: {
          unit: 'day' as const,
        },
        ticks: { color: 'hsl(var(--foreground))' }
      },
      y: {
        ticks: { color: 'hsl(var(--foreground))' }
      }
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Total Visitors</CardTitle>
        <CardDescription>Total for the last 3 months</CardDescription>
        <Tabs defaultValue="3months" className="absolute right-4 top-4">
          <TabsList>
            <TabsTrigger value="3months">Last 3 months</TabsTrigger>
            <TabsTrigger value="30days">Last 30 days</TabsTrigger>
            <TabsTrigger value="7days">Last 7 days</TabsTrigger>
          </TabsList>
        </Tabs>
      </CardHeader>
      <CardContent>
        <div className="h-[200px]">
          {bets && bets.length > 0 ? (
            <Scatter data={scatterData} options={scatterOptions} />
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              No bets to display in graph
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
} 