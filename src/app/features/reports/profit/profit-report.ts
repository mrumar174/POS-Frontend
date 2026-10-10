import { Component } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Observable } from 'rxjs';
import { ProfitSummaryReportDto } from '../../../core/api/api-client';
import { ReportBase } from '../shared/report-base';
import { ExportSheet } from '../shared/report-export.service';
import { ReportShell } from '../shared/report-shell/report-shell';
import { ReportKpi } from '../shared/report-kpi';
import { kv } from '../shared/report-utils';

@Component({
  selector: 'app-profit-report',
  standalone: true,
  imports: [ReportShell, ReportKpi, ReactiveFormsModule, DecimalPipe],
  templateUrl: './profit-report.html',
  styleUrl: '../shared/report.css'
})
export class ProfitReport extends ReportBase<ProfitSummaryReportDto> {
  readonly title = 'Profit Report';
  readonly fileName = 'profit-report';

  constructor() {
    super();
    this.form.addControl('categoryId', new FormControl<number | null>(null));
    this.loadCategories();
  }

  protected fetch(): Observable<ProfitSummaryReportDto> {
    return this.client.profit(this.fromDate, this.toDate, this.form.value['categoryId'] ?? undefined);
  }
  protected isEmpty(d: ProfitSummaryReportDto): boolean { return !d.items?.length; }

  marginClass(m?: number): string { return (m ?? 0) < 10 ? 'chip-bad' : (m ?? 0) < 25 ? 'chip-warn' : 'chip-ok'; }

  protected sheets(d: ProfitSummaryReportDto): ExportSheet[] {
    return [
      { name: 'Summary', rows: kv({
        'Period': this.period(), 'Revenue': d.totalRevenue, 'Cost': d.totalCost,
        'Gross profit': d.totalGrossProfit, 'Margin %': d.overallMarginPercent
      }) },
      { name: 'Profit by product', rows: (d.items ?? []).map(r => ({
        Product: r.productName, 'Qty sold': r.quantitySold, Revenue: r.totalRevenue, Cost: r.totalCost,
        'Gross profit': r.grossProfit, 'Margin %': r.marginPercent
      })) }
    ];
  }
}
