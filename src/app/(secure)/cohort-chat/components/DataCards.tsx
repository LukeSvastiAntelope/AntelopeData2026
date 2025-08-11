"use client";

import React from 'react';

type Props = {
  dataCards: any[];
};

export default function DataCards({ dataCards }: Props) {
  if (!dataCards || dataCards.length === 0) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mt-4 mb-4">
      {dataCards.map((card, index) => (
        <div key={index} className="bg-muted/30 rounded-lg p-4 border">
          <h4 className="font-medium text-sm text-foreground mb-3">{card.title}</h4>

          {card.chart_type === 'horizontal_bar' && (
            <div className="space-y-3">
              {card.data.map((item: any, i: number) => (
                <div key={i} className="space-y-1">
                  <div className="flex justify-between items-center">
                    <div className="text-xs text-muted-foreground leading-tight">{item.label}</div>
                    <div className="text-xs font-medium">{item.value}%</div>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2 relative">
                    <div className="bg-primary h-2 rounded-full" style={{ width: `${Math.min(item.value, 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}

          {card.chart_type === 'metric_card' && (
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-lg font-bold text-foreground">{card.data.average}</div>
                <div className="text-xs text-muted-foreground">Average</div>
              </div>
              <div>
                <div className="text-lg font-bold text-foreground">{card.data.median}</div>
                <div className="text-xs text-muted-foreground">Median</div>
              </div>
              <div>
                <div className="text-lg font-bold text-foreground">{card.data.range}</div>
                <div className="text-xs text-muted-foreground">Range</div>
              </div>
            </div>
          )}

          {card.chart_type === 'pie' && (
            <div className="space-y-1">
              {card.data.map((item: any, i: number) => (
                <div key={i} className="flex justify-between items-center text-sm">
                  <span className="text-foreground">{item.label}</span>
                  <span className="font-medium">{item.value}%</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}



