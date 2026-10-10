import { Component, computed } from '@angular/core';
import { DecimalPipe, DatePipe } from '@angular/common';
import { Observable } from 'rxjs';
import { PurchaseSummaryReportDto } from '../../../core/api/api-client';
import { ReportBase } from '../shared/report-base';
import { ExportSheet } from '../shared/report-export.service';
import { ReportShell } from '../shared/report-shell/report-shell';
import { ReportKpi } from '../shared/report-kpi';
import { ReportBars } from '../shared/report-bars';
import { fmtDate, kv, shortDate, sum } from '../shared/report-utils';

@Component({
  selector: 'app-purchase-summary-report',
  standalone: true,
  imports: [ReportShell, ReportKpi, ReportBars, DecimalPipe, DatePipe],
  templateUrl: './purchase-summary-report.html',
  styleUrl: '../shared/report.css'
})
export class PurchaseSummaryReport extends ReportBase<PurchaseSummaryReportDto> {
  readonly title = 'Purchase Summary';
  readonly fileName = 'purchase-summary';

  protected fetch(): Observable<PurchaseSummaryReportDto> { return this.client.purchaseSummary(this.fromDate, this.toDate); }
  protected isEmpty(d: PurchaseSummaryReportDto): boolean { return !d.totalPurchaseInvoices && !d.dailyBreakdown?.length; }

  readonly chartLabels = computed(() => (this.data()?.dailyBreakdown ?? []).map(p => shortDate(p.date)));
  readonly chartSeries = computed(() => [{ name: 'Net purchases', values: (this.data()?.dailyBreakdown ?? []).map(p => p.netPurchases || 0), color: '#0ea5e9' }]);
  readonly totals = computed(() => {
    const rows = this.data()?.dailyBreakdown ?? [];
    return { invoices: sum(rows, r => r.invoiceCount), net: sum(rows, r => r.netPurchases) };
  });

  protected sheets(d: PurchaseSummaryReportDto): ExportSheet[] {
    return [
      { name: 'Summary', rows: kv({
        'Period': this.period(), 'Purchase invoices': d.totalPurchaseInvoices, 'Gross purchases': d.totalGrossPurchases,
        'Discount': d.totalDiscount, 'Tax': d.totalTax, 'Net purchases': d.totalNetPurchases,
        'Paid': d.totalPaid, 'Outstanding due': d.totalOutstandingDue
      }) },
      { name: 'Daily', rows: (d.dailyBreakdown ?? []).map(p => ({ Date: fmtDate(p.date), Invoices: p.invoiceCount, 'Net purchases': p.netPurchases })) }
    ];
  }
}
