import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { ReactiveFormsModule, FormControl, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { DatePipe, DecimalPipe } from '@angular/common';
import { Client, CreateDailyCashClosingDto, DailyCashClosingPreviewDto } from '../../../core/api/api-client';
import { NotificationService } from '../../../shared/notification/notification.service';
import { AlertService } from '../../../shared/alert/alert.service';
import { PageHeader } from '../../../shared/page-header/page-header';
import { extractErrorMessage } from '../../../shared/utils/api-error';

const REMARKS_MAX_LENGTH = 500;

@Component({
  selector: 'app-cash-closing-form',
  standalone: true,
  imports: [ReactiveFormsModule, PageHeader, DatePipe, DecimalPipe],
  templateUrl: './cash-closing-form.html',
  styleUrl: './cash-closing-form.css'
})
export class CashClosingForm implements OnInit {
  private client = inject(Client);
  private router = inject(Router);
  private notify = inject(NotificationService);
  private alert = inject(AlertService);

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly preview = signal<DailyCashClosingPreviewDto | null>(null);

  readonly maxDate = this.toInputDate(new Date());          // the user's LOCAL today
  readonly date = signal(this.maxDate);
  readonly displayDate = computed(() => new Date(this.date() + 'T00:00:00')); // local midnight, safe for the date pipe
  readonly isToday = computed(() => this.date() === this.maxDate);

  readonly remarksMaxLength = REMARKS_MAX_LENGTH;
  readonly remarks = new FormControl('', { nonNullable: true, validators: [Validators.maxLength(REMARKS_MAX_LENGTH)] });

  readonly breadcrumbSegments = ['Finance', 'Daily Cash Closing', 'Close Day'];
  private requestId = 0;

  readonly canConfirm = computed(() => !!this.preview()?.canClose && !this.loading() && !this.saving());

  // Days between the previous closing and the selected date that were never closed.
  readonly gapDays = computed(() => {
    const p = this.preview();
    if (!p || p.alreadyClosed || !p.previousClosingDate || !p.closingDate) return 0;
    const ms = p.closingDate.getTime() - p.previousClosingDate.getTime();
    return Math.max(0, Math.round(ms / 86_400_000) - 1);
  });

  ngOnInit(): void { this.loadPreview(); }

  private toInputDate(d: Date): string {
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${m}-${day}`;
  }

  loadPreview(silent = false): void {
    const reqId = ++this.requestId;
    if (!silent) { this.loading.set(true); this.errorMessage.set(null); }

    // 'yyyy-MM-dd' parses as UTC midnight (same convention as sale/expense forms); the server recovers the calendar date.
    this.client.calculate(new Date(this.date())).subscribe({
      next: (p) => {
        if (reqId !== this.requestId) return;
        this.preview.set(p);
        this.loading.set(false);
      },
      error: (err: any) => {
        if (reqId !== this.requestId) return;
        this.loading.set(false);
        if (silent) return;
        this.preview.set(null);
        const msg = extractErrorMessage(err, 'Could not calculate the closing figures.');
        this.errorMessage.set(msg);
        this.notify.danger(msg);
      }
    });
  }

  onDateChange(event: Event): void {
    const v = (event.target as HTMLInputElement).value;
    if (!v) return;
    this.date.set(v);
    this.loadPreview();
  }

  goToOldestUnclosed(): void {
    const prev = this.preview()?.previousClosingDate;
    if (!prev) return;
    this.date.set(this.toInputDate(new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() + 1)));
    this.loadPreview();
  }

  async confirm(): Promise<void> {
    const p = this.preview();
    if (!p?.canClose || this.saving()) return;

    if (this.remarks.invalid) {
      this.remarks.markAsTouched();
      this.notify.warning(`Remarks cannot exceed ${REMARKS_MAX_LENGTH} characters.`);
      return;
    }

    const balance = (p.closingBalance ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const when = this.displayDate().toLocaleDateString(undefined, { dateStyle: 'medium' });
    const ok = await this.alert.confirm(
      'Confirm closing?',
      `Close ${when} with a closing balance of ${balance}? A closing can't be edited after it is saved.`
    );
    if (!ok) return;

    this.saving.set(true);
    this.errorMessage.set(null);

    const dto = new CreateDailyCashClosingDto({
      closingDate: new Date(this.date()),
      expectedClosingBalance: p.closingBalance,
      remarks: this.remarks.value.trim() || undefined
    });

    this.client.dailyCashClosingPOST(dto).subscribe({
      next: () => {
        this.saving.set(false);
        this.remarks.markAsPristine();
        this.notify.success('Day closed successfully.');
        this.router.navigate(['/cash-closing']);
      },
      error: (err: any) => {
        this.saving.set(false);
        const msg = extractErrorMessage(err, 'Could not save the closing.');
        this.errorMessage.set(msg);
        this.notify.danger(msg);
        this.loadPreview(true); // figures may have changed: refresh them without wiping the message
      }
    });
  }

  async cancel(): Promise<void> {
    if (this.remarks.dirty) {
      const ok = await this.alert.confirm('Discard changes?', 'You have unsaved remarks. Are you sure you want to leave?');
      if (!ok) return;
    }
    this.router.navigate(['/cash-closing']);
  }
}