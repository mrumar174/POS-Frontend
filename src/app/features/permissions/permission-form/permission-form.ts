import { Component, inject, signal, computed } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, FormArray, FormGroup, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { Client, CreatePermissionDto } from '../../../core/api/api-client';
import { NotificationService } from '../../../shared/notification/notification.service';
import { AlertService } from '../../../shared/alert/alert.service';
import { PageHeader } from '../../../shared/page-header/page-header';

const NAME_MAX_LENGTH = 100;
const MODULE_MAX_LENGTH = 50;

@Component({
  selector: 'app-permission-form',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, PageHeader],
  templateUrl: './permission-form.html',
  styleUrl: './permission-form.css'
})
export class PermissionForm {
  private fb = inject(FormBuilder);
  private client = inject(Client);
  private router = inject(Router);
  private notify = inject(NotificationService);
  private alert = inject(AlertService);

  readonly saving = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly nameMaxLength = NAME_MAX_LENGTH;
  readonly moduleMaxLength = MODULE_MAX_LENGTH;

  form = this.fb.group({
    rows: this.fb.array([this.createRow()])
  });

  get rows(): FormArray<FormGroup> {
    return this.form.get('rows') as FormArray<FormGroup>;
  }

  readonly rowCount = computed(() => this.rows.controls.length);

  createRow(prefillModule = ''): FormGroup {
    return this.fb.group({
      name: ['', [Validators.required, Validators.maxLength(NAME_MAX_LENGTH)]],
      module: [prefillModule, [Validators.required, Validators.maxLength(MODULE_MAX_LENGTH)]],
      description: ['']
    });
  }

  addRow(): void {
    // Carry the last row's module forward — most batches add several
    // permissions for the same module in a row, so this saves retyping.
    const lastModule = this.rows.length > 0 ? this.rows.at(this.rows.length - 1).get('module')?.value ?? '' : '';
    this.rows.push(this.createRow(lastModule));
  }

  async removeRow(index: number): Promise<void> {
    if (this.rows.length <= 1) return;

    const row = this.rows.at(index);
    const hasContent = row.get('name')?.value || row.get('module')?.value;

    if (hasContent) {
      const confirmed = await this.alert.confirm('Remove this row?', 'This row has content that will be discarded.');
      if (!confirmed) return;
    }

    this.rows.removeAt(index);
  }

  rowControl(index: number, field: string) {
    return this.rows.at(index).get(field)!;
  }

  submit(): void {
    if (this.form.invalid) {
      this.rows.controls.forEach((row) => row.markAllAsTouched());

      const firstInvalidIndex = this.rows.controls.findIndex((row) => row.invalid);
      this.notify.warning(
        firstInvalidIndex >= 0
          ? `Row ${firstInvalidIndex + 1} needs a Name and a Module.`
          : 'Every row needs a Name and a Module.'
      );
      return;
    }

    this.errorMessage.set(null);
    this.saving.set(true);

    const dtos = this.rows.value.map(
      (r: any) => new CreatePermissionDto({
        name: (r.name ?? '').trim(),
        module: (r.module ?? '').trim(),
        description: (r.description ?? '').trim() || undefined
      })
    );

    this.client.bulk(dtos).subscribe({
      next: (created) => {
        this.saving.set(false);
        this.notify.success(`${created.length} permission${created.length === 1 ? '' : 's'} created.`);
        this.router.navigate(['/permissions']);
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        const message = typeof err.error === 'string' ? err.error : err.error?.message ?? 'Could not create permissions.';
        this.errorMessage.set(message);
        this.notify.danger(message);
      }
    });
  }

  async cancel(): Promise<void> {
    const hasContent = this.rows.controls.some((row) => row.get('name')?.value || row.get('module')?.value);
    if (hasContent) {
      const confirmed = await this.alert.confirm(
        'Discard changes?',
        'You have unsaved rows. Are you sure you want to leave without saving?'
      );
      if (!confirmed) return;
    }
    this.router.navigate(['/permissions']);
  }
}