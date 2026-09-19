import { Component, OnInit, AfterViewInit, ElementRef, ViewChild, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { Client, CreateSupplierDto, UpdateSupplierDto } from '../../../core/api/api-client';
import { NotificationService } from '../../../shared/notification/notification.service';
import { AlertService } from '../../../shared/alert/alert.service';
import { PageHeader } from '../../../shared/page-header/page-header';

@Component({
  selector: 'app-supplier-form',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, PageHeader],
  templateUrl: './supplier-form.html',
  styleUrl: './supplier-form.css'
})
export class SupplierForm implements OnInit, AfterViewInit {
  private fb = inject(FormBuilder);
  private client = inject(Client);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private notify = inject(NotificationService);
  private alert = inject(AlertService);

  @ViewChild('nameInput') nameInput?: ElementRef<HTMLInputElement>;

  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly isEditMode = signal(false);
  private supplierId: number | null = null;

  form = this.fb.group({
    name: ['', Validators.required],
    contactPerson: [''],
    contactNo: [''],
    email: ['', Validators.email],
    address: ['']
  });

  get nameControl() { return this.form.controls.name; }
  get emailControl() { return this.form.controls.email; }

  get breadcrumbSegments(): string[] {
    return ['Purchasing', this.isEditMode() ? 'Edit Supplier' : 'Create Supplier'];
  }

  ngOnInit(): void {
    const idParam = this.route.snapshot.paramMap.get('id');
    if (idParam) {
      this.supplierId = Number(idParam);
      this.isEditMode.set(true);
      this.loading.set(true);

      this.client.suppliersGET(this.supplierId).subscribe({
        next: (supplier) => {
          this.form.patchValue({
            name: supplier.name,
            contactPerson: supplier.contactPerson ?? '',
            contactNo: supplier.contactNo ?? '',
            email: supplier.email ?? '',
            address: supplier.address ?? ''
          });
          this.form.markAsPristine();
          this.loading.set(false);
        },
        error: () => {
          this.errorMessage.set('Could not load this supplier.');
          this.notify.danger('Could not load this supplier.');
          this.loading.set(false);
        }
      });
    }
  }

  ngAfterViewInit(): void {
    if (!this.isEditMode()) {
      this.nameInput?.nativeElement.focus();
    }
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.nameInput?.nativeElement.focus();

      if (this.nameControl.hasError('required')) {
        this.notify.warning('Name is required.');
      } else if (this.emailControl.hasError('email')) {
        this.notify.warning('Enter a valid email address.');
      }
      return;
    }

    this.errorMessage.set(null);
    this.saving.set(true);
    const v = this.form.getRawValue();

    const payload = {
      name: v.name!.trim(),
      contactPerson: v.contactPerson?.trim() || undefined,
      contactNo: v.contactNo?.trim() || undefined,
      email: v.email?.trim() || undefined,
      address: v.address?.trim() || undefined
    };

    const request$ = this.isEditMode()
      ? this.client.suppliersPUT(this.supplierId!, new UpdateSupplierDto({ id: this.supplierId!, ...payload }))
      : this.client.suppliersPOST(new CreateSupplierDto(payload));

    request$.subscribe({
      next: () => {
        this.saving.set(false);
        this.form.markAsPristine();
        this.notify.success(this.isEditMode() ? 'Supplier updated successfully.' : 'Supplier created successfully.');
        this.router.navigate(['/suppliers']);
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        const message = typeof err.error === 'string' ? err.error : err.error?.message ?? 'Could not save this supplier.';
        this.errorMessage.set(message);
        this.notify.danger(message);
      }
    });
  }

  async cancel(): Promise<void> {
    if (this.form.dirty) {
      const confirmed = await this.alert.confirm(
        'Discard changes?',
        'You have unsaved changes. Are you sure you want to leave without saving?'
      );
      if (!confirmed) return;
    }
    this.router.navigate(['/suppliers']);
  }
}