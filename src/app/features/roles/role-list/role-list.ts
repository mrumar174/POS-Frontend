import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Client, RoleDto } from '../../../core/api/api-client';
import { NotificationService } from '../../../shared/notification/notification.service';
import { AlertService } from '../../../shared/alert/alert.service';
import { PageHeader } from '../../../shared/page-header/page-header';

const MAX_VISIBLE_PERMISSIONS = 4;

@Component({
  selector: 'app-role-list',
  standalone: true,
  imports: [RouterLink, PageHeader],
  templateUrl: './role-list.html',
  styleUrl: './role-list.css'
})
export class RoleList implements OnInit {
  private client = inject(Client);
  private notify = inject(NotificationService);
  private alert = inject(AlertService);

  readonly roles = signal<RoleDto[]>([]);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);

  // ---------------------------------------------------------
  // Filters
  // ---------------------------------------------------------
  readonly globalSearch = signal('');
  readonly nameFilter = signal('');
  readonly permissionFilter = signal('');
  readonly showAdvanceFilter = signal(false);

  readonly filteredRoles = computed(() => {
    const all = this.roles();
    const global = this.globalSearch().trim().toLowerCase();
    const name = this.nameFilter().trim().toLowerCase();
    const permission = this.permissionFilter().trim().toLowerCase();

    return all.filter((role) => {
      const roleName = (role.name ?? '').toLowerCase();
      const rolePermissions = (role.permissions ?? []).join(' ').toLowerCase();

      if (global && !roleName.includes(global)) return false;
      if (name && !roleName.includes(name)) return false;
      if (permission && !rolePermissions.includes(permission)) return false;

      return true;
    });
  });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.errorMessage.set(null);
    this.client.rolesAll().subscribe({
      next: (data) => {
        this.roles.set(data);
        this.loading.set(false);
      },
      error: () => {
        this.errorMessage.set('Could not load roles.');
        this.notify.danger('Could not load roles.');
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

  onPermissionFilter(event: Event): void {
    this.permissionFilter.set((event.target as HTMLInputElement).value);
  }

  clearFilters(): void {
    this.globalSearch.set('');
    this.nameFilter.set('');
    this.permissionFilter.set('');
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

  visiblePermissions(role: RoleDto): string[] {
    return (role.permissions ?? []).slice(0, MAX_VISIBLE_PERMISSIONS);
  }

  hiddenPermissionCount(role: RoleDto): number {
    return Math.max(0, (role.permissions ?? []).length - MAX_VISIBLE_PERMISSIONS);
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