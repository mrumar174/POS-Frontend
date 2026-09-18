import { Component, OnInit, AfterViewInit, ElementRef, ViewChild, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { Client, UpdateTenantDto, TenantDto } from '../../../core/api/api-client';
import { NotificationService } from '../../../shared/notification/notification.service';
import { AlertService } from '../../../shared/alert/alert.service';
import { PageHeader } from '../../../shared/page-header/page-header';

@Component({
  selector: 'app-tenant-form',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, PageHeader],
  templateUrl: './tenant-form.html',
  styleUrl: './tenant-form.css'
})
export class TenantForm implements OnInit, AfterViewInit {
  private fb = inject(FormBuilder);
  private client = inject(Client);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private notify = inject(NotificationService);
  private alert = inject(AlertService);

  @ViewChild('businessNameInput') businessNameInput?: ElementRef<HTMLInputElement>;

  readonly loading = signal(true);    // initial fetch
  readonly saving = signal(false);    // submit in progress
  readonly errorMessage = signal<string | null>(null);
  readonly tenant = signal<TenantDto | null>(null);

  private tenantId!: number;

  form = this.fb.group({
    businessName: ['', Validators.required],
    ownerName: ['', Validators.required],
    contactNo: ['', Validators.required],
    email: [''],
    address: [''],
    city: [''],
    maxShops: [1, [Validators.required, Validators.min(1)]],
    maxUsers: [5, [Validators.required, Validators.min(1)]]
  });

  get businessNameControl() { return this.form.controls.businessName; }
  get ownerNameControl() { return this.form.controls.ownerName; }
  get contactNoControl() { return this.form.controls.contactNo; }
  get maxShopsControl() { return this.form.controls.maxShops; }
  get maxUsersControl() { return this.form.controls.maxUsers; }

  ngOnInit(): void {
    this.tenantId = Number(this.route.snapshot.paramMap.get('id'));
    this.client.tenantsGET(this.tenantId).subscribe({
      next: (t) => {
        this.tenant.set(t);
        this.form.patchValue({
          businessName: t.businessName,
          ownerName: t.ownerName,
          contactNo: t.contactNo,
          email: t.email ?? '',
          address: t.address ?? '',
          city: t.city ?? '',
          maxShops: t.maxShops,
          maxUsers: t.maxUsers
        });
        this.form.markAsPristine();
        this.loading.set(false);
      },
      error: () => {
        this.errorMessage.set('Could not load this tenant.');
        this.notify.danger('Could not load this tenant.');
        this.loading.set(false);
      }
    });
  }

  ngAfterViewInit(): void {
    // Focus happens after data loads, not immediately — see the loading()
    // guard in the template; nothing to do here for edit-only forms.
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();

      if (this.businessNameControl.hasError('required')) {
        this.notify.warning('Business name is required.');
      } else if (this.ownerNameControl.hasError('required')) {
        this.notify.warning('Owner name is required.');
      } else if (this.contactNoControl.hasError('required')) {
        this.notify.warning('Contact number is required.');
      } else if (this.maxShopsControl.invalid) {
        this.notify.warning('Max Shops must be at least 1.');
      } else if (this.maxUsersControl.invalid) {
        this.notify.warning('Max Users must be at least 1.');
      }
      return;
    }

    const currentTenant = this.tenant();
    if (currentTenant && this.maxShopsControl.value! < (currentTenant.shopCount ?? 0)) {
      this.notify.danger(
        `Max Shops cannot be less than the current shop count (${currentTenant.shopCount}).`
      );
      return;
    }

    this.errorMessage.set(null);
    this.saving.set(true);
    const v = this.form.getRawValue();

    this.client.tenantsPUT(this.tenantId, new UpdateTenantDto({
      id: this.tenantId,
      businessName: v.businessName!,
      ownerName: v.ownerName!,
      contactNo: v.contactNo!,
      email: v.email || undefined,
      address: v.address || undefined,
      city: v.city || undefined,
      maxShops: v.maxShops!,
      maxUsers: v.maxUsers!
    })).subscribe({
      next: () => {
        this.saving.set(false);
        this.form.markAsPristine();
        this.notify.success('Tenant updated successfully.');
        this.router.navigate(['/tenants']);
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        const message = typeof err.error === 'string' ? err.error : err.error?.message ?? 'Could not save this tenant.';
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
    this.router.navigate(['/tenants']);
  }
}