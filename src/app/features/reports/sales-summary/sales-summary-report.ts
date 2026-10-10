import { Component, computed } from '@angular/core';
import { DecimalPipe, DatePipe } from '@angular/common';
import { Observable } from 'rxjs';
import { SalesSummaryReportDto } from '../../../core/api/api-client';
import { ReportBase } from '../shared/report-base';
import { ExportSheet } from '../shared/report-export.service';
import { ReportShell } from '../shared/report-shell/report-shell';
import { ReportKpi } from '../shared/report-kpi';
import { ReportBars } from '../shared/report-bars';
import { fmtDate, kv, shortDate, sum } from '../shared/report-utils';

@Component({
  selector: 'app-sales-summary-report',
  standalone: true,
  imports: [ReportShell, ReportKpi, ReportBars, DecimalPipe, DatePipe],
  templateUrl: './sales-summary-report.html',
  styleUrl: '../shared/report.css'
})
export class SalesSummaryReport extends ReportBase<SalesSummaryReportDto> {
  readonly title = 'Sales Summary';
  readonly fileName = 'sales-summary';

  protected fetch(): Observable<SalesSummaryReportDto> { return this.client.salesSummary(this.fromDate, this.toDate); }
  protected isEmpty(d: SalesSummaryReportDto): boolean { return !d.totalInvoices && !d.dailyBreakdown?.length; }

  readonly uncollected = computed(() => {
    const d = this.data();
    return d ? Math.max(0, (d.totalNetSales || 0) - (d.totalCollected || 0)) : 0;
  });
  readonly chartLabels = computed(() => (this.data()?.dailyBreakdown ?? []).map(p => shortDate(p.date)));
  readonly chartSeries = computed(() => [{ name: 'Net sales', values: (this.data()?.dailyBreakdown ?? []).map(p => p.netSales || 0) }]);
  readonly totals = computed(() => {
    const rows = this.data()?.dailyBreakdown ?? [];
    return { invoices: sum(rows, r => r.invoiceCount), net: sum(rows, r => r.netSales) };
  });

  protected sheets(d: SalesSummaryReportDto): ExportSheet[] {
    return [
      { name: 'Summary', rows: kv({
        'Period': this.period(), 'Total invoices': d.totalInvoices, 'Gross sales': d.totalGrossSales,
        'Discount': d.totalDiscount, 'Tax': d.totalTax, 'Net sales': d.totalNetSales,
        'Collected': d.totalCollected, 'Uncollected': this.uncollected(), 'Average invoice': d.averageInvoiceValue
      }) },
      { name: 'Daily', rows: (d.dailyBreakdown ?? []).map(p => ({ Date: fmtDate(p.date), Invoices: p.invoiceCount, 'Net sales': p.netSales })) }
    ];
  }
}
