import { Component, computed } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Observable } from 'rxjs';
import { SupplierPurchaseReportRowDto } from '../../../core/api/api-client';
import { ReportBase } from '../shared/report-base';
import { ExportSheet } from '../shared/report-export.service';
import { ReportShell } from '../shared/report-shell/report-shell';
import { ReportKpi } from '../shared/report-kpi';
import { kv, sum } from '../shared/report-utils';

@Component({
  selector: 'app-purchases-by-supplier-report',
  standalone: true,
  imports: [ReportShell, ReportKpi, ReactiveFormsModule, DecimalPipe],
  templateUrl: './purchases-by-supplier-report.html',
  styleUrl: '../shared/report.css'
})
export class PurchasesBySupplierReport extends ReportBase<SupplierPurchaseReportRowDto[]> {
  readonly title = 'Purchases by Supplier';
  readonly fileName = 'purchases-by-supplier';

  /** Keep these values in sync with what your ReportsController accepts for `sortBy`. */
  readonly sortOptions = [
    { value: null, label: 'Default' },
    { value: 'purchased', label: 'Total purchased' },
    { value: 'due', label: 'Total due' }
  ];

  constructor() {
    super();
    this.form.addControl('sortBy', new FormControl<string | null>(null));
  }

  protected fetch(): Observable<SupplierPurchaseReportRowDto[]> {
    return this.client.purchasesBySupplier2(this.fromDate, this.toDate, this.form.value['sortBy'] ?? undefined);
  }
  protected isEmpty(d: SupplierPurchaseReportRowDto[]): boolean { return d.length === 0; }

  readonly totals = computed(() => {
    const d = this.data() ?? [];
    return { invoices: sum(d, r => r.invoiceCount), purchased: sum(d, r => r.totalPurchased), paid: sum(d, r => r.totalPaid), due: sum(d, r => r.totalDue) };
  });

  protected sheets(d: SupplierPurchaseReportRowDto[]): ExportSheet[] {
    const t = this.totals();
    return [
      { name: 'Summary', rows: kv({ 'Period': this.period(), 'Suppliers': d.length, 'Invoices': t.invoices, 'Total purchased': t.purchased, 'Total paid': t.paid, 'Total due': t.due }) },
      { name: 'By supplier', rows: d.map(r => ({
        Supplier: r.supplierName, Invoices: r.invoiceCount, Purchased: r.totalPurchased, Paid: r.totalPaid, Due: r.totalDue
      })) }
    ];
  }
}
