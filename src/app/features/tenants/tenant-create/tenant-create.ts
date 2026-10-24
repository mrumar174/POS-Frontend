import { Component, AfterViewInit, ElementRef, ViewChild, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Client, CreateTenantDto } from '../../../core/api/api-client';
import { NotificationService } from '../../../shared/notification/notification.service';
import { PageHeader } from '../../../shared/page-header/page-header';

const PASSWORD_MIN_LENGTH = 6;

// Must match TrialDays in TenantService.cs (the server enforces it; this only pre-fills the form)
const TRIAL_DAYS = 3;

const PLANS = [
  { code: 'TRIAL', label: `Free trial (${TRIAL_DAYS} days)` },
  { code: 'MONTHLY', label: 'Monthly' },
  { code: 'YEARLY', label: 'Yearly' },
  { code: 'CUSTOM', label: 'Custom (pick a date)' }
];

// yyyy-MM-dd using LOCAL date parts (toISOString() would shift the day in timezones ahead of UTC)
function toDateInput(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

// The trial counts today as day 1, so a 3-day trial ends 2 days from now
function endDateForPlan(code: string): string {
  const d = new Date();
  if (code === 'TRIAL') d.setDate(d.getDate() + TRIAL_DAYS - 1);
  else if (code === 'MONTHLY') d.setMonth(d.getMonth() + 1);
  else if (code === 'YEARLY') d.setFullYear(d.getFullYear() + 1);
  return toDateInput(d);
}

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

  readonly plans = PLANS;
  readonly trialDays = TRIAL_DAYS;

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
    subscriptionPlanCode: ['TRIAL', Validators.required],
    subscriptionEndDate: [endDateForPlan('TRIAL'), Validators.required],
    adminUserName: ['', Validators.required],
    adminFullName: ['', Validators.required],
    adminPassword: ['', [Validators.required, Validators.minLength(PASSWORD_MIN_LENGTH)]]
  });

  get businessNameControl() { return this.form.controls.businessName; }
  get adminUserNameControl() { return this.form.controls.adminUserName; }
  get adminPasswordControl() { return this.form.controls.adminPassword; }

  // Only a custom plan lets the user pick the date; the others are calculated
  get isCustomPlan(): boolean {
    return this.form.controls.subscriptionPlanCode.value === 'CUSTOM';
  }

  get isTrialPlan(): boolean {
    return this.form.controls.subscriptionPlanCode.value === 'TRIAL';
  }

  ngAfterViewInit(): void {
    this.businessNameInput?.nativeElement.focus();
  }

  togglePasswordVisibility(): void {
    this.showPassword.update((v) => !v);
  }

  onPlanChange(): void {
    const code = this.form.controls.subscriptionPlanCode.value;
    if (code && code !== 'CUSTOM') {
      this.form.controls.subscriptionEndDate.setValue(endDateForPlan(code));
    }
  }

  submit(): void {
    if (this.saving()) return;

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

    if (this.form.controls.subscriptionEndDate.value! < toDateInput(new Date())) {
      this.notify.warning('Subscription end date cannot be in the past.');
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
      // For a trial the server ignores the date and sets its own end date
      isTrial: v.subscriptionPlanCode === 'TRIAL',
      subscriptionPlanCode: v.subscriptionPlanCode!,
      subscriptionEndDate: new Date(v.subscriptionEndDate!) as any,
      adminUserName: v.adminUserName!,
      adminFullName: v.adminFullName!,
      adminPassword: v.adminPassword!
    })).subscribe({
      next: (tenant) => {
        this.saving.set(false);
        this.notify.success(`Tenant "${tenant.businessName}" created successfully.`);
        this.router.navigate(['/tenants']);
      },
      error: (err: any) => {
        this.saving.set(false);
        const message = this.extractErrorMessage(err, 'Could not create tenant.');
        this.errorMessage.set(message);
        this.notify.danger(message);
      }
    });
  }

  // Shows the exact message sent by the backend
  private extractErrorMessage(err: any, defaultMessage: string): string {
    if (err?.response) {
      try {
        const parsed = JSON.parse(err.response);
        if (typeof parsed === 'string' && parsed.trim() !== '') return parsed;
        if (parsed.message) return parsed.message;
        if (parsed.detail) return parsed.detail;
        if (parsed.title) return parsed.title;
      } catch {
        if (typeof err.response === 'string' && err.response.trim() !== '') return err.response;
      }
    }
    if (err?.error) {
      if (typeof err.error === 'string') return err.error;
      if (err.error.message) return err.error.message;
      if (err.error.detail) return err.error.detail;
      if (err.error.title) return err.error.title;
    }
    return err?.message || defaultMessage;
  }
}