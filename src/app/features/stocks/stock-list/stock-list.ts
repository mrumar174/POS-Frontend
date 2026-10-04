import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Client, StockSummaryDto, CategoryDto } from '../../../core/api/api-client';
import { NotificationService } from '../../../shared/notification/notification.service';
import { PageHeader } from '../../../shared/page-header/page-header';
import { DecimalPipe } from '@angular/common';

@Component({
  selector: 'app-stock-list',
  standalone: true,
  imports: [PageHeader, DecimalPipe, FormsModule],
  templateUrl: './stock-list.html',
  styleUrl: './stock-list.css'
})
export class StockList implements OnInit {
  private client = inject(Client);
  private notify = inject(NotificationService);

  readonly stockData = signal<StockSummaryDto[]>([]);
  readonly categories = signal<CategoryDto[]>([]);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);

  // Filters
  search = '';
  categoryId: number | null = null;
  lowStockOnly = false;

  ngOnInit(): void {
    // Load categories for the filter dropdown
    this.client.categoriesAll().subscribe({
      next: (data) => this.categories.set(data),
      error: () => this.notify.danger('Failed to load categories.')
    });
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.errorMessage.set(null);
    
    // API client method assumed to be generated as stockSummary(categoryId?, brandId?, search?, lowStockOnly?)
    this.client.summary(this.categoryId ?? undefined, undefined, this.search || undefined, this.lowStockOnly)
      .subscribe({
        next: (data) => { 
          this.stockData.set(data); 
          this.loading.set(false); 
        },
        error: (err: any) => { 
          this.errorMessage.set('Could not load inventory summary.');
          this.notify.danger('Could not load inventory summary.'); 
          this.loading.set(false); 
        }
      });
  }

  onFilterChange(): void {
    this.load();
  }

  clearFilters(): void {
    this.search = '';
    this.categoryId = null;
    this.lowStockOnly = false;
    this.load();
  }
}