import { Component, computed } from '@angular/core';
import { DecimalPipe, DatePipe } from '@angular/common';
import { Observable } from 'rxjs';
import { ExpenseSummaryReportDto } from '../../../core/api/api-client';
import { ReportBase } from '../shared/report-base';
import { ExportSheet } from '../shared/report-export.service';
import { ReportShell } from '../shared/report-shell/report-shell';
import { ReportKpi } from '../shared/report-kpi';
import { ReportBars } from '../shared/report-bars';
import { fmtDate, kv, shortDate, sum } from '../shared/report-utils';

@Component({
  selector: 'app-expenses-report',
  standalone: true,
  imports: [ReportShell, ReportKpi, ReportBars, DecimalPipe, DatePipe],
  templateUrl: './expenses-report.html',
  styleUrl: '../shared/report.css'
})
export class ExpensesReport extends ReportBase<ExpenseSummaryReportDto> {
  readonly title = 'Expenses Report';
  readonly fileName = 'expenses-report';

  protected fetch(): Observable<ExpenseSummaryReportDto> { return this.client.expenses(this.fromDate, this.toDate); }
  protected isEmpty(d: ExpenseSummaryReportDto): boolean { return !d.totalExpenses && !d.byCategory?.length; }

  readonly expenseCount = computed(() => sum(this.data()?.byCategory, r => r.expenseCount));
  readonly chartLabels = computed(() => (this.data()?.dailyBreakdown ?? []).map(p => shortDate(p.date)));
  readonly chartSeries = computed(() => [{ name: 'Expenses', values: (this.data()?.dailyBreakdown ?? []).map(p => p.amount || 0), color: '#ef4444' }]);

  protected sheets(d: ExpenseSummaryReportDto): ExportSheet[] {
    return [
      { name: 'Summary', rows: kv({ 'Period': this.period(), 'Total expenses': d.totalExpenses, 'Expense entries': this.expenseCount() }) },
      { name: 'By category', rows: (d.byCategory ?? []).map(r => ({
        Category: r.expenseCategoryName, Entries: r.expenseCount, Amount: r.totalAmount, '% of total': r.percentOfTotal
      })) },
      { name: 'Daily', rows: (d.dailyBreakdown ?? []).map(p => ({ Date: fmtDate(p.date), Amount: p.amount })) }
    ];
  }
}
