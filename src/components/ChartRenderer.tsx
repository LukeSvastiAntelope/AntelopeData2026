import React from 'react';
import BarChart, { BarChartSpec } from './charts/BarChart';

interface Props { spec: any }

const ChartRenderer: React.FC<Props> = ({ spec }) => {
  if (!spec || typeof spec !== 'object' || !spec.type) return null;
  switch (spec.type) {
    case 'bar':
      return <BarChart spec={spec as BarChartSpec} />;
    default:
      return null;
  }
};

export default ChartRenderer; 