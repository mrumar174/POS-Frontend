import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Client, PermissionDto } from '../../../core/api/api-client';
import { NotificationService } from '../../../shared/notification/notification.service';
import { PageHeader } from '../../../shared/page-header/page-header';

interface PermissionGroup {
  module: string;
  permissions: PermissionDto[];
}

@Component({
  selector: 'app-permission-list',
  standalone: true,
  imports: [RouterLink, PageHeader],
  templateUrl: './permission-list.html',
  styleUrl: './permission-list.css'
})
export class PermissionList implements OnInit {
  private client = inject(Client);
  private notify = inject(NotificationService);

  readonly permissions = signal<PermissionDto[]>([]);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);

  // ---------------------------------------------------------
  // Filters
  // ---------------------------------------------------------
  readonly globalSearch = signal('');
  readonly moduleFilter = signal<string | null>(null);

  readonly allModules = computed(() => {
    const modules = new Set(this.permissions().map((p) => p.module ?? 'Other'));
    return Array.from(modules).sort();
  });

  readonly filteredPermissions = computed(() => {
    const all = this.permissions();
    const search = this.globalSearch().trim().toLowerCase();
    const module = this.moduleFilter();

    return all.filter((p) => {
      const name = (p.name ?? '').toLowerCase();
      const pModule = p.module ?? 'Other';

      if (search && !name.includes(search) && !pModule.toLowerCase().includes(search)) return false;
      if (module && pModule !== module) return false;

      return true;
    });
  });

  readonly groupedPermissions = computed<PermissionGroup[]>(() => {
    const groups = new Map<string, PermissionDto[]>();
    for (const p of this.filteredPermissions()) {
      const module = p.module ?? 'Other';
      if (!groups.has(module)) groups.set(module, []);
      groups.get(module)!.push(p);
    }
    return Array.from(groups.entries())
      .map(([module, permissions]) => ({ module, permissions }))
      .sort((a, b) => a.module.localeCompare(b.module));
  });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.errorMessage.set(null);
    this.client.permissionsAll(undefined).subscribe({
      next: (data) => {
        this.permissions.set(data);
        this.loading.set(false);
      },
      error: () => {
        this.errorMessage.set('Could not load permissions.');
        this.notify.danger('Could not load permissions.');
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

  selectModule(module: string | null): void {
    this.moduleFilter.set(module);
  }

  moduleColor(module: string): string {
    const palette = ['mod-indigo', 'mod-pink', 'mod-amber', 'mod-green', 'mod-blue', 'mod-purple'];
    const code = module.charCodeAt(0) || 0;
    return palette[code % palette.length];
  }
}