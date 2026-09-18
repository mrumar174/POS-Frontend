import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Client, TenantDto } from '../../../core/api/api-client';
import { NotificationService } from '../../../shared/notification/notification.service';
import { PageHeader } from '../../../shared/page-header/page-header';

@Component({
  selector: 'app-tenant-list',
  standalone: true,
  imports: [RouterLink, PageHeader],
  templateUrl: './tenant-list.html',
  styleUrl: './tenant-list.css'
})
export class TenantList implements OnInit {
  private client = inject(Client);
  private notify = inject(NotificationService);

  readonly tenants = signal<TenantDto[]>([]);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);

  readonly globalSearch = signal('');

  readonly filteredTenants = computed(() => {
    const all = this.tenants();
    const search = this.globalSearch().trim().toLowerCase();
    if (!search) return all;

    return all.filter((t) => {
      const business = (t.businessName ?? '').toLowerCase();
      const owner = (t.ownerName ?? '').toLowerCase();
      const code = (t.code ?? '').toLowerCase();
      return business.includes(search) || owner.includes(search) || code.includes(search);
    });
  });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.errorMessage.set(null);
    this.client.tenantsAll().subscribe({
      next: (data) => {
        this.tenants.set(data);
        this.loading.set(false);
      },
      error: () => {
        this.errorMessage.set('Could not load tenants.');
        this.notify.danger('Could not load tenants.');
        this.loading.set(false);
      }
    });
  }

  onGlobalSearch(event: Event): void {
    this.globalSearch.set((event.target as HTMLInputElement).value);
  }

  clearGlobalSearch(): void {
    this.globalSearch.set('');
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