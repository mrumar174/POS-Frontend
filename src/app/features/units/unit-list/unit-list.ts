import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Client, UnitDto } from '../../../core/api/api-client';
import { NotificationService } from '../../../shared/notification/notification.service';
import { AlertService } from '../../../shared/alert/alert.service';
import { PageHeader } from '../../../shared/page-header/page-header';

@Component({
  selector: 'app-unit-list',
  standalone: true,
  imports: [RouterLink, PageHeader],
  templateUrl: './unit-list.html'
})
export class UnitList implements OnInit {
  private client = inject(Client);
  private notify = inject(NotificationService);
  private alert = inject(AlertService);

  readonly units = signal<UnitDto[]>([]);
  readonly loading = signal(true);

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.client.unitsAll().subscribe({
      next: (data) => { this.units.set(data); this.loading.set(false); },
      error: () => { this.notify.danger('Could not load units.'); this.loading.set(false); }
    });
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
}