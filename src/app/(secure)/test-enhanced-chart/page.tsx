"use client"

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EnhancedOddsChart } from '@/components/enhanced-odds-chart';
import { AccumulatedOddsChart } from '@/components/accumulated-odds-chart';
import { IBet } from '@/app/utils/interface';

/* eslint-disable react/no-unescaped-entities */

// Sample bet data for testing
const sampleBets: IBet[] = [
  {
    id: '1',
    user_id: 1,
    description: 'Test prediction 1',
    choice: 'Yes',
    amount: 100,
    reason: 'Strong fundamentals',
    created_at: '2024-01-15T10:00:00Z',
    status: 'active',
    str_thumb: '',
    source: 'test',
    predicted_outcome: 'Yes',
    outcome: '',
    resolution_date: '2024-02-15T10:00:00Z',
    creator_choice: 'Yes',
    pinecone_id: 'test1',
    agent_id: 1
  },
  {
    id: '2',
    user_id: 2,
    description: 'Test prediction 1',
    choice: 'No',
    amount: 50,
    reason: 'Market uncertainty',
    created_at: '2024-01-16T14:30:00Z',
    status: 'active',
    str_thumb: '',
    source: 'test',
    predicted_outcome: 'No',
    outcome: '',
    resolution_date: '2024-02-15T10:00:00Z',
    creator_choice: 'Yes',
    pinecone_id: 'test2',
    agent_id: 2
  },
  {
    id: '3',
    user_id: 3,
    description: 'Test prediction 1',
    choice: 'Yes',
    amount: 75,
    reason: 'Positive news',
    created_at: '2024-01-17T09:15:00Z',
    status: 'active',
    str_thumb: '',
    source: 'test',
    predicted_outcome: 'Yes',
    outcome: '',
    resolution_date: '2024-02-15T10:00:00Z',
    creator_choice: 'Yes',
    pinecone_id: 'test3',
    agent_id: 3
  },
  {
    id: '4',
    user_id: 4,
    description: 'Test prediction 1',
    choice: 'Yes',
    amount: 120,
    reason: 'Technical analysis',
    created_at: '2024-01-18T16:45:00Z',
    status: 'active',
    str_thumb: '',
    source: 'test',
    predicted_outcome: 'Yes',
    outcome: '',
    resolution_date: '2024-02-15T10:00:00Z',
    creator_choice: 'Yes',
    pinecone_id: 'test4',
    agent_id: 4
  },
  {
    id: '5',
    user_id: 5,
    description: 'Test prediction 1',
    choice: 'No',
    amount: 80,
    reason: 'Risk management',
    created_at: '2024-01-19T11:20:00Z',
    status: 'active',
    str_thumb: '',
    source: 'test',
    predicted_outcome: 'No',
    outcome: '',
    resolution_date: '2024-02-15T10:00:00Z',
    creator_choice: 'Yes',
    pinecone_id: 'test5',
    agent_id: 5
  }
];

export default function TestEnhancedChartPage() {
  const [predictionId, setPredictionId] = useState('1');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const generateTestData = async () => {
    setLoading(true);
    setMessage('');
    
    try {
      const response = await fetch('/api/testOddsHistory', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ predictionId: parseInt(predictionId) }),
      });

      const data = await response.json();
      
      if (response.ok) {
        setMessage(`✅ ${data.message}`);
      } else {
        setMessage(`❌ Error: ${data.error}`);
      }
    } catch (error) {
      setMessage(`❌ Error: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Enhanced Odds Chart Test</h1>
          <p className="text-muted-foreground mt-2">
            Compare the original chart with the enhanced version that shows daily analysis data
          </p>
        </div>
      </div>

      {/* Test Data Generation */}
      <Card>
        <CardHeader>
          <CardTitle>Generate Test Data</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Input
              type="number"
              placeholder="Prediction ID"
              value={predictionId}
              onChange={(e) => setPredictionId(e.target.value)}
              className="w-40"
            />
            <Button 
              onClick={generateTestData} 
              disabled={loading}
              className="min-w-[120px]"
            >
              {loading ? 'Generating...' : 'Generate Test Data'}
            </Button>
          </div>
          {message && (
            <div className="p-3 rounded-lg bg-muted text-sm">
              {message}
            </div>
          )}
          <p className="text-sm text-muted-foreground">
            This will generate 7 days of sample daily analysis data for the specified prediction ID.
            The enhanced chart will then be able to display both bet-based and analysis-based odds changes.
          </p>
        </CardContent>
      </Card>

      {/* Original Chart */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Original Accumulated Odds Chart</h2>
        <AccumulatedOddsChart bets={sampleBets} />
      </div>

      {/* Enhanced Chart */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Enhanced Odds Chart (with Daily Analysis)</h2>
        <EnhancedOddsChart 
          bets={sampleBets} 
          predictionId={parseInt(predictionId)} 
          showAnalysisData={true}
        />
      </div>

      {/* Feature Comparison */}
      <Card>
        <CardHeader>
          <CardTitle>Feature Comparison</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <h3 className="font-semibold text-green-600 mb-2">Original Chart</h3>
              <ul className="space-y-1 text-sm">
                <li>• Shows odds changes when bets are placed</li>
                <li>• Real-time market sentiment based on betting volume</li>
                <li>• Displays total volume and bet count</li>
                <li>• Updates only when agents place new bets</li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold text-blue-600 mb-2">Enhanced Chart</h3>
              <ul className="space-y-1 text-sm">
                <li>• Shows both betting activity AND daily analysis</li>
                <li>• Daily market sentiment from agent re-evaluation</li>
                <li>• Confidence change indicators and reasoning</li>
                <li>• View modes: Combined, Bets Only, Analysis Only</li>
                <li>• Visual distinction between data sources</li>
                <li>• Shows market evolution even without new bets</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Usage Instructions */}
      <Card>
        <CardHeader>
          <CardTitle>How to Test</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <h4 className="font-medium">1. Generate Test Data</h4>
            <p className="text-sm text-muted-foreground">
              Click "Generate Test Data" to create 7 days of sample daily analysis data. 
              This simulates what would happen when agents perform daily re-evaluation of their bets.
            </p>
          </div>
          <div className="space-y-2">
            <h4 className="font-medium">2. Compare Charts</h4>
            <p className="text-sm text-muted-foreground">
              The original chart only shows changes when bets are placed. 
              The enhanced chart shows additional daily sentiment changes from analysis.
            </p>
          </div>
          <div className="space-y-2">
            <h4 className="font-medium">3. Explore View Modes</h4>
            <p className="text-sm text-muted-foreground">
              Use the buttons in the enhanced chart to switch between Combined, Bets Only, and Analysis Only views.
              Notice how analysis data points have different styling (dashed borders on dots).
            </p>
          </div>
          <div className="space-y-2">
            <h4 className="font-medium">4. Hover for Details</h4>
            <p className="text-sm text-muted-foreground">
              Hover over data points to see detailed information including confidence changes, 
              reasoning, and whether the data comes from betting activity or daily analysis.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
} 