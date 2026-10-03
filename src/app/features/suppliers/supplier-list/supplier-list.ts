import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Client, SupplierDto } from '../../../core/api/api-client';
import { NotificationService } from '../../../shared/notification/notification.service';
import { AlertService } from '../../../shared/alert/alert.service';
import { PageHeader } from '../../../shared/page-header/page-header';

@Component({
  selector: 'app-supplier-list',
  standalone: true,
  imports: [RouterLink, PageHeader],
  templateUrl: './supplier-list.html',
  styleUrl: './supplier-list.css'
})
export class SupplierList implements OnInit {
  private client = inject(Client);
  private notify = inject(NotificationService);
  private alert = inject(AlertService);

  readonly suppliers = signal<SupplierDto[]>([]);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);

  readonly globalSearch = signal('');

  readonly filteredSuppliers = computed(() => {
    const all = this.suppliers();
    const search = this.globalSearch().trim().toLowerCase();
    if (!search) return all;

    return all.filter((s) => {
      const name = (s.name ?? '').toLowerCase();
      const contactPerson = (s.contactPerson ?? '').toLowerCase();
      const contactNo = (s.contactNo ?? '').toLowerCase();
      return name.includes(search) || contactPerson.includes(search) || contactNo.includes(search);
    });
  });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.errorMessage.set(null);
    this.client.suppliersAll().subscribe({
      next: (data) => {
        this.suppliers.set(data);
        this.loading.set(false);
      },
      error: (err: any) => {
        const msg = this.extractErrorMessage(err, 'Could not load suppliers.');
        this.errorMessage.set(msg);
        this.notify.danger(msg);
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

  async remove(supplier: SupplierDto): Promise<void> {
    const confirmed = await this.alert.confirmDelete(supplier.name!);
    if (!confirmed) return;

    this.client.suppliersDELETE(supplier.id!).subscribe({
      next: () => {
        this.suppliers.update((list) => list.filter((s) => s.id !== supplier.id));
        this.notify.danger(`Supplier "${supplier.name}" was deleted.`, 'Deleted');
      },
      error: (err: any) => {
        const msg = this.extractErrorMessage(err, `Could not delete "${supplier.name}".`);
        this.notify.danger(msg);
      }
    });
  }

  avatarColor(name?: string): string {
    const palette = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ef4444', '#14b8a6'];
    const code = (name ?? '?').charCodeAt(0) || 0;
    return palette[code % palette.length];
  }

  initial(name?: string): string {
    return (name ?? '?').charAt(0).toUpperCase();
  }

  private extractErrorMessage(err: any, defaultMessage: string): string {
    if (err.response) {
      try {
        const parsed = JSON.parse(err.response);
        if (parsed.message) return parsed.message;
        if (parsed.detail) return parsed.detail;
        if (parsed.title) return parsed.title;
      } catch {
        if (typeof err.response === 'string' && err.response.trim() !== '') {
          return err.response;
        }
      }
    }

    if (err.error) {
      if (typeof err.error === 'string') return err.error;
      if (err.error.message) return err.error.message;
      if (err.error.detail) return err.error.detail;
      if (err.error.title) return err.error.title;
    }
    
    return err.message || defaultMessage;
  }
}