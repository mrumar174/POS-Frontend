import { Directive, OnInit, computed, inject, signal } from '@angular/core';
import { AbstractControl, FormControl, FormGroup } from '@angular/forms';
import { Observable } from 'rxjs';
import { Client } from '../../../core/api/api-client';
import { NotificationService } from '../../../shared/notification/notification.service';
import { ExportSheet, ReportExportService } from './report-export.service';
import { errMsg, fmtLong, monthStart, parseLocal, today } from './report-utils';

/**
 * Base class for every report screen. A report only has to provide:
 *   title, fileName, fetch(), isEmpty(), sheets()   (+ optional extra filters)
 */
@Directive()
export abstract class ReportBase<T> implements OnInit {
  protected readonly client = inject(Client);
  protected readonly notify = inject(NotificationService);
  private readonly exporter = inject(ReportExportService);

  abstract readonly title: string;
  abstract readonly fileName: string;

  /** false for reports without a date range (stock valuation, low stock, supplier dues). */
  readonly showDates: boolean = true;
  /** false = wait for the user to press Run (e.g. stock movement needs a product first). */
  readonly autoRun: boolean = true;
  readonly idleHint: string = 'Set your filters and press Run report.';

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly data = signal<T | null>(null);
  readonly generatedAt = signal<Date | null>(null);
  readonly period = signal('');
  readonly categories = signal<{ id?: number; name?: string }[]>([]);
  readonly empty = computed(() => {
    const d = this.data();
    return d !== null && this.isEmpty(d);
  });

  readonly form = new FormGroup<Record<string, AbstractControl>>({
    fromDate: new FormControl(monthStart(), { nonNullable: true }),
    toDate: new FormControl(today(), { nonNullable: true })
  });

  protected abstract fetch(): Observable<T>;
  protected abstract isEmpty(d: T): boolean;
  protected abstract sheets(d: T): ExportSheet[];

  protected get fromDate(): Date | undefined {
    const v = this.form.controls['fromDate'].value;
    return v ? parseLocal(v) : undefined;
  }
  protected get toDate(): Date | undefined {
    const v = this.form.controls['toDate'].value;
    return v ? parseLocal(v, true) : undefined;
  }

  /** Return false to stop the run (after showing a warning). */
  protected beforeRun(): boolean { return true; }

  /** NOTE: adjust the method name if your NSwag client names it differently. */
  protected loadCategories(): void {
    this.client.categoriesAll().subscribe({ next: (c: any) => this.categories.set(c ?? []) });
  }

  ngOnInit(): void {
    if (this.autoRun) this.run();
  }

  run(): void {
    if (this.loading()) return;

    const f = this.fromDate, t = this.toDate;
    if (this.showDates && f && t && f > t) {
      this.notify.warning('"From" date must be on or before "To" date.');
      return;
    }
    if (!this.beforeRun()) return;

    this.loading.set(true);
    this.error.set(null);
    this.period.set(this.showDates && f && t ? `${fmtLong(f)} – ${fmtLong(t)}` : '');

    this.fetch().subscribe({
      next: (d) => {
        this.data.set(d);
        this.generatedAt.set(new Date());
        this.loading.set(false);
      },
      error: (err: any) => {
        const msg = errMsg(err);
        this.error.set(msg);
        this.notify.danger(msg);
        this.loading.set(false);
      }
    });
  }

  exportExcel(): void {
    const d = this.data();
    if (d === null || this.empty()) {
      this.notify.warning('Nothing to export. Run the report first.');
      return;
    }
    this.exporter.toExcel(this.fileName, this.sheets(d));
    this.notify.success('Excel file downloaded.');
  }

  print(): void {
    if (this.data() === null || this.empty()) {
      this.notify.warning('Nothing to print. Run the report first.');
      return;
    }
    const stamp = `Generated ${new Date().toLocaleString()}`;
    const sub = this.period() ? `${this.period()}  ·  ${stamp}` : stamp;
    this.exporter.print(this.title, sub, document.getElementById('report-print-area'));
  }

  /** share of total, 0-100 */
  pct(v: number | undefined, total: number): number {
    return total ? ((v || 0) / total) * 100 : 0;
  }
}
