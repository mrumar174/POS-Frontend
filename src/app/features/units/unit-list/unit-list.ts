import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Client, UnitDto } from '../../../core/api/api-client';
import { NotificationService } from '../../../shared/notification/notification.service';
import { AlertService } from '../../../shared/alert/alert.service';
import { PageHeader } from '../../../shared/page-header/page-header';

@Component({
  selector: 'app-unit-list',
  standalone: true,
  imports: [RouterLink, PageHeader],
  templateUrl: './unit-list.html',
  styleUrl: './unit-list.css'
})
export class UnitList implements OnInit {
  private client = inject(Client);
  private notify = inject(NotificationService);
  private alert = inject(AlertService);

  readonly units = signal<UnitDto[]>([]);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);

  // ---------------------------------------------------------
  // Filters
  // ---------------------------------------------------------
  readonly globalSearch = signal('');
  readonly nameFilter = signal('');
  readonly shortNameFilter = signal('');
  readonly showAdvanceFilter = signal(false);

  readonly filteredUnits = computed(() => {
    const all = this.units();
    const global = this.globalSearch().trim().toLowerCase();
    const name = this.nameFilter().trim().toLowerCase();
    const shortName = this.shortNameFilter().trim().toLowerCase();

    return all.filter((unit) => {
      const unitName = (unit.name ?? '').toLowerCase();
      const unitShortName = (unit.shortName ?? '').toLowerCase();

      if (global && !unitName.includes(global)) return false;
      if (name && !unitName.includes(name)) return false;
      if (shortName && !unitShortName.includes(shortName)) return false;

      return true;
    });
  });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.errorMessage.set(null);
    this.client.unitsAll().subscribe({
      next: (data) => {
        this.units.set(data);
        this.loading.set(false);
      },
      error: () => {
        this.errorMessage.set('Could not load units.');
        this.notify.danger('Could not load units.');
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

  onShortNameFilter(event: Event): void {
    this.shortNameFilter.set((event.target as HTMLInputElement).value);
  }

  clearFilters(): void {
    this.globalSearch.set('');
    this.nameFilter.set('');
    this.shortNameFilter.set('');
  }

  async remove(unit: UnitDto): Promise<void> {
    const confirmed = await this.alert.confirmDelete(unit.name!);
    if (!confirmed) return;

    this.client.unitsDELETE(unit.id!).subscribe({
      next: () => {
        this.units.update((list) => list.filter((u) => u.id !== unit.id));
        this.notify.danger(`Unit "${unit.name}" was deleted.`, 'Deleted');
      },
      error: (err) => this.notify.danger(err.error?.message ?? `Could not delete "${unit.name}".`)
    });
  }

  avatarColor(name?: string): string {
    const palette = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ef4444', '#14b8a6'];
    const code = (name ?? '?').charCodeAt(0) || 0;
    return palette[code % palette.length];
  }
}