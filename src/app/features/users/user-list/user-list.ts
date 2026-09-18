import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Client, UserDto } from '../../../core/api/api-client';
import { NotificationService } from '../../../shared/notification/notification.service';
import { AlertService } from '../../../shared/alert/alert.service';
import { PageHeader } from '../../../shared/page-header/page-header';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-user-list',
  standalone: true,
  imports: [RouterLink, PageHeader],
  templateUrl: './user-list.html',
  styleUrl: './user-list.css'
})
export class UserList implements OnInit {
  protected auth = inject(AuthService);

  readonly isSuperAdmin = computed(() => this.auth.hasRole('SuperAdmin'));
  readonly canCreateUser = computed(() => this.auth.hasRole('Admin') || this.isSuperAdmin());
  private client = inject(Client);
  private notify = inject(NotificationService);
  private alert = inject(AlertService);

  readonly users = signal<UserDto[]>([]);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);

  // ---------------------------------------------------------
  // Filters
  // ---------------------------------------------------------
  readonly globalSearch = signal('');
  readonly usernameFilter = signal('');
  readonly roleFilter = signal('');
  readonly showAdvanceFilter = signal(false);

  readonly filteredUsers = computed(() => {
    const all = this.users();
    const global = this.globalSearch().trim().toLowerCase();
    const username = this.usernameFilter().trim().toLowerCase();
    const role = this.roleFilter().trim().toLowerCase();

    return all.filter((user) => {
      const userUsername = (user.userName ?? '').toLowerCase();
      const userFullName = (user.fullName ?? '').toLowerCase();
      const userRoles = (user.roles ?? []).join(' ').toLowerCase();

      if (global && !userUsername.includes(global) && !userFullName.includes(global)) return false;
      if (username && !userUsername.includes(username)) return false;
      if (role && !userRoles.includes(role)) return false;

      return true;
    });
  });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.errorMessage.set(null);
    this.client.usersAll().subscribe({
      next: (data) => {
        this.users.set(data);
        this.loading.set(false);
      },
      error: () => {
        this.errorMessage.set('Could not load users.');
        this.notify.danger('Could not load users.');
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

  onUsernameFilter(event: Event): void {
    this.usernameFilter.set((event.target as HTMLInputElement).value);
  }

  onRoleFilter(event: Event): void {
    this.roleFilter.set((event.target as HTMLInputElement).value);
  }

  clearFilters(): void {
    this.globalSearch.set('');
    this.usernameFilter.set('');
    this.roleFilter.set('');
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

  avatarColor(name?: string): string {
    const palette = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ef4444', '#14b8a6'];
    const code = (name ?? '?').charCodeAt(0) || 0;
    return palette[code % palette.length];
  }

  initials(fullName?: string): string {
    if (!fullName) return '?';
    const parts = fullName.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  }

  roleBadgeColor(role: string): string {
    const palette = ['role-indigo', 'role-pink', 'role-amber', 'role-green', 'role-blue'];
    const code = role.charCodeAt(0) || 0;
    return palette[code % palette.length];
  }
}