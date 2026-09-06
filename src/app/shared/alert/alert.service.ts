import { Injectable, signal } from '@angular/core';

export type AlertType = 'default' | 'danger' | 'warning' | 'success' | 'info';

export interface AlertButton {
  label: string;
  value: string;
  style: 'primary' | 'secondary' | 'danger' | 'outline-secondary';
}

export interface AlertConfig {
  title: string;
  message: string;
  type: AlertType;
  buttons: AlertButton[];
}

@Injectable({ providedIn: 'root' })
export class AlertService {
  readonly current = signal<AlertConfig | null>(null);
  private resolver: ((value: string) => void) | null = null;

  open(config: Partial<AlertConfig> & { title: string; message: string }): Promise<string> {
    const fullConfig: AlertConfig = {
      type: 'default',
      buttons: [{ label: 'OK', value: 'ok', style: 'primary' }],
      ...config
    };
    this.current.set(fullConfig);
    return new Promise((resolve) => {
      this.resolver = resolve;
    });
  }

  // Convenience wrapper for the most common case: "are you sure?" before deleting.
  async confirmDelete(itemLabel: string): Promise<boolean> {
    const result = await this.open({
      title: 'Confirm Delete',
      message: `Are you sure you want to delete "${itemLabel}"? This action cannot be undone.`,
      type: 'danger',
      buttons: [
        { label: 'Cancel', value: 'cancel', style: 'outline-secondary' },
        { label: 'Delete', value: 'confirm', style: 'danger' }
      ]
    });
    return result === 'confirm';
  }

  // Convenience wrapper for a plain "are you sure?" that isn't a delete.
  async confirm(title: string, message: string): Promise<boolean> {
    const result = await this.open({
      title,
      message,
      type: 'warning',
      buttons: [
        { label: 'Cancel', value: 'cancel', style: 'outline-secondary' },
        { label: 'Confirm', value: 'confirm', style: 'primary' }
      ]
    });
    return result === 'confirm';
  }

  respond(value: string): void {
    this.current.set(null);
    this.resolver?.(value);
    this.resolver = null;
  }
}