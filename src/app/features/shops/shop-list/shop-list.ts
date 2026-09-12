import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Client, ShopDto } from '../../../core/api/api-client';
import { NotificationService } from '../../../shared/notification/notification.service';
import { AlertService } from '../../../shared/alert/alert.service';
import { PageHeader } from "../../../shared/page-header/page-header";

@Component({
  selector: 'app-shop-list',
  standalone: true,
  imports: [RouterLink, PageHeader],
  templateUrl: './shop-list.html'
})
export class ShopList implements OnInit {
  private client = inject(Client);
  private notify = inject(NotificationService);
  private alert = inject(AlertService);

  readonly shops = signal<ShopDto[]>([]);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);

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
}