import { Component, computed } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { Observable } from 'rxjs';
import { CashierPerformanceRowDto } from '../../../core/api/api-client';
import { ReportBase } from '../shared/report-base';
import { ExportSheet } from '../shared/report-export.service';
import { ReportShell } from '../shared/report-shell/report-shell';
import { ReportKpi } from '../shared/report-kpi';
import { kv, sum } from '../shared/report-utils';

@Component({
  selector: 'app-cashier-performance-report',
  standalone: true,
  imports: [ReportShell, ReportKpi, DecimalPipe],
  templateUrl: './cashier-performance-report.html',
  styleUrl: '../shared/report.css'
})
export class CashierPerformanceReport extends ReportBase<CashierPerformanceRowDto[]> {
  readonly title = 'Cashier Performance';
  readonly fileName = 'cashier-performance';

  protected fetch(): Observable<CashierPerformanceRowDto[]> { return this.client.cashierPerformance(this.fromDate, this.toDate); }
  protected isEmpty(d: CashierPerformanceRowDto[]): boolean { return d.length === 0; }

  readonly totals = computed(() => {
    const d = this.data() ?? [];
    const invoices = sum(d, r => r.invoiceCount);
    const sales = sum(d, r => r.totalSales);
    return { invoices, sales, avg: invoices ? sales / invoices : 0 };
  });

  protected sheets(d: CashierPerformanceRowDto[]): ExportSheet[] {
    const t = this.totals();
    return [
      { name: 'Summary', rows: kv({ 'Period': this.period(), 'Cashiers': d.length, 'Invoices': t.invoices, 'Total sales': t.sales, 'Average invoice': t.avg }) },
      { name: 'Cashiers', rows: d.map(r => ({
        Cashier: r.userFullName, Invoices: r.invoiceCount, 'Total sales': r.totalSales, 'Average invoice': r.averageInvoiceValue,
        '% of sales': Math.round(this.pct(r.totalSales, t.sales) * 100) / 100
      })) }
    ];
  }
}
