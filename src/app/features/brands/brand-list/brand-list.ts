import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Client, BrandDto } from '../../../core/api/api-client';
import { NotificationService } from '../../../shared/notification/notification.service';
import { AlertService } from '../../../shared/alert/alert.service';
import { PageHeader } from '../../../shared/page-header/page-header';

@Component({
  selector: 'app-brand-list',
  standalone: true,
  imports: [RouterLink, PageHeader],
  templateUrl: './brand-list.html',
  styleUrl: './brand-list.css'
})
export class BrandList implements OnInit {
  private client = inject(Client);
  private notify = inject(NotificationService);
  private alert = inject(AlertService);

  readonly brands = signal<BrandDto[]>([]);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);

  // ---------------------------------------------------------
  // Filters
  // ---------------------------------------------------------
  readonly globalSearch = signal('');
  readonly nameFilter = signal('');
  readonly descriptionFilter = signal('');
  readonly showAdvanceFilter = signal(false);

  readonly filteredBrands = computed(() => {
    const all = this.brands();
    const global = this.globalSearch().trim().toLowerCase();
    const name = this.nameFilter().trim().toLowerCase();
    const description = this.descriptionFilter().trim().toLowerCase();

    return all.filter((brand) => {
      const brandName = (brand.name ?? '').toLowerCase();
      const brandDescription = (brand.description ?? '').toLowerCase();

      if (global && !brandName.includes(global)) return false;
      if (name && !brandName.includes(name)) return false;
      if (description && !brandDescription.includes(description)) return false;

      return true;
    });
  });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.errorMessage.set(null);
    this.client.brandsAll().subscribe({
      next: (data) => {
        this.brands.set(data);
        this.loading.set(false);
      },
      error: () => {
        this.errorMessage.set('Could not load brands.');
        this.notify.danger('Could not load brands.');
        this.loading.set(false);
      }
    });
  }

  toggleAdvanceFilter(): void {
    this.showAdvanceFilter.update((v) => !v);
  }

  onGlobalSearch(event: Event): void {
    this.globalSearch.set((event.target as HTMLInputElement).value);
  }

  clearGlobalSearch(): void {
    this.globalSearch.set('');
  }

  onNameFilter(event: Event): void {
    this.nameFilter.set((event.target as HTMLInputElement).value);
  }

  onDescriptionFilter(event: Event): void {
    this.descriptionFilter.set((event.target as HTMLInputElement).value);
  }

  clearFilters(): void {
    this.globalSearch.set('');
    this.nameFilter.set('');
    this.descriptionFilter.set('');
  }

  async remove(brand: BrandDto): Promise<void> {
    const confirmed = await this.alert.confirmDelete(brand.name!);
    if (!confirmed) return;

    this.client.brandsDELETE(brand.id!).subscribe({
      next: () => {
        this.brands.update((list) => list.filter((b) => b.id !== brand.id));
        this.notify.danger(`Brand "${brand.name}" was deleted.`, 'Deleted');
      },
      error: (err) => this.notify.danger(err.error?.message ?? `Could not delete "${brand.name}".`)
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