import { Component } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Observable } from 'rxjs';
import { StockValuationSummaryDto } from '../../../core/api/api-client';
import { ReportBase } from '../shared/report-base';
import { ExportSheet } from '../shared/report-export.service';
import { ReportShell } from '../shared/report-shell/report-shell';
import { ReportKpi } from '../shared/report-kpi';
import { kv, sum } from '../shared/report-utils';

@Component({
  selector: 'app-stock-valuation-report',
  standalone: true,
  imports: [ReportShell, ReportKpi, ReactiveFormsModule, DecimalPipe],
  templateUrl: './stock-valuation-report.html',
  styleUrl: '../shared/report.css'
})
export class StockValuationReport extends ReportBase<StockValuationSummaryDto> {
  readonly title = 'Stock Valuation';
  readonly fileName = 'stock-valuation';
  override readonly showDates = false;

  constructor() {
    super();
    this.form.addControl('categoryId', new FormControl<number | null>(null));
    this.loadCategories();
  }

  protected fetch(): Observable<StockValuationSummaryDto> {
    return this.client.stockValuation(this.form.value['categoryId'] ?? undefined);
  }
  protected isEmpty(d: StockValuationSummaryDto): boolean { return !d.items?.length; }

  totalQty(d: StockValuationSummaryDto): number { return sum(d.items, r => r.quantityOnHand); }

  protected sheets(d: StockValuationSummaryDto): ExportSheet[] {
    return [
      { name: 'Summary', rows: kv({
        'Products': d.items?.length ?? 0, 'Units on hand': this.totalQty(d), 'Value at cost': d.totalValueAtCost,
        'Value at sale price': d.totalValueAtSalePrice, 'Potential profit': d.totalPotentialProfit
      }) },
      { name: 'Stock valuation', rows: (d.items ?? []).map(r => ({
        Code: r.productCode, Product: r.productName, Category: r.categoryName, 'Qty on hand': r.quantityOnHand,
        'Unit cost': r.unitCost, 'Unit sale price': r.unitSalePrice, 'Value at cost': r.valueAtCost,
        'Value at sale price': r.valueAtSalePrice, 'Potential profit': r.potentialProfit
      })) }
    ];
  }
}
