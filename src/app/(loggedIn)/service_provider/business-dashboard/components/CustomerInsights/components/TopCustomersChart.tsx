import React, { useMemo } from 'react';
import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend
} from 'chart.js';
import styles from '../../../business-dashboard.module.css';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

interface Customer {
  name: string;
  count: number;
}

interface TopCustomersChartProps {
  customers: Customer[];
}

export default function TopCustomersChart({ customers }: TopCustomersChartProps) {
  const chartData = useMemo(() => ({
    labels: customers.map(c => c.name),
    datasets: [
      {
        label: 'Bookings',
        data: customers.map(c => c.count),
        backgroundColor: '#1e3a8a',
        borderRadius: 6,
        barThickness: 25,
      },
    ],
  }), [customers]);

  const chartOptions = {
    indexAxis: 'y' as const,
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
    },
    scales: {
      x: {
        beginAtZero: true,
        ticks: {
          stepSize: 1,
          font: { size: 11 },
        },
        title: {
          display: true,
          text: 'Number of Bookings',
          font: { size: 11 },
          color: '#64748b',
        },
      },
      y: {
        grid: { display: false },
        ticks: {
          font: { size: 11 },
          callback: function(val: any): string {
            const label = customers[val]?.name || '';
            return label.length > 15 ? label.substring(0, 15) + '...' : label;
          }
        },
        title: {
          display: true,
          text: 'Customer Name',
          font: { size: 11 },
          color: '#64748b',
        },
      },
    },
  };

  return (
    <div className={styles.chartContainer}>
      <h3 className={styles.chartTitle}>Top Rebooked Customers</h3>
      <div className={styles.chart}>
        <Bar data={chartData} options={chartOptions} />
      </div>
    </div>
  );
}