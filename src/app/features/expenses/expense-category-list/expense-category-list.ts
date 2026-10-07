import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Client, ExpenseCategoryDto } from '../../../core/api/api-client';
import { NotificationService } from '../../../shared/notification/notification.service';
import { AlertService } from '../../../shared/alert/alert.service';
import { PageHeader } from '../../../shared/page-header/page-header';
import { extractErrorMessage } from '../../../shared/utils/api-error';

@Component({
  selector: 'app-expense-category-list',
  standalone: true,
  imports: [RouterLink, PageHeader],
  templateUrl: './expense-category-list.html',
  styleUrl: './expense-category-list.css'
})
export class ExpenseCategoryList implements OnInit {
  private client = inject(Client);
  private notify = inject(NotificationService);
  private alert = inject(AlertService);

  readonly categories = signal<ExpenseCategoryDto[]>([]);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly globalSearch = signal('');

  readonly filtered = computed(() => {
    const search = this.globalSearch().trim().toLowerCase();
    const all = this.categories();
    if (!search) return all;
    return all.filter((c) =>
      (c.name ?? '').toLowerCase().includes(search) ||
      (c.description ?? '').toLowerCase().includes(search)
    );
  });

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading.set(true);
    this.errorMessage.set(null);
    this.client.expenseCategoriesAll().subscribe({
      next: (data) => { this.categories.set(data); this.loading.set(false); },
      error: (err: any) => {
        const msg = extractErrorMessage(err, 'Could not load expense categories.');
        this.errorMessage.set(msg);
        this.notify.danger(msg);
        this.loading.set(false);
      }
    });
  }

  onGlobalSearch(event: Event): void { this.globalSearch.set((event.target as HTMLInputElement).value); }
  clearGlobalSearch(): void { this.globalSearch.set(''); }

  async remove(category: ExpenseCategoryDto): Promise<void> {
    const confirmed = await this.alert.confirmDelete(category.name!);
    if (!confirmed) return;

    this.client.expenseCategoriesDELETE(category.id!).subscribe({
      next: () => {
        this.categories.update((list) => list.filter((c) => c.id !== category.id));
        this.notify.danger(`Category "${category.name}" was deleted.`, 'Deleted');
      },
      error: (err: any) => this.notify.danger(extractErrorMessage(err, `Could not delete "${category.name}".`))
    });
  }

  avatarColor(name?: string): string {
    const palette = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ef4444', '#14b8a6'];
    return palette[((name ?? '?').charCodeAt(0) || 0) % palette.length];
  }

  initial(name?: string): string { return (name ?? '?').charAt(0).toUpperCase(); }
}