import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Client, SaleReturnDto } from '../../../core/api/api-client';
import { NotificationService } from '../../../shared/notification/notification.service';
import { AlertService } from '../../../shared/alert/alert.service';
import { PageHeader } from '../../../shared/page-header/page-header';
import { DatePipe, DecimalPipe } from '@angular/common';

@Component({
  selector: 'app-sale-return-list',
  standalone: true,
  imports: [RouterLink, PageHeader, DatePipe, DecimalPipe, FormsModule],
  templateUrl: './sale-return-list.html',
  styleUrl: './sale-return-list.css'
})
export class SaleReturnList implements OnInit {
  private client = inject(Client);
  private notify = inject(NotificationService);
  private alert = inject(AlertService);

  readonly returns = signal<SaleReturnDto[]>([]);
  readonly loading = signal(true);
  
  // Filters mapped to the Query DTO pattern
  searchReturnNo = '';
  fromDate = '';
  toDate = '';

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading.set(true);
    // Method generated as 'search3' by NSwag
    this.client.search3(
      this.searchReturnNo || undefined,
      undefined, // saleId
      this.fromDate ? new Date(this.fromDate) : undefined,
      this.toDate ? new Date(this.toDate) : undefined,
      1, 100 // page, pageSize
    ).subscribe({
      next: (res) => {
        this.returns.set(res.items || []);
        this.loading.set(false);
      },
      error: () => {
        this.notify.danger('Could not load sale returns.');
        this.loading.set(false);
      }
    });
  }

  clearFilters(): void {
    this.searchReturnNo = '';
    this.fromDate = '';
    this.toDate = '';
    this.load();
  }

  async remove(ret: SaleReturnDto): Promise<void> {
    const confirmed = await this.alert.confirmDelete(ret.returnNo!);
    if (!confirmed) return;

    this.client.saleReturnsDELETE(ret.id!).subscribe({
      next: () => {
        this.returns.update((list) => list.filter((r) => r.id !== ret.id));
        this.notify.danger(`Return "${ret.returnNo}" deleted.`);
      },
      error: (err: any) => {
        const msg = err.response ? JSON.parse(err.response).message : 'Could not delete return.';
        this.notify.danger(msg);
      }
    });
  }
}