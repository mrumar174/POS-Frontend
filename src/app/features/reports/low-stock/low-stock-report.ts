import { Component, computed } from '@angular/core';
import { DecimalPipe, DatePipe } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Observable } from 'rxjs';
import { LowStockReportRowDto } from '../../../core/api/api-client';
import { ReportBase } from '../shared/report-base';
import { ExportSheet } from '../shared/report-export.service';
import { ReportShell } from '../shared/report-shell/report-shell';
import { ReportKpi } from '../shared/report-kpi';
import { fmtDate, kv, sum } from '../shared/report-utils';

@Component({
  selector: 'app-low-stock-report',
  standalone: true,
  imports: [ReportShell, ReportKpi, ReactiveFormsModule, DecimalPipe, DatePipe],
  templateUrl: './low-stock-report.html',
  styleUrl: '../shared/report.css'
})
export class LowStockReport extends ReportBase<LowStockReportRowDto[]> {
  readonly title = 'Low Stock';
  readonly fileName = 'low-stock';
  override readonly showDates = false;

  constructor() {
    super();
    this.form.addControl('categoryId', new FormControl<number | null>(null));
    this.loadCategories();
  }

  protected fetch(): Observable<LowStockReportRowDto[]> {
    return this.client.lowStock(this.form.value['categoryId'] ?? undefined);
  }
  protected isEmpty(d: LowStockReportRowDto[]): boolean { return d.length === 0; }

  readonly totals = computed(() => {
    const d = this.data() ?? [];
    return { out: d.filter(r => (r.quantityOnHand || 0) <= 0).length, reorder: sum(d, r => r.suggestedReorderQuantity) };
  });

  protected sheets(d: LowStockReportRowDto[]): ExportSheet[] {
    return [
      { name: 'Summary', rows: kv({ 'Low stock items': d.length, 'Out of stock': this.totals().out, 'Total suggested reorder qty': this.totals().reorder }) },
      { name: 'Low stock', rows: d.map(r => ({
        Code: r.productCode, Product: r.productName, Category: r.categoryName, 'Qty on hand': r.quantityOnHand,
        'Minimum stock': r.minimumStock, 'Suggested reorder': r.suggestedReorderQuantity,
        'Last purchase': fmtDate(r.lastPurchaseDate), 'Preferred supplier': r.preferredSupplierName
      })) }
    ];
  }
}
