import { Component, AfterViewInit, ElementRef, ViewChild, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { Client, CreateTenantDto } from '../../../core/api/api-client';
import { NotificationService } from '../../../shared/notification/notification.service';
import { PageHeader } from '../../../shared/page-header/page-header';

const PASSWORD_MIN_LENGTH = 6;

@Component({
  selector: 'app-tenant-create',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, PageHeader],
  templateUrl: './tenant-create.html',
  styleUrl: './tenant-create.css'
})
export class TenantCreate implements AfterViewInit {
  private fb = inject(FormBuilder);
  private client = inject(Client);
  private router = inject(Router);
  private notify = inject(NotificationService);

  @ViewChild('businessNameInput') businessNameInput?: ElementRef<HTMLInputElement>;

  readonly saving = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly showPassword = signal(false);

  form = this.fb.group({
    businessName: ['', Validators.required],
    ownerName: ['', Validators.required],
    contactNo: ['', Validators.required],
    email: [''],
    address: [''],
    city: [''],
    mainShopName: ['Main Branch', Validators.required],
    maxShops: [1, [Validators.required, Validators.min(1)]],
    maxUsers: [5, [Validators.required, Validators.min(1)]],
    adminUserName: ['', Validators.required],
    adminFullName: ['', Validators.required],
    adminPassword: ['', [Validators.required, Validators.minLength(PASSWORD_MIN_LENGTH)]]
  });

  get businessNameControl() { return this.form.controls.businessName; }
  get adminUserNameControl() { return this.form.controls.adminUserName; }
  get adminPasswordControl() { return this.form.controls.adminPassword; }

  ngAfterViewInit(): void {
    this.businessNameInput?.nativeElement.focus();
  }

  togglePasswordVisibility(): void {
    this.showPassword.update((v) => !v);
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      if (this.businessNameControl.hasError('required')) {
        this.notify.warning('Business name is required.');
      } else if (this.adminUserNameControl.hasError('required')) {
        this.notify.warning('Admin username is required.');
      } else if (this.adminPasswordControl.hasError('required')) {
        this.notify.warning('Admin password is required.');
      } else if (this.adminPasswordControl.hasError('minlength')) {
        this.notify.warning(`Password must be at least ${PASSWORD_MIN_LENGTH} characters.`);
      } else {
        this.notify.warning('Please check the highlighted fields.');
      }
      return;
    }

    this.errorMessage.set(null);
    this.saving.set(true);
    const v = this.form.getRawValue();

    // Deliberately does NOT touch the current session — unlike public
    // signup, this returns just the created TenantDto, no auth token, so
    // the logged-in SuperAdmin stays in their own account.
    this.client.tenantsPOST(new CreateTenantDto({
      businessName: v.businessName!,
      ownerName: v.ownerName!,
      contactNo: v.contactNo!,
      email: v.email || undefined,
      address: v.address || undefined,
      city: v.city || undefined,
      mainShopName: v.mainShopName!,
      maxShops: v.maxShops!,
      maxUsers: v.maxUsers!,
      adminUserName: v.adminUserName!,
      adminFullName: v.adminFullName!,
      adminPassword: v.adminPassword!
    })).subscribe({
      next: (tenant) => {
        this.saving.set(false);
        this.notify.success(`Tenant "${tenant.businessName}" created successfully.`);
        this.router.navigate(['/tenants']);
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        const message = typeof err.error === 'string' ? err.error : err.error?.message ?? 'Could not create tenant.';
        this.errorMessage.set(message);
        this.notify.danger(message);
      }
    });
  }
}   