import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Client, DashboardDto } from '../../../core/api/api-client';
import { DatePipe, DecimalPipe, CurrencyPipe } from '@angular/common';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration, ChartOptions } from 'chart.js';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterLink, DatePipe, DecimalPipe, CurrencyPipe, BaseChartDirective],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css'
})
export class DashboardComponent implements OnInit {
  private client = inject(Client);

  readonly data = signal<DashboardDto | null>(null);
  readonly loading = signal(true);
  readonly error = signal(false);
  
  readonly currentDate = new Date();
  
  // Charts config
  public trendChartData: ChartConfiguration<'line'>['data'] = { datasets: [], labels: [] };
  public trendChartOptions: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: { x: { grid: { display: false } }, y: { beginAtZero: true } }
  };

  public categoryChartData: ChartConfiguration<'doughnut'>['data'] = { datasets: [], labels: [] };
  public paymentChartData: ChartConfiguration<'doughnut'>['data'] = { datasets: [], labels: [] };
  public doughnutOptions: ChartOptions<'doughnut'> = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { position: 'right' } },
    cutout: '70%'
  };

  public productsChartData: ChartConfiguration<'bar'>['data'] = { datasets: [], labels: [] };
  public productsChartOptions: ChartOptions<'bar'> = {
    responsive: true, maintainAspectRatio: false, indexAxis: 'y',
    plugins: { legend: { display: false } },
    scales: { x: { beginAtZero: true, grid: { display: false } }, y: { grid: { display: false } } }
  };

  ngOnInit(): void {
    this.loadDashboard();
  }

  loadDashboard(): void {
    this.loading.set(true);
    this.error.set(false);

    // Fixed method name and explicitly typed the response
    this.client.dashboard().subscribe({
      next: (res: DashboardDto) => {
        this.data.set(res);
        this.initCharts(res);
        this.loading.set(false);
      },
      error: () => {
        this.error.set(true);
        this.loading.set(false);
      }
    });
  }

  private initCharts(d: DashboardDto): void {
    // 1. Sales Trend
    if (d.salesTrend && d.salesTrend.length > 0) {
      this.trendChartData = {
        labels: d.salesTrend.map(t => new DatePipe('en-US').transform(t.date, 'MMM dd')),
        datasets: [{
          data: d.salesTrend.map(t => t.sales || 0),
          label: 'Revenue',
          borderColor: '#4f46e5',
          backgroundColor: 'rgba(79, 70, 229, 0.1)',
          tension: 0.3,
          fill: true
        }]
      };
    }

    // 2. Category Share
    if (d.salesByCategory && d.salesByCategory.length > 0) {
      this.categoryChartData = {
        labels: d.salesByCategory.map(c => c.categoryName!),
        datasets: [{
          data: d.salesByCategory.map(c => c.revenue || 0),
          backgroundColor: ['#4f46e5', '#10b981', '#f59e0b', '#ec4899', '#6366f1', '#8b5cf6']
        }]
      };
    }

    // 3. Top Products
    if (d.topProducts && d.topProducts.length > 0) {
      this.productsChartData = {
        labels: d.topProducts.map(p => p.productName!),
        datasets: [{
          data: d.topProducts.map(p => p.revenue || 0),
          backgroundColor: '#10b981',
          borderRadius: 4
        }]
      };
    }

    // 4. Payment Methods
    if (d.todayPaymentMethodBreakdown && d.todayPaymentMethodBreakdown.length > 0) {
      this.paymentChartData = {
        labels: d.todayPaymentMethodBreakdown.map(p => p.paymentMethodName!),
        datasets: [{
          data: d.todayPaymentMethodBreakdown.map(p => p.amount || 0),
          backgroundColor: ['#3b82f6', '#f59e0b', '#10b981', '#6b7280']
        }]
      };
    }
  }

  getGreeting(): string {
    const hour = this.currentDate.getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  }

  get userName(): string {
    // 1. Check if the user object was saved as a JSON string (e.g., localStorage.setItem('user', JSON.stringify(res.user)))
    try {
      const userJson = localStorage.getItem('user') || localStorage.getItem('currentUser');
      if (userJson) {
        const userObj = JSON.parse(userJson);
        // Prefer fullName, fallback to userName
        return userObj.fullName || userObj.userName || 'User';
      }
    } catch (e) {
      // Ignore parsing errors
    }

    // 2. Check if it was saved as a direct string key
    return localStorage.getItem('fullName') || 
           localStorage.getItem('userName') || 
           localStorage.getItem('user_fullname') || 
           'User'; 
  }
}