import { Component, computed } from '@angular/core';
import { DecimalPipe, DatePipe } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Observable } from 'rxjs';
import { SupplierDueReportRowDto } from '../../../core/api/api-client';
import { ReportBase } from '../shared/report-base';
import { ExportSheet } from '../shared/report-export.service';
import { ReportShell } from '../shared/report-shell/report-shell';
import { ReportKpi } from '../shared/report-kpi';
import { fmtDate, kv, sum } from '../shared/report-utils';

@Component({
  selector: 'app-supplier-dues-report',
  standalone: true,
  imports: [ReportShell, ReportKpi, ReactiveFormsModule, DecimalPipe, DatePipe],
  templateUrl: './supplier-dues-report.html',
  styleUrl: '../shared/report.css'
})
export class SupplierDuesReport extends ReportBase<SupplierDueReportRowDto[]> {
  readonly title = 'Supplier Dues';
  readonly fileName = 'supplier-dues';
  override readonly showDates = false;

  constructor() {
    super();
    this.form.addControl('minDaysOverdue', new FormControl<number | null>(null));
  }

  protected fetch(): Observable<SupplierDueReportRowDto[]> {
    const v = this.form.value['minDaysOverdue'];
    return this.client.supplierDues(v === null || v === '' || v === undefined ? undefined : Number(v));
  }
  protected isEmpty(d: SupplierDueReportRowDto[]): boolean { return d.length === 0; }

  agingClass(days?: number): string { return (days ?? 0) > 60 ? 'chip-bad' : (days ?? 0) > 30 ? 'chip-warn' : 'chip-ok'; }

  readonly totals = computed(() => {
    const d = this.data() ?? [];
    return {
      invoices: sum(d, r => r.unpaidInvoiceCount), due: sum(d, r => r.totalDue),
      maxDays: d.reduce((m, r) => Math.max(m, r.daysOverdue || 0), 0)
    };
  });

  protected sheets(d: SupplierDueReportRowDto[]): ExportSheet[] {
    const t = this.totals();
    return [
      { name: 'Summary', rows: kv({ 'Suppliers with dues': d.length, 'Unpaid invoices': t.invoices, 'Total due': t.due, 'Max days overdue': t.maxDays }) },
      { name: 'Supplier dues', rows: d.map(r => ({
        Supplier: r.supplierName, Contact: r.contactNo, 'Unpaid invoices': r.unpaidInvoiceCount, 'Total due': r.totalDue,
        'Oldest unpaid invoice': fmtDate(r.oldestUnpaidInvoiceDate), 'Days overdue': r.daysOverdue
      })) }
    ];
  }
}
