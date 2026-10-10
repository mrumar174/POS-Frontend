import { Component, computed, signal } from '@angular/core';
import { DecimalPipe, DatePipe } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Observable } from 'rxjs';
import { ProductDto, StockMovementRowDto } from '../../../core/api/api-client';
import { SearchableSelect, SearchableOption } from '../../../shared/searchable-select/searchable-select';
import { ReportBase } from '../shared/report-base';
import { ExportSheet } from '../shared/report-export.service';
import { ReportShell } from '../shared/report-shell/report-shell';
import { ReportKpi } from '../shared/report-kpi';
import { fmtDate, kv, sum } from '../shared/report-utils';

@Component({
  selector: 'app-stock-movement-report',
  standalone: true,
  imports: [ReportShell, ReportKpi, SearchableSelect, ReactiveFormsModule, DecimalPipe, DatePipe],
  templateUrl: './stock-movement-report.html',
  styleUrl: '../shared/report.css'
})
export class StockMovementReport extends ReportBase<StockMovementRowDto[]> {
  readonly title = 'Stock Movement';
  readonly fileName = 'stock-movement';
  override readonly autoRun = false;
  override readonly idleHint = 'Choose a product and press Run report to see its stock ledger.';

  readonly productCtrl = new FormControl<number | null>(null);
  readonly allProducts = signal<ProductDto[]>([]);
  readonly productOptions = computed<SearchableOption[]>(() =>
    this.allProducts().map(p => ({ id: p.id!, label: p.name!, sublabel: p.productCode }))
  );

  constructor() {
    super();
    this.form.addControl('productId', this.productCtrl);
    this.client.productsAll().subscribe({ next: (d) => this.allProducts.set(d) });
  }

  protected override beforeRun(): boolean {
    if (!this.productCtrl.value) {
      this.notify.warning('Please select a product first.');
      return false;
    }
    return true;
  }

  protected fetch(): Observable<StockMovementRowDto[]> {
    return this.client.stockMovement(this.productCtrl.value ?? undefined, this.fromDate, this.toDate);
  }
  protected isEmpty(d: StockMovementRowDto[]): boolean { return d.length === 0; }

  get productName(): string { return this.allProducts().find(p => p.id === this.productCtrl.value)?.name ?? ''; }

  readonly totals = computed(() => {
    const d = this.data() ?? [];
    return { inQty: sum(d, r => r.quantityIn), outQty: sum(d, r => r.quantityOut), closing: d.length ? d[d.length - 1].runningBalance ?? 0 : 0 };
  });

  protected sheets(d: StockMovementRowDto[]): ExportSheet[] {
    const t = this.totals();
    return [
      { name: 'Summary', rows: kv({ 'Product': this.productName, 'Period': this.period(), 'Total in': t.inQty, 'Total out': t.outQty, 'Closing balance': t.closing }) },
      { name: 'Movement', rows: d.map(r => ({
        Date: fmtDate(r.transactionDate), Type: r.transactionType, Reference: r.referenceNo,
        In: r.quantityIn, Out: r.quantityOut, Balance: r.runningBalance, Remarks: r.remarks
      })) }
    ];
  }
}
