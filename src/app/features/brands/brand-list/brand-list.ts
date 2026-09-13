import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Client, BrandDto } from '../../../core/api/api-client';
import { NotificationService } from '../../../shared/notification/notification.service';
import { AlertService } from '../../../shared/alert/alert.service';
import { PageHeader } from '../../../shared/page-header/page-header';

@Component({
  selector: 'app-brand-list',
  standalone: true,
  imports: [RouterLink, PageHeader],
  templateUrl: './brand-list.html'
})
export class BrandList implements OnInit {
  private client = inject(Client);
  private notify = inject(NotificationService);
  private alert = inject(AlertService);

  readonly brands = signal<BrandDto[]>([]);
  readonly loading = signal(true);

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.client.brandsAll().subscribe({
      next: (data) => { this.brands.set(data); this.loading.set(false); },
      error: () => { this.notify.danger('Could not load brands.'); this.loading.set(false); }
    });
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
}