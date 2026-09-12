import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Client, UserDto } from '../../../core/api/api-client';
import { NotificationService } from '../../../shared/notification/notification.service';
import { AlertService } from '../../../shared/alert/alert.service';
import { PageHeader } from "../../../shared/page-header/page-header";

@Component({
  selector: 'app-user-list',
  standalone: true,
  imports: [RouterLink, PageHeader],
  templateUrl: './user-list.html'
})
export class UserList implements OnInit {
  private client = inject(Client);
  private notify = inject(NotificationService);
  private alert = inject(AlertService);

  readonly users = signal<UserDto[]>([]);
  readonly loading = signal(true);

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.client.usersAll().subscribe({
      next: (data) => {
        this.users.set(data);
        this.loading.set(false);
      },
      error: () => {
        this.notify.danger('Could not load users.');
        this.loading.set(false);
      }
    });
  }

  async remove(user: UserDto): Promise<void> {
    const confirmed = await this.alert.confirmDelete(user.userName!);
    if (!confirmed) return;

    this.client.usersDELETE(user.id!).subscribe({
      next: () => {
        this.users.update((list) => list.filter((u) => u.id !== user.id));
        this.notify.danger(`User "${user.userName}" was deleted.`, 'Deleted');
      },
      error: (err) => {
        const message = typeof err.error === 'string' ? err.error : `Could not delete "${user.userName}".`;
        this.notify.danger(message);
      }
    });
  }
}