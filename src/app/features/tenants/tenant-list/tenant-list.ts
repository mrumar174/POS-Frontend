import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Client, TenantDto } from '../../../core/api/api-client';
import { NotificationService } from '../../../shared/notification/notification.service';
import { PageHeader } from "../../../shared/page-header/page-header";

@Component({
  selector: 'app-tenant-list',
  standalone: true,
  imports: [RouterLink, PageHeader],
  templateUrl: './tenant-list.html'
})
export class TenantList implements OnInit {
  private client = inject(Client);
  private notify = inject(NotificationService);

  readonly tenants = signal<TenantDto[]>([]);
  readonly loading = signal(true);

  ngOnInit(): void {
    this.client.tenantsAll().subscribe({
      next: (data) => {
        this.tenants.set(data);
        this.loading.set(false);
      },
      error: () => {
        this.notify.danger('Could not load tenants.');
        this.loading.set(false);
      }
    });
  }
}   