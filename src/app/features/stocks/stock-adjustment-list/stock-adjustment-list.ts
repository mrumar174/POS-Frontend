import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Client, StockAdjustmentDto } from '../../../core/api/api-client';
import { NotificationService } from '../../../shared/notification/notification.service';
import { AlertService } from '../../../shared/alert/alert.service';
import { PageHeader } from '../../../shared/page-header/page-header';
import { DatePipe, DecimalPipe } from '@angular/common';

@Component({
  selector: 'app-stock-adjustment-list',
  standalone: true,
  imports: [RouterLink, PageHeader, DatePipe, DecimalPipe],
  templateUrl: './stock-adjustment-list.html',
  styleUrl: './stock-adjustment-list.css'
})
export class StockAdjustmentList implements OnInit {
  private client = inject(Client);
  private notify = inject(NotificationService);
  private alert = inject(AlertService);

  readonly adjustments = signal<StockAdjustmentDto[]>([]);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly globalSearch = signal('');

  readonly filteredAdjustments = computed(() => {
    const all = this.adjustments();
    const search = this.globalSearch().trim().toLowerCase();
    if (!search) return all;
    return all.filter((a) =>
      (a.adjustmentNo ?? '').toLowerCase().includes(search) ||
      (a.reason ?? '').toLowerCase().includes(search)
    );
  });

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading.set(true);
    this.errorMessage.set(null);
    this.client.adjustmentsAll().subscribe({
      next: (data) => { this.adjustments.set(data); this.loading.set(false); },
      error: (err: any) => { 
        this.errorMessage.set('Could not load stock adjustments.');
        this.notify.danger('Could not load stock adjustments.'); 
        this.loading.set(false); 
      }
    });
  }

  onGlobalSearch(event: Event): void {
    this.globalSearch.set((event.target as HTMLInputElement).value);
  }

  clearGlobalSearch(): void { this.globalSearch.set(''); }

  async remove(adj: StockAdjustmentDto): Promise<void> {
    const confirmed = await this.alert.confirmDelete(adj.adjustmentNo!);
    if (!confirmed) return;

    this.client.adjustmentsDELETE(adj.id!).subscribe({
      next: () => {
        this.adjustments.update((list) => list.filter((a) => a.id !== adj.id));
        this.notify.danger(`Adjustment "${adj.adjustmentNo}" was deleted.`);
      },
      error: (err: any) => { this.notify.danger(`Could not delete "${adj.adjustmentNo}".`); }
    });
  }
}