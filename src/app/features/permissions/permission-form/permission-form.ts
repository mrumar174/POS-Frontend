import { Component, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, FormArray, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Client, CreatePermissionDto } from '../../../core/api/api-client';
import { NotificationService } from '../../../shared/notification/notification.service';
import { PageHeader } from "../../../shared/page-header/page-header";

@Component({
  selector: 'app-permission-form',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, PageHeader],
  templateUrl: './permission-form.html'
})
export class PermissionForm {
  private fb = inject(FormBuilder);
  private client = inject(Client);
  private router = inject(Router);
  private notify = inject(NotificationService);

  readonly loading = signal(false);

  form = this.fb.group({
    rows: this.fb.array([this.createRow()])
  });

  get rows(): FormArray {
    return this.form.get('rows') as FormArray;
  }

  createRow() {
    return this.fb.group({
      name: ['', Validators.required],
      module: ['', Validators.required],
      description: ['']
    });
  }

  addRow(): void {
    this.rows.push(this.createRow());
  }

  removeRow(index: number): void {
    if (this.rows.length > 1) this.rows.removeAt(index);
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.notify.warning('Every row needs a Name and a Module.');
      return;
    }

    this.loading.set(true);
    const dtos = this.rows.value.map(
      (r: any) => new CreatePermissionDto({ name: r.name, module: r.module, description: r.description || undefined })
    );

    this.client.bulk(dtos).subscribe({
      next: (created) => {
        this.loading.set(false);
        this.notify.success(`${created.length} permission(s) created.`);
        this.router.navigate(['/permissions']);
      },
      error: (err) => {
        this.loading.set(false);
        const message = typeof err.error === 'string' ? err.error : 'Could not create permissions.';
        this.notify.danger(message);
      }
    });
  }
}