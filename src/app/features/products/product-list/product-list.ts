import { Component, OnInit, AfterViewInit, OnDestroy, ElementRef, ViewChild, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Subject, debounceTime } from 'rxjs';
import { Client, ProductDto, CategoryDto, BrandDto, UnitDto } from '../../../core/api/api-client';
import { NotificationService } from '../../../shared/notification/notification.service';
import { AlertService } from '../../../shared/alert/alert.service';
import { PageHeader } from '../../../shared/page-header/page-header';
import { DecimalPipe } from '@angular/common';

const PAGE_SIZE = 20;

@Component({
  selector: 'app-product-list',
  standalone: true,
  imports: [RouterLink, PageHeader, DecimalPipe],
  templateUrl: './product-list.html',
  styleUrl: './product-list.css'
})
export class ProductList implements OnInit, AfterViewInit, OnDestroy {
  private client = inject(Client);
  private notify = inject(NotificationService);
  private alert = inject(AlertService);

  @ViewChild('scrollSentinel') scrollSentinel?: ElementRef<HTMLDivElement>;
  private observer?: IntersectionObserver;

  readonly products = signal<ProductDto[]>([]);
  readonly totalCount = signal(0);
  readonly hasMore = signal(true);
  readonly loading = signal(true);
  readonly loadingMore = signal(false);
  readonly errorMessage = signal<string | null>(null);

  private currentPage = 1;

  // ---------------------------------------------------------
  // Filters
  // ---------------------------------------------------------
  readonly globalSearch = signal('');
  readonly categoryFilter = signal<number | null>(null);
  readonly brandFilter = signal<number | null>(null);
  readonly unitFilter = signal<number | null>(null);
  readonly showAdvanceFilter = signal(false);

  readonly allCategories = signal<CategoryDto[]>([]);
  readonly allBrands = signal<BrandDto[]>([]);
  readonly allUnits = signal<UnitDto[]>([]);

  private filterChanged$ = new Subject<void>();

  ngOnInit(): void {
    this.client.categoriesAll().subscribe({ next: (d) => this.allCategories.set(d) });
    this.client.brandsAll().subscribe({ next: (d) => this.allBrands.set(d) });
    this.client.unitsAll().subscribe({ next: (d) => this.allUnits.set(d) });

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
    this.products.set([]);
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
    this.client
      .search(
        this.globalSearch() || undefined,
        undefined, // name (handled by global search)
        undefined, // productCode (handled by global search)
        this.categoryFilter() ?? undefined,
        this.brandFilter() ?? undefined,
        this.unitFilter() ?? undefined,
        this.currentPage,
        PAGE_SIZE
      )
      .subscribe({
        next: (result : any) => {
          this.products.update((list) => [...list, ...(result.items ?? [])]);
          this.totalCount.set(result.totalCount ?? 0);
          this.hasMore.set(result.hasMore ?? false);
          this.loading.set(false);
          this.loadingMore.set(false);
        },
        error: () => {
          this.errorMessage.set('Could not load products.');
          this.notify.danger('Could not load products.');
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

  onCategoryFilter(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.categoryFilter.set(value ? Number(value) : null);
    this.filterChanged$.next();
  }

  onBrandFilter(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.brandFilter.set(value ? Number(value) : null);
    this.filterChanged$.next();
  }

  onUnitFilter(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.unitFilter.set(value ? Number(value) : null);
    this.filterChanged$.next();
  }

  clearFilters(): void {
    this.globalSearch.set('');
    this.categoryFilter.set(null);
    this.brandFilter.set(null);
    this.unitFilter.set(null);
    this.filterChanged$.next();
  }

  async remove(product: ProductDto): Promise<void> {
    const confirmed = await this.alert.confirmDelete(product.name!);
    if (!confirmed) return;

    this.client.productsDELETE(product.id!).subscribe({
      next: () => {
        this.products.update((list) => list.filter((p) => p.id !== product.id));
        this.totalCount.update((n) => Math.max(0, n - 1));
        this.notify.danger(`Product "${product.name}" was deleted.`, 'Deleted');
      },
      error: (err) => {
        const message = typeof err.error === 'string' ? err.error : err.error?.message ?? `Could not delete "${product.name}".`;
        this.notify.danger(message);
      }
    });
  }

  avatarColor(name?: string): string {
    const palette = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ef4444', '#14b8a6'];
    const code = (name ?? '?').charCodeAt(0) || 0;
    return palette[code % palette.length];
  }

  initial(name?: string): string {
    return (name ?? '?').charAt(0).toUpperCase();
  }
}