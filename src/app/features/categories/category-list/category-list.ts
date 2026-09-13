import { Component, OnInit, AfterViewInit, OnDestroy, ElementRef, ViewChild, inject, signal, computed } from '@angular/core';
import { RouterLink } from '@angular/router';

import { Client, CategoryDto } from '../../../core/api/api-client';
import { NotificationService } from '../../../shared/notification/notification.service';
import { AlertService } from '../../../shared/alert/alert.service';
import { PageHeader } from '../../../shared/page-header/page-header';

const PAGE_SIZE = 20;

@Component({
  selector: 'app-category-list',
  standalone: true,
  imports: [RouterLink, PageHeader],
  templateUrl: './category-list.html',
  styleUrl: './category-list.css'
})
export class CategoryList implements OnInit, AfterViewInit, OnDestroy {
  private client = inject(Client);
  private notify = inject(NotificationService);
  private alert = inject(AlertService);

  @ViewChild('scrollSentinel') scrollSentinel?: ElementRef<HTMLDivElement>;
  private observer?: IntersectionObserver;

  // ---------------------------------------------------------
  // Raw data — fetched once from GetAll()
  // ---------------------------------------------------------
  readonly allCategories = signal<CategoryDto[]>([]);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);

  // ---------------------------------------------------------
  // Filters
  // ---------------------------------------------------------
  readonly globalSearch = signal('');
  readonly nameFilter = signal('');
  readonly descriptionFilter = signal('');
  readonly showAdvanceFilter = signal(false);

  // ---------------------------------------------------------
  // Client-side pagination (how many of the filtered results to show)
  // ---------------------------------------------------------
  readonly visibleCount = signal(PAGE_SIZE);

  // ---------------------------------------------------------
  // Filtered result — recomputed whenever data or filters change
  // ---------------------------------------------------------
  readonly filteredCategories = computed(() => {
    const all = this.allCategories();
    const global = this.globalSearch().trim().toLowerCase();
    const name = this.nameFilter().trim().toLowerCase();
    const description = this.descriptionFilter().trim().toLowerCase();

    return all.filter((category) => {
      const categoryName = (category.name ?? '').toLowerCase();
      const categoryDescription = (category.description ?? '').toLowerCase();

      if (global && !categoryName.includes(global)) return false;
      if (name && !categoryName.includes(name)) return false;
      if (description && !categoryDescription.includes(description)) return false;

      return true;
    });
  });

  // Slice of filteredCategories actually rendered right now
  readonly visibleCategories = computed(() => this.filteredCategories().slice(0, this.visibleCount()));

  readonly hasMore = computed(() => this.visibleCount() < this.filteredCategories().length);

  ngOnInit(): void {
    this.load();
  }

  ngAfterViewInit(): void {
    if (!this.scrollSentinel) return;

    this.observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && this.hasMore()) {
          this.visibleCount.update((n) => n + PAGE_SIZE);
        }
      },
      { rootMargin: '200px' }
    );
    this.observer.observe(this.scrollSentinel.nativeElement);
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }

  load(): void {
    this.loading.set(true);
    this.errorMessage.set(null);

    this.client.categoriesAll().subscribe({
      next: (data) => {
        this.allCategories.set(data);
        this.loading.set(false);
      },
      error: (err) => {
        console.error('Categories loading error:', err);
        this.errorMessage.set('Could not load categories.');
        this.notify.danger('Could not load categories.');
        this.loading.set(false);
      }
    });
  }

  // ---------------------------------------------------------
  // Filter handlers — any change resets pagination back to page 1
  // ---------------------------------------------------------
  toggleAdvanceFilter(): void {
    this.showAdvanceFilter.update((v) => !v);
  }

  onGlobalSearch(event: Event): void {
    this.globalSearch.set((event.target as HTMLInputElement).value);
    this.visibleCount.set(PAGE_SIZE);
  }

  clearGlobalSearch(): void {
    this.globalSearch.set('');
    this.visibleCount.set(PAGE_SIZE);
  }

  onNameFilter(event: Event): void {
    this.nameFilter.set((event.target as HTMLInputElement).value);
    this.visibleCount.set(PAGE_SIZE);
  }

  onDescriptionFilter(event: Event): void {
    this.descriptionFilter.set((event.target as HTMLInputElement).value);
    this.visibleCount.set(PAGE_SIZE);
  }

  clearFilters(): void {
    this.globalSearch.set('');
    this.nameFilter.set('');
    this.descriptionFilter.set('');
    this.visibleCount.set(PAGE_SIZE);
  }

  // ---------------------------------------------------------
  // Delete
  // ---------------------------------------------------------
  async remove(category: CategoryDto): Promise<void> {
    const confirmed = await this.alert.confirmDelete(category.name!);
    if (!confirmed) return;

    this.client.categoriesDELETE(category.id!).subscribe({
      next: () => {
        this.allCategories.update((list) => list.filter((c) => c.id !== category.id));
        this.notify.danger(`Category "${category.name}" was deleted.`, 'Deleted');
      },
      error: () => this.notify.danger(`Could not delete "${category.name}".`)
    });
  }

  // ---------------------------------------------------------
  // UI helpers
  // ---------------------------------------------------------
  avatarColor(name?: string): string {
    const palette = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ef4444', '#14b8a6'];
    const code = (name ?? '?').charCodeAt(0) || 0;
    return palette[code % palette.length];
  }

  initial(name?: string): string {
    return (name ?? '?').charAt(0).toUpperCase();
  }
}