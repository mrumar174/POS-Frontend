import { Injectable, signal } from '@angular/core';

export type NotificationType = 'success' | 'danger' | 'warning' | 'info';

export interface NotificationItem {
  id: number;
  type: NotificationType;
  title: string;
  message: string;
}

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private nextId = 1;
  readonly notifications = signal<NotificationItem[]>([]);

  show(type: NotificationType, message: string, title?: string, durationMs = 4000): void {
    const id = this.nextId++;
    const item: NotificationItem = { id, type, title: title ?? this.defaultTitle(type), message };
    this.notifications.update((list) => [...list, item]);

    if (durationMs > 0) {
      setTimeout(() => this.dismiss(id), durationMs);
    }
  }

  success(message: string, title?: string): void {
    this.show('success', message, title);
  }

  danger(message: string, title?: string): void {
    this.show('danger', message, title);
  }

  warning(message: string, title?: string): void {
    this.show('warning', message, title);
  }

  info(message: string, title?: string): void {
    this.show('info', message, title);
  }

  dismiss(id: number): void {
    this.notifications.update((list) => list.filter((n) => n.id !== id));
  }

  private defaultTitle(type: NotificationType): string {
    switch (type) {
      case 'success': return 'Success';
      case 'danger': return 'Error';
      case 'warning': return 'Warning';
      case 'info': return 'Notice';
    }
  }
}