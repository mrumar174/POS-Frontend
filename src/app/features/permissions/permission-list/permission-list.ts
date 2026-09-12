import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Client, PermissionDto } from '../../../core/api/api-client';
import { NotificationService } from '../../../shared/notification/notification.service';
import { PageHeader } from "../../../shared/page-header/page-header";

@Component({
  selector: 'app-permission-list',
  standalone: true,
  imports: [RouterLink, PageHeader],
  templateUrl: './permission-list.html'
})
export class PermissionList implements OnInit {
  private client = inject(Client);
  private notify = inject(NotificationService);

  readonly permissions = signal<PermissionDto[]>([]);
  readonly loading = signal(true);

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.client.permissionsAll(undefined).subscribe({
      next: (data) => {
        this.permissions.set(data);
        this.loading.set(false);
      },
      error: () => {
        this.notify.danger('Could not load permissions.');
        this.loading.set(false);
      }
    });
  }
}