import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Client, RoleDto } from '../../../core/api/api-client';
import { NotificationService } from '../../../shared/notification/notification.service';
import { AlertService } from '../../../shared/alert/alert.service';
import { PageHeader } from "../../../shared/page-header/page-header";

@Component({
  selector: 'app-role-list',
  standalone: true,
  imports: [RouterLink, PageHeader],
  templateUrl: './role-list.html'
})
export class RoleList implements OnInit {
  private client = inject(Client);
  private notify = inject(NotificationService);
  private alert = inject(AlertService);

  readonly roles = signal<RoleDto[]>([]);
  readonly loading = signal(true);

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.client.rolesAll().subscribe({
      next: (data) => {
        this.roles.set(data);
        this.loading.set(false);
      },
      error: () => {
        this.notify.danger('Could not load roles.');
        this.loading.set(false);
      }
    });
  }

  async remove(role: RoleDto): Promise<void> {
    const confirmed = await this.alert.confirmDelete(role.name!);
    if (!confirmed) return;

    this.client.rolesDELETE(role.id!).subscribe({
      next: () => {
        this.roles.update((list) => list.filter((r) => r.id !== role.id));
        this.notify.danger(`Role "${role.name}" was deleted.`, 'Deleted');
      },
      error: (err) => {
        const message = typeof err.error === 'string' ? err.error : `Could not delete "${role.name}".`;
        this.notify.danger(message);
      }
    });
  }
}