import { Component, computed } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { Observable } from 'rxjs';
import { CategorySalesReportRowDto } from '../../../core/api/api-client';
import { ReportBase } from '../shared/report-base';
import { ExportSheet } from '../shared/report-export.service';
import { ReportShell } from '../shared/report-shell/report-shell';
import { ReportKpi } from '../shared/report-kpi';
import { kv, sum } from '../shared/report-utils';

@Component({
  selector: 'app-sales-by-category-report',
  standalone: true,
  imports: [ReportShell, ReportKpi, DecimalPipe],
  templateUrl: './sales-by-category-report.html',
  styleUrl: '../shared/report.css'
})
export class SalesByCategoryReport extends ReportBase<CategorySalesReportRowDto[]> {
  readonly title = 'Sales by Category';
  readonly fileName = 'sales-by-category';

  protected fetch(): Observable<CategorySalesReportRowDto[]> { return this.client.salesByCategory(this.fromDate, this.toDate); }
  protected isEmpty(d: CategorySalesReportRowDto[]): boolean { return d.length === 0; }

  readonly totals = computed(() => {
    const d = this.data() ?? [];
    return { qty: sum(d, r => r.quantitySold), revenue: sum(d, r => r.totalRevenue) };
  });

  protected sheets(d: CategorySalesReportRowDto[]): ExportSheet[] {
    const t = this.totals();
    return [
      { name: 'Summary', rows: kv({ 'Period': this.period(), 'Categories': d.length, 'Quantity sold': t.qty, 'Revenue': t.revenue }) },
      { name: 'Sales by category', rows: d.map(r => ({
        Category: r.categoryName, 'Qty sold': r.quantitySold, Revenue: r.totalRevenue, '% of total sales': r.percentOfTotalSales
      })) }
    ];
  }
}
