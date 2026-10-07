import { Component, ElementRef, OnDestroy, OnInit, ViewChild, inject, signal, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DatePipe, DecimalPipe } from '@angular/common';
import { Client, ExpenseDto, ExpenseCategoryDto } from '../../../core/api/api-client';
import { NotificationService } from '../../../shared/notification/notification.service';
import { AlertService } from '../../../shared/alert/alert.service';
import { PageHeader } from '../../../shared/page-header/page-header';
import { extractErrorMessage } from '../../../shared/utils/api-error';

const PAGE_SIZE = 20;

@Component({
  selector: 'app-expense-list',
  standalone: true,
  imports: [RouterLink, PageHeader, DatePipe, DecimalPipe],
  templateUrl: './expense-list.html',
  styleUrl: './expense-list.css'
})
export class ExpenseList implements OnInit, OnDestroy {
  private client = inject(Client);
  private notify = inject(NotificationService);
  private alert = inject(AlertService);

  readonly expenses = signal<ExpenseDto[]>([]);
  readonly categories = signal<ExpenseCategoryDto[]>([]);
  readonly loading = signal(true);          // first page / filter change
  readonly loadingMore = signal(false);     // next pages while scrolling
  readonly loadMoreFailed = signal(false);
  readonly errorMessage = signal<string | null>(null);

  // Filters (server-side)
  readonly showFilters = signal(false);
  readonly search = signal('');
  readonly categoryId = signal<number | null>(null);
  readonly fromDate = signal('');
  readonly toDate = signal('');

  // Lazy-loading state
  private page = 1;
  readonly totalCount = signal(0);
  readonly totalAmount = signal(0);
  readonly hasMore = computed(() => this.expenses().length < this.totalCount());

  readonly activeFilterCount = computed(
    () => (this.categoryId() ? 1 : 0) + (this.fromDate() ? 1 : 0) + (this.toDate() ? 1 : 0)
  );
  readonly hasFilters = computed(() => this.activeFilterCount() > 0 || !!this.search());

  private searchTimer: ReturnType<typeof setTimeout> | null = null;
  private requestId = 0; // ignore responses from outdated requests

  // ---- infinite scroll sentinel ----
  private observer: IntersectionObserver | null = null;
  private sentinelEl: HTMLElement | null = null;

  @ViewChild('sentinel') set sentinel(ref: ElementRef<HTMLElement> | undefined) {
    this.observer?.disconnect();
    this.observer = null;
    this.sentinelEl = ref?.nativeElement ?? null;
    if (!this.sentinelEl) return;

    this.observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) this.loadMore();
      },
      { rootMargin: '0px 0px 300px 0px' } // start loading a bit before the user hits the bottom
    );
    this.observer.observe(this.sentinelEl);
  }

  ngOnInit(): void {
    this.client.expenseCategoriesAll().subscribe({ next: (d) => this.categories.set(d) });
    this.fetch(true);
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
    if (this.searchTimer) clearTimeout(this.searchTimer);
  }

  // ---------- data ----------
  private fetch(reset: boolean): void {
    const nextPage = reset ? 1 : this.page + 1;
    const reqId = ++this.requestId;

    if (reset) {
      this.loading.set(true);
      this.loadingMore.set(false);
      this.errorMessage.set(null);
    } else {
      this.loadingMore.set(true);
    }
    this.loadMoreFailed.set(false);

    // 'yyyy-MM-dd' parses as UTC midnight, same convention as sale-form.
    const from = this.fromDate() ? (new Date(this.fromDate()) as any) : undefined;
    const to = this.toDate() ? (new Date(this.toDate()) as any) : undefined;

    this.client.expensesGET(
      this.categoryId() ?? undefined, from, to,
      this.search().trim() || undefined,
      nextPage, PAGE_SIZE
    ).subscribe({
      next: (res) => {
        if (reqId !== this.requestId) return; // a newer request superseded this one
        const items = res.items ?? [];
        this.expenses.set(reset ? items : [...this.expenses(), ...items]);
        this.page = nextPage;
        this.totalCount.set(res.totalCount ?? 0);
        this.totalAmount.set(res.totalAmount ?? 0);
        this.loading.set(false);
        this.loadingMore.set(false);
        this.rearmObserver();
      },
      error: (err: any) => {
        if (reqId !== this.requestId) return;
        const msg = extractErrorMessage(err, 'Could not load expenses.');
        this.loading.set(false);
        this.loadingMore.set(false);
        if (reset) this.errorMessage.set(msg);
        else this.loadMoreFailed.set(true);
        this.notify.danger(msg);
      }
    });
  }

  loadMore(): void {
    if (this.loading() || this.loadingMore() || this.loadMoreFailed() || !this.hasMore()) return;
    this.fetch(false);
  }

  retryLoadMore(): void {
    this.loadMoreFailed.set(false);
    this.loadMore();
  }

  // If the sentinel is still on screen after rows were appended (tall screens),
  // IntersectionObserver won't fire again by itself. Re-observing forces a fresh check.
  private rearmObserver(): void {
    setTimeout(() => {
      if (this.observer && this.sentinelEl) {
        this.observer.unobserve(this.sentinelEl);
        this.observer.observe(this.sentinelEl);
      }
    });
  }

  // ---------- filters ----------
  toggleFilters(): void { this.showFilters.update((v) => !v); }

  onSearch(event: Event): void {
    this.search.set((event.target as HTMLInputElement).value);
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.fetch(true), 350);
  }

  clearSearch(): void { this.search.set(''); this.fetch(true); }

  onCategoryChange(event: Event): void {
    const v = (event.target as HTMLSelectElement).value;
    this.categoryId.set(v ? Number(v) : null);
    this.fetch(true);
  }

  onFromChange(event: Event): void { this.fromDate.set((event.target as HTMLInputElement).value); this.fetch(true); }
  onToChange(event: Event): void { this.toDate.set((event.target as HTMLInputElement).value); this.fetch(true); }

  clearFilters(): void {
    this.search.set(''); this.categoryId.set(null); this.fromDate.set(''); this.toDate.set('');
    this.fetch(true);
  }

  // ---------- delete ----------
  async remove(expense: ExpenseDto): Promise<void> {
    const confirmed = await this.alert.confirmDelete(expense.expenseNo!);
    if (!confirmed) return;

    this.client.expensesDELETE(expense.id!).subscribe({
      next: () => {
        // Update locally: no reload, so the user keeps their scroll position.
        this.expenses.update((list) => list.filter((e) => e.id !== expense.id));
        this.totalCount.update((n) => Math.max(0, n - 1));
        this.totalAmount.update((a) => Math.max(0, a - (expense.amount ?? 0)));
        this.notify.danger(`Expense "${expense.expenseNo}" was deleted.`, 'Deleted');
        this.rearmObserver();
      },
      error: (err: any) => this.notify.danger(extractErrorMessage(err, 'Could not delete expense.'))
    });
  }
}