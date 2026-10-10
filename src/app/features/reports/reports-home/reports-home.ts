import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PageHeader } from '../../../shared/page-header/page-header';

interface ReportCard { title: string; desc: string; route: string; icon: string; }
interface ReportGroup { label: string; items: ReportCard[]; }

@Component({
  selector: 'app-reports-home',
  standalone: true,
  imports: [RouterLink, PageHeader],
  templateUrl: './reports-home.html',
  styleUrl: '../shared/report.css'
})
export class ReportsHome {
  readonly segments = ['Reports'];

  readonly groups: ReportGroup[] = [
    { label: 'Sales', items: [
      { title: 'Sales Summary', desc: 'Invoices, net sales, discounts, tax and daily trend', route: '/reports/sales-summary', icon: 'bi-bar-chart-line' },
      { title: 'Sales by Product', desc: 'Best sellers by quantity and revenue', route: '/reports/sales-by-product', icon: 'bi-box-seam' },
      { title: 'Sales by Category', desc: 'Revenue share per product category', route: '/reports/sales-by-category', icon: 'bi-tags' },
      { title: 'Profit Report', desc: 'Revenue, cost and margin per product', route: '/reports/profit', icon: 'bi-graph-up-arrow' },
      { title: 'Cashier Performance', desc: 'Invoices and sales per cashier', route: '/reports/cashier-performance', icon: 'bi-person-check' }
    ]},
    { label: 'Purchasing', items: [
      { title: 'Purchase Summary', desc: 'Purchases, paid amount and outstanding dues', route: '/reports/purchase-summary', icon: 'bi-receipt' },
      { title: 'Purchases by Supplier', desc: 'What you bought, paid and still owe per supplier', route: '/reports/purchases-by-supplier', icon: 'bi-truck' },
      { title: 'Supplier Dues', desc: 'Unpaid balances with aging', route: '/reports/supplier-dues', icon: 'bi-hourglass-split' }
    ]},
    { label: 'Inventory', items: [
      { title: 'Stock Valuation', desc: 'Stock value at cost and at sale price', route: '/reports/stock-valuation', icon: 'bi-cash-coin' },
      { title: 'Stock Movement', desc: 'Product ledger with running balance', route: '/reports/stock-movement', icon: 'bi-arrow-left-right' },
      { title: 'Low Stock', desc: 'Items below minimum with reorder suggestion', route: '/reports/low-stock', icon: 'bi-exclamation-triangle' }
    ]},
    { label: 'Finance', items: [
      { title: 'Tax Report', desc: 'Tax collected vs. paid and net liability', route: '/reports/tax', icon: 'bi-percent' },
      { title: 'Expenses Report', desc: 'Expenses by category and by day', route: '/reports/expenses', icon: 'bi-wallet2' }
    ]}
  ];
}
