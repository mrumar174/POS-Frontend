import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Client, PurchaseDto } from '../../../core/api/api-client';
import { NotificationService } from '../../../shared/notification/notification.service';
import { AlertService } from '../../../shared/alert/alert.service';
import { PageHeader } from '../../../shared/page-header/page-header';
import { DatePipe, DecimalPipe } from '@angular/common';

@Component({
  selector: 'app-purchase-list',
  standalone: true,
  imports: [RouterLink, PageHeader, DatePipe, DecimalPipe],
  templateUrl: './purchase-list.html',
  styleUrl: './purchase-list.css'
})
export class PurchaseList implements OnInit {
  private client = inject(Client);
  private notify = inject(NotificationService);
  private alert = inject(AlertService);

  readonly purchases = signal<PurchaseDto[]>([]);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly globalSearch = signal('');

  readonly filteredPurchases = computed(() => {
    const all = this.purchases();
    const search = this.globalSearch().trim().toLowerCase();
    if (!search) return all;
    return all.filter((p) =>
      (p.invoiceNo ?? '').toLowerCase().includes(search) ||
      (p.supplierName ?? '').toLowerCase().includes(search)
    );
  });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.errorMessage.set(null);
    this.client.purchasesAll().subscribe({
      next: (data) => { this.purchases.set(data); this.loading.set(false); },
      error: () => { this.errorMessage.set('Could not load purchases.'); this.notify.danger('Could not load purchases.'); this.loading.set(false); }
    });
  }

  onGlobalSearch(event: Event): void {
    this.globalSearch.set((event.target as HTMLInputElement).value);
  }

  clearGlobalSearch(): void {
    this.globalSearch.set('');
  }

  async remove(purchase: PurchaseDto): Promise<void> {
    const confirmed = await this.alert.confirmDelete(purchase.invoiceNo!);
    if (!confirmed) return;

    this.client.purchasesDELETE(purchase.id!).subscribe({
      next: () => {
        this.purchases.update((list) => list.filter((p) => p.id !== purchase.id));
        this.notify.danger(`Purchase "${purchase.invoiceNo}" was deleted.`, 'Deleted');
      },
      error: (err) => this.notify.danger(err.error?.message ?? `Could not delete "${purchase.invoiceNo}".`)
    });
  }

  paymentStatus(purchase: PurchaseDto): 'paid' | 'partial' | 'unpaid' {
    if ((purchase.dueAmount ?? 0) <= 0) return 'paid';
    if ((purchase.paidAmount ?? 0) > 0) return 'partial';
    return 'unpaid';
  }
}