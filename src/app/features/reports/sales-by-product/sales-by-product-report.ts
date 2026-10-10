import { Component, computed } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Observable } from 'rxjs';
import { ProductSalesReportRowDto } from '../../../core/api/api-client';
import { ReportBase } from '../shared/report-base';
import { ExportSheet } from '../shared/report-export.service';
import { ReportShell } from '../shared/report-shell/report-shell';
import { ReportKpi } from '../shared/report-kpi';
import { kv, sum } from '../shared/report-utils';

@Component({
  selector: 'app-sales-by-product-report',
  standalone: true,
  imports: [ReportShell, ReportKpi, ReactiveFormsModule, DecimalPipe],
  templateUrl: './sales-by-product-report.html',
  styleUrl: '../shared/report.css'
})
export class SalesByProductReport extends ReportBase<ProductSalesReportRowDto[]> {
  readonly title = 'Sales by Product';
  readonly fileName = 'sales-by-product';

  /** Keep these values in sync with what your ReportsController accepts for `sortBy`. */
  readonly sortOptions = [
    { value: null, label: 'Default' },
    { value: 'revenue', label: 'Revenue' },
    { value: 'quantity', label: 'Quantity sold' }
  ];
  readonly topOptions = [
    { value: null, label: 'All products' },
    { value: 10, label: 'Top 10' },
    { value: 25, label: 'Top 25' },
    { value: 50, label: 'Top 50' },
    { value: 100, label: 'Top 100' }
  ];

  constructor() {
    super();
    this.form.addControl('categoryId', new FormControl<number | null>(null));
    this.form.addControl('sortBy', new FormControl<string | null>(null));
    this.form.addControl('top', new FormControl<number | null>(null));
    this.loadCategories();
  }

  protected fetch(): Observable<ProductSalesReportRowDto[]> {
    const v = this.form.value;
    return this.client.salesByProduct(this.fromDate, this.toDate, v['categoryId'] ?? undefined, v['sortBy'] ?? undefined, v['top'] ?? undefined);
  }
  protected isEmpty(d: ProductSalesReportRowDto[]): boolean { return d.length === 0; }

  readonly totals = computed(() => {
    const d = this.data() ?? [];
    return { qty: sum(d, r => r.quantitySold), revenue: sum(d, r => r.totalRevenue), discount: sum(d, r => r.totalDiscount) };
  });

  protected sheets(d: ProductSalesReportRowDto[]): ExportSheet[] {
    const t = this.totals();
    return [
      { name: 'Summary', rows: kv({ 'Period': this.period(), 'Products': d.length, 'Quantity sold': t.qty, 'Revenue': t.revenue, 'Discount': t.discount }) },
      { name: 'Sales by product', rows: d.map(r => ({
        Code: r.productCode, Product: r.productName, Category: r.categoryName, 'Qty sold': r.quantitySold,
        Revenue: r.totalRevenue, Discount: r.totalDiscount, 'Avg price': r.averageSellingPrice,
        '% of revenue': Math.round(this.pct(r.totalRevenue, t.revenue) * 100) / 100
      })) }
    ];
  }
}
