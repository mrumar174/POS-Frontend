import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Client, PaymentMethodDto } from '../../../core/api/api-client';
import { NotificationService } from '../../../shared/notification/notification.service';
import { AlertService } from '../../../shared/alert/alert.service';
import { PageHeader } from '../../../shared/page-header/page-header';

@Component({
  selector: 'app-payment-method-list',
  standalone: true,
  imports: [RouterLink, PageHeader],
  templateUrl: './payment-method-list.html',
  styleUrl: './payment-method-list.css'
})
export class PaymentMethodList implements OnInit {
  private client = inject(Client);
  private notify = inject(NotificationService);
  private alert = inject(AlertService);

  readonly methods = signal<PaymentMethodDto[]>([]);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.errorMessage.set(null);
    this.client.paymentMethodsAll().subscribe({
      next: (data) => {
        this.methods.set(data);
        this.loading.set(false);
      },
      error: (err: any) => {
        const msg = this.extractErrorMessage(err, 'Could not load payment methods.');
        this.errorMessage.set(msg);
        this.notify.danger(msg);
        this.loading.set(false);
      }
    });
  }

  async remove(method: PaymentMethodDto): Promise<void> {
    const confirmed = await this.alert.confirmDelete(method.name!);
    if (!confirmed) return;

    this.client.paymentMethodsDELETE(method.id!).subscribe({
      next: () => {
        this.methods.update((list) => list.filter((m) => m.id !== method.id));
        this.notify.danger(`Payment method "${method.name}" was deleted.`, 'Deleted');
      },
      error: (err: any) => {
        const msg = this.extractErrorMessage(err, `Could not delete "${method.name}".`);
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