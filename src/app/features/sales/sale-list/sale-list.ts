import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Client, SaleDto } from '../../../core/api/api-client';
import { NotificationService } from '../../../shared/notification/notification.service';
import { AlertService } from '../../../shared/alert/alert.service';
import { PageHeader } from '../../../shared/page-header/page-header';
import { DatePipe, DecimalPipe } from '@angular/common';

@Component({
  selector: 'app-sale-list',
  standalone: true,
  imports: [RouterLink, PageHeader, DatePipe, DecimalPipe],
  templateUrl: './sale-list.html',
  styleUrl: './sale-list.css'
})
export class SaleList implements OnInit {
  private client = inject(Client);
  private notify = inject(NotificationService);
  private alert = inject(AlertService);

  readonly sales = signal<SaleDto[]>([]);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly globalSearch = signal('');

  readonly filteredSales = computed(() => {
    const all = this.sales();
    const search = this.globalSearch().trim().toLowerCase();
    if (!search) return all;
    return all.filter((s) =>
      (s.invoiceNo ?? '').toLowerCase().includes(search)
    );
  });

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading.set(true);
    this.errorMessage.set(null);
    this.client.salesAll().subscribe({
      next: (data) => { this.sales.set(data); this.loading.set(false); },
      error: (err: any) => { 
        this.errorMessage.set('Could not load sales history.');
        this.notify.danger('Could not load sales history.'); 
        this.loading.set(false); 
      }
    });
  }

  onGlobalSearch(event: Event): void {
    this.globalSearch.set((event.target as HTMLInputElement).value);
  }

  clearGlobalSearch(): void { this.globalSearch.set(''); }

  async remove(sale: SaleDto): Promise<void> {
    const confirmed = await this.alert.confirmDelete(sale.invoiceNo!);
    if (!confirmed) return;

    this.client.salesDELETE(sale.id!).subscribe({
      next: () => {
        this.sales.update((list) => list.filter((s) => s.id !== sale.id));
        this.notify.danger(`Sale "${sale.invoiceNo}" was deleted.`);
      },
      error: (err: any) => { 
        const msg = err.response ? JSON.parse(err.response).message : 'Could not delete sale.';
        this.notify.danger(msg); 
      }
    });
  }

  paymentStatus(sale: SaleDto): 'paid' | 'partial' | 'unpaid' {
    if ((sale.dueAmount ?? 0) <= 0) return 'paid';
    if ((sale.paidAmount ?? 0) > 0) return 'partial';
    return 'unpaid';
  }
}