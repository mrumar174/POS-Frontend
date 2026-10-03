import { Component, OnInit, AfterViewInit, OnDestroy, ElementRef, ViewChild, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Subject, debounceTime } from 'rxjs';
import { Client, PurchaseReturnDto, SupplierDto } from '../../../core/api/api-client';
import { NotificationService } from '../../../shared/notification/notification.service';
import { AlertService } from '../../../shared/alert/alert.service';
import { PageHeader } from '../../../shared/page-header/page-header';
import { DatePipe, DecimalPipe } from '@angular/common';

const PAGE_SIZE = 20;

@Component({
  selector: 'app-purchase-return-list',
  standalone: true,
  imports: [RouterLink, PageHeader, DatePipe, DecimalPipe],
  templateUrl: './purchase-return-list.html',
  styleUrl: './purchase-return-list.css'
})
export class PurchaseReturnList implements OnInit, AfterViewInit, OnDestroy {
  private client = inject(Client);
  private notify = inject(NotificationService);
  private alert = inject(AlertService);

  @ViewChild('scrollSentinel') scrollSentinel?: ElementRef<HTMLDivElement>;
  private observer?: IntersectionObserver;

  readonly returns = signal<PurchaseReturnDto[]>([]);
  readonly totalCount = signal(0);
  readonly hasMore = signal(true);
  readonly loading = signal(true);
  readonly loadingMore = signal(false);
  readonly errorMessage = signal<string | null>(null);

  private currentPage = 1;

  readonly globalSearch = signal(''); // matches ReturnNo
  readonly supplierFilter = signal<number | null>(null);
  readonly fromDate = signal('');
  readonly toDate = signal('');
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
    this.returns.set([]);
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
      .search2(
        this.globalSearch() || undefined,
        this.supplierFilter() ?? undefined,
        undefined, // purchaseId
        from as any,
        to as any,
        this.currentPage,
        PAGE_SIZE
      )
      .subscribe({
        next: (result) => {
          this.returns.update((list) => [...list, ...(result.items ?? [])]);
          this.totalCount.set(result.totalCount ?? 0);
          this.hasMore.set(result.hasMore ?? false);
          this.loading.set(false);
          this.loadingMore.set(false);
        },
        error: () => {
          this.errorMessage.set('Could not load purchase returns.');
          this.notify.danger('Could not load purchase returns.');
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

  async remove(purchaseReturn: PurchaseReturnDto): Promise<void> {
    const confirmed = await this.alert.confirmDelete(purchaseReturn.returnNo!);
    if (!confirmed) return;

    this.client.purchaseReturnsDELETE(purchaseReturn.id!).subscribe({
      next: () => {
        this.returns.update((list) => list.filter((r) => r.id !== purchaseReturn.id));
        this.totalCount.update((n) => Math.max(0, n - 1));
        this.notify.danger(`Return "${purchaseReturn.returnNo}" was deleted.`, 'Deleted');
      },
      error: (err) => this.notify.danger(err.error?.message ?? `Could not delete "${purchaseReturn.returnNo}".`)
    });
  }
}