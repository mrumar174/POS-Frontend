import { Component, OnInit, AfterViewInit, OnDestroy, ElementRef, ViewChild, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { Subject, debounceTime } from 'rxjs';
import { Client, SupplierPaymentDto, SupplierDto } from '../../../core/api/api-client';
import { NotificationService } from '../../../shared/notification/notification.service';
import { AlertService } from '../../../shared/alert/alert.service';
import { PageHeader } from '../../../shared/page-header/page-header';
import { DatePipe, DecimalPipe } from '@angular/common';

const PAGE_SIZE = 20;

@Component({
  selector: 'app-supplier-payment-list',
  standalone: true,
  imports: [RouterLink, PageHeader, DecimalPipe, DatePipe],
  templateUrl: './supplier-payment-list.html',
  styleUrl: './supplier-payment-list.css'
})
export class SupplierPaymentList implements OnInit, AfterViewInit, OnDestroy {
  private client = inject(Client);
  private notify = inject(NotificationService);
  private alert = inject(AlertService);

  @ViewChild('scrollSentinel') scrollSentinel?: ElementRef<HTMLDivElement>;
  private observer?: IntersectionObserver;

  readonly payments = signal<SupplierPaymentDto[]>([]);
  readonly totalCount = signal(0);
  readonly hasMore = signal(true);
  readonly loading = signal(true);
  readonly loadingMore = signal(false);
  readonly errorMessage = signal<string | null>(null);

  private currentPage = 1;

  readonly globalSearch = signal(''); // matches PaymentNo
  readonly supplierFilter = signal<number | null>(null);
  readonly fromDate = signal<string>('');
  readonly toDate = signal<string>('');
  readonly showAdvanceFilter = signal(false);

  readonly allSuppliers = signal<SupplierDto[]>([]);

  private filterChanged$ = new Subject<void>();

  ngOnInit(): void {
    this.client.suppliersAll().subscribe({ next: (d) => this.allSuppliers.set(d) });

    this.filterChanged$.pipe(debounceTime(350)).subscribe(() => this.reload());
    this.reload();
  }

  ngAfterViewInit(): void {
    if (!this.scrollSentinel) return;
    this.observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && this.hasMore() && !this.loading() && !this.loadingMore()) {
          this.loadNextPage();
        }
      },
      { rootMargin: '200px' }
    );
    this.observer.observe(this.scrollSentinel.nativeElement);
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }

  private reload(): void {
    this.currentPage = 1;
    this.payments.set([]);
    this.hasMore.set(true);
    this.loading.set(true);
    this.errorMessage.set(null);
    this.fetchPage();
  }

  private loadNextPage(): void {
    this.currentPage++;
    this.loadingMore.set(true);
    this.fetchPage();
  }

  private fetchPage(): void {
    const from = this.fromDate() ? new Date(this.fromDate()) : undefined;
    const to = this.toDate() ? new Date(this.toDate()) : undefined;

    this.client
      .search3(
        this.supplierFilter() ?? undefined, // supplierId
        undefined,                          // purchaseId (not used in list view)
        this.globalSearch() || undefined,   // paymentNo
        from,                               // fromDate
        to,                                 // toDate
        this.currentPage,                   // page
        PAGE_SIZE                           // pageSize
      )
      .subscribe({
        next: (result) => {
          this.payments.update((list) => [
            ...list,
            ...(result.items ?? [])
          ]);

          this.totalCount.set(result.totalCount ?? 0);

          this.hasMore.set(
            this.currentPage * PAGE_SIZE < (result.totalCount ?? 0)
          );

          this.loading.set(false);
          this.loadingMore.set(false);
        },
        error: (err: HttpErrorResponse) => {
          const msg = this.extractErrorMessage(
            err,
            'Could not load supplier payments.'
          );

          this.errorMessage.set(msg);
          this.notify.danger(msg);
          this.loading.set(false);
          this.loadingMore.set(false);
        }
      });
  }

  toggleAdvanceFilter(): void {
    this.showAdvanceFilter.update((v) => !v);
  }

  onGlobalSearch(event: Event): void {
    this.globalSearch.set((event.target as HTMLInputElement).value);
    this.filterChanged$.next();
  }

  clearGlobalSearch(): void {
    this.globalSearch.set('');
    this.filterChanged$.next();
  }

  onSupplierFilter(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.supplierFilter.set(value ? Number(value) : null);
    this.filterChanged$.next();
  }

  onFromDate(event: Event): void {
    this.fromDate.set((event.target as HTMLInputElement).value);
    this.filterChanged$.next();
  }

  onToDate(event: Event): void {
    this.toDate.set((event.target as HTMLInputElement).value);
    this.filterChanged$.next();
  }

  clearFilters(): void {
    this.globalSearch.set('');
    this.supplierFilter.set(null);
    this.fromDate.set('');
    this.toDate.set('');
    this.filterChanged$.next();
  }

  async remove(payment: SupplierPaymentDto): Promise<void> {
    const confirmed = await this.alert.confirmDelete(payment.paymentNo!);
    if (!confirmed) return;

    this.client.supplierPaymentsDELETE(payment.id!).subscribe({
      next: () => {
        this.payments.update((list) => list.filter((p) => p.id !== payment.id));
        this.totalCount.update((n) => Math.max(0, n - 1));
        this.notify.danger(`Payment "${payment.paymentNo}" was deleted.`, 'Deleted');
      },
      error: (err: HttpErrorResponse) => {
        const msg = this.extractErrorMessage(err, `Could not delete "${payment.paymentNo}".`);
        this.notify.danger(msg);
      }
    });
  }

  private extractErrorMessage(err: any, defaultMessage: string): string {
    if (err.response) {
      try {
        const parsed = JSON.parse(err.response);
        if (parsed.message) return parsed.message;
        if (parsed.detail) return parsed.detail;
        if (parsed.title) return parsed.title;
      } catch {
        if (typeof err.response === 'string' && err.response.trim() !== '') {
          return err.response;
        }
      }
    }

    if (err.error) {
      if (typeof err.error === 'string') return err.error;
      if (err.error.message) return err.error.message;
      if (err.error.detail) return err.error.detail;
      if (err.error.title) return err.error.title;
    }
    return err.message || defaultMessage;
  }
}