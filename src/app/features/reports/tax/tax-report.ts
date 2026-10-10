import { Component, computed } from '@angular/core';
import { DecimalPipe, DatePipe } from '@angular/common';
import { Observable } from 'rxjs';
import { TaxReportDto } from '../../../core/api/api-client';
import { ReportBase } from '../shared/report-base';
import { ExportSheet } from '../shared/report-export.service';
import { ReportShell } from '../shared/report-shell/report-shell';
import { ReportKpi } from '../shared/report-kpi';
import { ReportBars } from '../shared/report-bars';
import { fmtDate, kv, shortDate, sum } from '../shared/report-utils';

@Component({
  selector: 'app-tax-report',
  standalone: true,
  imports: [ReportShell, ReportKpi, ReportBars, DecimalPipe, DatePipe],
  templateUrl: './tax-report.html',
  styleUrl: '../shared/report.css'
})
export class TaxReport extends ReportBase<TaxReportDto> {
  readonly title = 'Tax Report';
  readonly fileName = 'tax-report';

  protected fetch(): Observable<TaxReportDto> { return this.client.tax(this.fromDate, this.toDate); }
  protected isEmpty(d: TaxReportDto): boolean { return !d.taxCollectedOnSales && !d.taxPaidOnPurchases && !d.dailyBreakdown?.length; }

  readonly chartLabels = computed(() => (this.data()?.dailyBreakdown ?? []).map(p => shortDate(p.date)));
  readonly chartSeries = computed(() => {
    const rows = this.data()?.dailyBreakdown ?? [];
    return [
      { name: 'Collected on sales', values: rows.map(p => p.taxCollected || 0), color: '#4f46e5' },
      { name: 'Paid on purchases', values: rows.map(p => p.taxPaid || 0), color: '#f59e0b' }
    ];
  });
  readonly totals = computed(() => {
    const rows = this.data()?.dailyBreakdown ?? [];
    return { collected: sum(rows, r => r.taxCollected), paid: sum(rows, r => r.taxPaid) };
  });

  protected sheets(d: TaxReportDto): ExportSheet[] {
    return [
      { name: 'Summary', rows: kv({
        'Period': this.period(), 'Tax collected on sales': d.taxCollectedOnSales,
        'Tax paid on purchases': d.taxPaidOnPurchases, 'Net tax liability': d.netTaxLiability
      }) },
      { name: 'Daily', rows: (d.dailyBreakdown ?? []).map(p => ({
        Date: fmtDate(p.date), 'Tax collected': p.taxCollected, 'Tax paid': p.taxPaid, Net: (p.taxCollected || 0) - (p.taxPaid || 0)
      })) }
    ];
  }
}
