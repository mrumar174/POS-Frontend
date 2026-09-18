import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Client, ShopDto } from '../../../core/api/api-client';
import { NotificationService } from '../../../shared/notification/notification.service';
import { AlertService } from '../../../shared/alert/alert.service';
import { PageHeader } from '../../../shared/page-header/page-header';

@Component({
  selector: 'app-shop-list',
  standalone: true,
  imports: [RouterLink, PageHeader],
  templateUrl: './shop-list.html',
  styleUrl: './shop-list.css'
})
export class ShopList implements OnInit {
  private client = inject(Client);
  private notify = inject(NotificationService);
  private alert = inject(AlertService);

  readonly shops = signal<ShopDto[]>([]);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);

  readonly globalSearch = signal('');
  readonly cityFilter = signal('');
  readonly showAdvanceFilter = signal(false);

  readonly filteredShops = computed(() => {
    const all = this.shops();
    const global = this.globalSearch().trim().toLowerCase();
    const city = this.cityFilter().trim().toLowerCase();

    return all.filter((shop) => {
      const shopName = (shop.name ?? '').toLowerCase();
      const shopCode = (shop.code ?? '').toLowerCase();
      const shopCity = (shop.city ?? '').toLowerCase();

      if (global && !shopName.includes(global) && !shopCode.includes(global)) return false;
      if (city && !shopCity.includes(city)) return false;

      return true;
    });
  });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.errorMessage.set(null);
    this.client.shopsAll().subscribe({
      next: (data) => {
        this.shops.set(data);
        this.loading.set(false);
      },
      error: () => {
        this.errorMessage.set('Could not load shops.');
        this.notify.danger('Could not load shops.');
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

  onCityFilter(event: Event): void {
    this.cityFilter.set((event.target as HTMLInputElement).value);
  }

  clearFilters(): void {
    this.globalSearch.set('');
    this.cityFilter.set('');
  }

  async remove(shop: ShopDto): Promise<void> {
    const confirmed = await this.alert.confirmDelete(shop.name!);
    if (!confirmed) return;

    this.client.shopsDELETE(shop.id!).subscribe({
      next: () => {
        this.shops.update((list) => list.filter((s) => s.id !== shop.id));
        this.notify.danger(`Shop "${shop.name}" was deleted.`, 'Deleted');
      },
      error: (err) => {
        const message = typeof err.error === 'string' ? err.error : `Could not delete "${shop.name}".`;
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