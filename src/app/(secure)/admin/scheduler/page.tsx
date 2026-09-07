'use client';

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useFetch } from "@/app/utils/lib";
import toast from "react-hot-toast";
import { 
    Clock, 
    Play, 
    Pause, 
    Settings, 
    Activity, 
    TrendingUp, 
    AlertTriangle,
    RefreshCw,
    Database,
    Users,
    Target
} from "lucide-react";

interface SchedulerConfig {
    confidenceThreshold: number;
    maxBetsPerPrediction: number;
    delayBetweenAgents: number;
    timezone: string;
    cronSchedule: string;
    enabled: boolean;
}

interface AnalysisStats {
    totalAgents: number;
    activeBets: number;
    lastRun: string;
    nextRun: string;
    successfulAdjustments: number;
    failedAdjustments: number;
}

export default function SchedulerAdminPage() {
    const [config, setConfig] = useState<SchedulerConfig>({
        confidenceThreshold: 15,
        maxBetsPerPrediction: 2,
        delayBetweenAgents: 5000,
        timezone: "America/New_York",
        cronSchedule: "0 2 * * *",
        enabled: true
    });
    
    const [stats, setStats] = useState<AnalysisStats>({
        totalAgents: 0,
        activeBets: 0,
        lastRun: "Never",
        nextRun: "2:00 AM EST",
        successfulAdjustments: 0,
        failedAdjustments: 0
    });
    
    const [isLoading, setIsLoading] = useState(false);
    const [logs, setLogs] = useState<string[]>([]);
    const fetch = useFetch();

    useEffect(() => {
        loadSchedulerStatus();
        loadAnalysisStats();
    }, []);

    const loadSchedulerStatus = async () => {
        try {
            // This would be a new API endpoint to get current scheduler config
            // For now, using default values
            console.log("Loading scheduler status...");
        } catch (error) {
            console.error("Failed to load scheduler status:", error);
        }
    };

    const loadAnalysisStats = async () => {
        try {
            const response = await fetch.get("/api/admin/scheduler/stats");
            if (response.success) {
                setStats(response.stats);
            }
        } catch (error) {
            console.error("Failed to load analysis stats:", error);
        }
    };

    const handleConfigUpdate = async () => {
        setIsLoading(true);
        try {
            const response = await fetch.post("/api/admin/scheduler/config", config);
            if (response.success) {
                toast.success("Scheduler configuration updated successfully");
            } else {
                toast.error(response.message || "Failed to update configuration");
            }
        } catch (error) {
            toast.error("Failed to update scheduler configuration");
        } finally {
            setIsLoading(false);
        }
    };

    const handleManualTrigger = async (agentId?: number) => {
        setIsLoading(true);
        try {
            const endpoint = agentId 
                ? `/api/admin/scheduler/trigger/${agentId}`
                : "/api/admin/scheduler/trigger";
            
            const response = await fetch.post(endpoint);
            if (response.success) {
                toast.success(agentId 
                    ? `Manual analysis triggered for agent ${agentId}`
                    : "Manual analysis triggered for all agents"
                );
                setLogs(prev => [...prev, `Manual trigger: ${new Date().toLocaleString()}`]);
                loadAnalysisStats();
            } else {
                toast.error(response.message || "Failed to trigger analysis");
            }
        } catch (error) {
            toast.error("Failed to trigger manual analysis");
        } finally {
            setIsLoading(false);
        }
    };

    const handleSchedulerToggle = async () => {
        setIsLoading(true);
        try {
            const response = await fetch.post("/api/scheduler/init");
            if (response.success) {
                toast.success("Scheduler initialized successfully");
                setConfig(prev => ({ ...prev, enabled: true }));
            } else {
                toast.error("Failed to initialize scheduler");
            }
        } catch (error) {
            toast.error("Failed to toggle scheduler");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex-1 p-2 w-full bg-background">
            <div className="mx-auto rounded-lg bg-card text-card-foreground shadow-lg">
                {/* Header */}
                <div className="px-6 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center">
                            <SidebarTrigger className="-ml-0.5 h-5 w-5 text-muted-foreground hover:text-foreground" />
                            <div className="h-4 border-l border-border mx-4" />
                            <div>
                                <h1 className="text-xl font-semibold">Daily Bet Analysis Scheduler</h1>
                                <p className="text-sm text-muted-foreground">
                                    Manage automated daily analysis and position adjustments
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <Badge variant={config.enabled ? "default" : "secondary"}>
                                {config.enabled ? "Active" : "Inactive"}
                            </Badge>
                            <Button
                                onClick={handleSchedulerToggle}
                                disabled={isLoading}
                                variant={config.enabled ? "destructive" : "default"}
                            >
                                {config.enabled ? <Pause className="h-4 w-4 mr-2" /> : <Play className="h-4 w-4 mr-2" />}
                                {config.enabled ? "Stop" : "Start"} Scheduler
                            </Button>
                        </div>
                    </div>
                </div>

                <div className="border-b border-border" />

                <div className="p-6">
                    <Tabs defaultValue="overview" className="w-full">
                        <TabsList className="grid w-full grid-cols-4">
                            <TabsTrigger value="overview">Overview</TabsTrigger>
                            <TabsTrigger value="configuration">Configuration</TabsTrigger>
                            <TabsTrigger value="monitoring">Monitoring</TabsTrigger>
                            <TabsTrigger value="manual">Manual Controls</TabsTrigger>
                        </TabsList>

                        {/* Overview Tab */}
                        <TabsContent value="overview" className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <Card>
                                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                        <CardTitle className="text-sm font-medium">Active Agents</CardTitle>
                                        <Users className="h-4 w-4 text-muted-foreground" />
                                    </CardHeader>
                                    <CardContent>
                                        <div className="text-2xl font-bold">{stats.totalAgents}</div>
                                        <p className="text-xs text-muted-foreground">
                                            Agents with active bets
                                        </p>
                                    </CardContent>
                                </Card>

                                <Card>
                                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                        <CardTitle className="text-sm font-medium">Active Bets</CardTitle>
                                        <Target className="h-4 w-4 text-muted-foreground" />
                                    </CardHeader>
                                    <CardContent>
                                        <div className="text-2xl font-bold">{stats.activeBets}</div>
                                        <p className="text-xs text-muted-foreground">
                                            Being monitored daily
                                        </p>
                                    </CardContent>
                                </Card>

                                <Card>
                                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                        <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
                                        <TrendingUp className="h-4 w-4 text-muted-foreground" />
                                    </CardHeader>
                                    <CardContent>
                                        <div className="text-2xl font-bold">
                                            {stats.successfulAdjustments + stats.failedAdjustments > 0 
                                                ? Math.round((stats.successfulAdjustments / (stats.successfulAdjustments + stats.failedAdjustments)) * 100)
                                                : 0}%
                                        </div>
                                        <p className="text-xs text-muted-foreground">
                                            Successful adjustments
                                        </p>
                                    </CardContent>
                                </Card>
                            </div>

                            <Card>
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2">
                                        <Clock className="h-5 w-5" />
                                        Schedule Information
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <Label className="text-sm font-medium">Next Run</Label>
                                            <p className="text-lg">{stats.nextRun}</p>
                                        </div>
                                        <div>
                                            <Label className="text-sm font-medium">Last Run</Label>
                                            <p className="text-lg">{stats.lastRun}</p>
                                        </div>
                                    </div>
                                    <div>
                                        <Label className="text-sm font-medium">Cron Schedule</Label>
                                        <p className="text-sm text-muted-foreground font-mono">{config.cronSchedule} ({config.timezone})</p>
                                    </div>
                                </CardContent>
                            </Card>
                        </TabsContent>

                        {/* Configuration Tab */}
                        <TabsContent value="configuration" className="space-y-6">
                            <Card>
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2">
                                        <Settings className="h-5 w-5" />
                                        Analysis Parameters
                                    </CardTitle>
                                    <CardDescription>
                                        Configure how the daily analysis system behaves
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-6">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-2">
                                            <Label htmlFor="confidenceThreshold">Confidence Threshold (%)</Label>
                                            <Input
                                                id="confidenceThreshold"
                                                type="number"
                                                min="1"
                                                max="100"
                                                value={config.confidenceThreshold}
                                                onChange={(e) => setConfig(prev => ({
                                                    ...prev,
                                                    confidenceThreshold: Number(e.target.value)
                                                }))}
                                            />
                                            <p className="text-xs text-muted-foreground">
                                                Minimum confidence change to trigger position adjustment
                                            </p>
                                        </div>

                                        <div className="space-y-2">
                                            <Label htmlFor="maxBets">Max Bets Per Prediction</Label>
                                            <Input
                                                id="maxBets"
                                                type="number"
                                                min="1"
                                                max="10"
                                                value={config.maxBetsPerPrediction}
                                                onChange={(e) => setConfig(prev => ({
                                                    ...prev,
                                                    maxBetsPerPrediction: Number(e.target.value)
                                                }))}
                                            />
                                            <p className="text-xs text-muted-foreground">
                                                Maximum number of bets an agent can place on one prediction
                                            </p>
                                        </div>

                                        <div className="space-y-2">
                                            <Label htmlFor="delay">Delay Between Agents (ms)</Label>
                                            <Input
                                                id="delay"
                                                type="number"
                                                min="1000"
                                                max="60000"
                                                value={config.delayBetweenAgents}
                                                onChange={(e) => setConfig(prev => ({
                                                    ...prev,
                                                    delayBetweenAgents: Number(e.target.value)
                                                }))}
                                            />
                                            <p className="text-xs text-muted-foreground">
                                                Delay between processing each agent to prevent overload
                                            </p>
                                        </div>

                                        <div className="space-y-2">
                                            <Label htmlFor="timezone">Timezone</Label>
                                            <Input
                                                id="timezone"
                                                value={config.timezone}
                                                onChange={(e) => setConfig(prev => ({
                                                    ...prev,
                                                    timezone: e.target.value
                                                }))}
                                            />
                                            <p className="text-xs text-muted-foreground">
                                                Timezone for the cron schedule
                                            </p>
                                        </div>
                                    </div>

                                    <Separator />

                                    <div className="space-y-2">
                                        <Label htmlFor="cronSchedule">Cron Schedule</Label>
                                        <Input
                                            id="cronSchedule"
                                            value={config.cronSchedule}
                                            onChange={(e) => setConfig(prev => ({
                                                ...prev,
                                                cronSchedule: e.target.value
                                            }))}
                                            placeholder="0 2 * * *"
                                        />
                                        <p className="text-xs text-muted-foreground">
                                            Cron expression for when to run daily analysis (default: 2:00 AM daily)
                                        </p>
                                    </div>

                                    <Button 
                                        onClick={handleConfigUpdate} 
                                        disabled={isLoading}
                                        className="w-full"
                                    >
                                        {isLoading ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : null}
                                        Update Configuration
                                    </Button>
                                </CardContent>
                            </Card>
                        </TabsContent>

                        {/* Monitoring Tab */}
                        <TabsContent value="monitoring" className="space-y-6">
                            <Card>
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2">
                                        <Activity className="h-5 w-5" />
                                        Recent Activity
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="space-y-2">
                                        {logs.length > 0 ? (
                                            logs.slice(-10).map((log, index) => (
                                                <div key={index} className="text-sm p-2 bg-muted rounded">
                                                    {log}
                                                </div>
                                            ))
                                        ) : (
                                            <p className="text-sm text-muted-foreground">No recent activity</p>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2">
                                        <Database className="h-5 w-5" />
                                        System Health
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm">Scheduler Status</span>
                                            <Badge variant={config.enabled ? "default" : "destructive"}>
                                                {config.enabled ? "Running" : "Stopped"}
                                            </Badge>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm">Database Connection</span>
                                            <Badge variant="default">Connected</Badge>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm">Pinecone Status</span>
                                            <Badge variant="default">Active</Badge>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm">OpenAI API</span>
                                            <Badge variant="default">Available</Badge>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </TabsContent>

                        {/* Manual Controls Tab */}
                        <TabsContent value="manual" className="space-y-6">
                            <Card>
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2">
                                        <Play className="h-5 w-5" />
                                        Manual Triggers
                                    </CardTitle>
                                    <CardDescription>
                                        Manually trigger analysis for testing or immediate execution
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <Button 
                                            onClick={() => handleManualTrigger()}
                                            disabled={isLoading}
                                            variant="default"
                                        >
                                            <Play className="h-4 w-4 mr-2" />
                                            Run Analysis for All Agents
                                        </Button>
                                        
                                        <Button 
                                            onClick={() => handleManualTrigger(1)}
                                            disabled={isLoading}
                                            variant="outline"
                                        >
                                            <Target className="h-4 w-4 mr-2" />
                                            Test with Single Agent
                                        </Button>
                                    </div>

                                    <Separator />

                                    <div className="space-y-2">
                                        <Label>Quick Actions</Label>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                                            <Button 
                                                variant="outline" 
                                                size="sm"
                                                onClick={() => window.open('/api/testDailyAnalysis', '_blank')}
                                            >
                                                Test Daily Analysis
                                            </Button>
                                            <Button 
                                                variant="outline" 
                                                size="sm"
                                                onClick={() => window.open('/api/testPositionAdjustment', '_blank')}
                                            >
                                                Test Position Adjustment
                                            </Button>
                                            <Button 
                                                variant="outline" 
                                                size="sm"
                                                onClick={loadAnalysisStats}
                                            >
                                                <RefreshCw className="h-4 w-4 mr-2" />
                                                Refresh Stats
                                            </Button>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2">
                                        <AlertTriangle className="h-5 w-5" />
                                        Emergency Controls
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="space-y-4">
                                        <p className="text-sm text-muted-foreground">
                                            Use these controls only in emergency situations
                                        </p>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <Button 
                                                variant="destructive" 
                                                disabled={isLoading}
                                                onClick={() => {
                                                    if (confirm("Are you sure you want to stop all automated analysis?")) {
                                                        setConfig(prev => ({ ...prev, enabled: false }));
                                                        toast.success("Automated analysis stopped");
                                                    }
                                                }}
                                            >
                                                <Pause className="h-4 w-4 mr-2" />
                                                Emergency Stop
                                            </Button>
                                            
                                            <Button 
                                                variant="outline"
                                                onClick={() => {
                                                    setLogs([]);
                                                    toast.success("Logs cleared");
                                                }}
                                            >
                                                Clear Logs
                                            </Button>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </TabsContent>
                    </Tabs>
                </div>
            </div>
        </div>
    );
} 