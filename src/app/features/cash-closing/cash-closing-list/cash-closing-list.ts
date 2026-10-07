import { Component, HostListener, OnInit, inject, signal, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DatePipe, DecimalPipe } from '@angular/common';
import { Client, DailyCashClosingDto } from '../../../core/api/api-client';
import { NotificationService } from '../../../shared/notification/notification.service';
import { PageHeader } from '../../../shared/page-header/page-header';
import { extractErrorMessage } from '../../../shared/utils/api-error';

@Component({
  selector: 'app-cash-closing-list',
  standalone: true,
  imports: [RouterLink, PageHeader, DatePipe, DecimalPipe],
  templateUrl: './cash-closing-list.html',
  styleUrl: './cash-closing-list.css'
})
export class CashClosingList implements OnInit {
  private client = inject(Client);
  private notify = inject(NotificationService);

  readonly closings = signal<DailyCashClosingDto[]>([]);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);

  readonly fromDate = signal('');
  readonly toDate = signal('');
  readonly selected = signal<DailyCashClosingDto | null>(null);

  readonly hasFilters = computed(() => !!(this.fromDate() || this.toDate()));
  readonly totals = computed(() =>
    this.closings().reduce(
      (a, c) => ({ sales: a.sales + (c.totalSales ?? 0), expenses: a.expenses + (c.totalExpenses ?? 0) }),
      { sales: 0, expenses: 0 }
    )
  );

  private requestId = 0;

  ngOnInit(): void { this.load(); }

  load(): void {
    const reqId = ++this.requestId;
    this.loading.set(true);
    this.errorMessage.set(null);

    const from = this.fromDate() ? new Date(this.fromDate()) : undefined;
    const to = this.toDate() ? new Date(this.toDate()) : undefined;

    this.client.dailyCashClosingAll(from, to).subscribe({
      next: (data) => {
        if (reqId !== this.requestId) return;
        this.closings.set(data);
        this.loading.set(false);
      },
      error: (err: any) => {
        if (reqId !== this.requestId) return;
        const msg = extractErrorMessage(err, 'Could not load cash closings.');
        this.errorMessage.set(msg);
        this.notify.danger(msg);
        this.loading.set(false);
      }
    });
  }

  onFromChange(event: Event): void { this.fromDate.set((event.target as HTMLInputElement).value); this.load(); }
  onToChange(event: Event): void { this.toDate.set((event.target as HTMLInputElement).value); this.load(); }
  clearFilters(): void { this.fromDate.set(''); this.toDate.set(''); this.load(); }

  open(c: DailyCashClosingDto): void { this.selected.set(c); }
  close(): void { this.selected.set(null); }

  @HostListener('document:keydown.escape')
  onEscape(): void { this.close(); }
}