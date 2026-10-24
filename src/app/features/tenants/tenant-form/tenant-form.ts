import { Component, OnInit, AfterViewInit, ElementRef, ViewChild, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Client, UpdateTenantDto, UpdateSubscriptionDto, TenantDto, SubscriptionStatus } from '../../../core/api/api-client';
import { NotificationService } from '../../../shared/notification/notification.service';
import { AlertService } from '../../../shared/alert/alert.service';
import { PageHeader } from '../../../shared/page-header/page-header';

const STATUSES = [
  { value: SubscriptionStatus._1, label: 'Trial' },
  { value: SubscriptionStatus._2, label: 'Active' },
  { value: SubscriptionStatus._3, label: 'Past Due' },
  { value: SubscriptionStatus._4, label: 'Suspended' },
  { value: SubscriptionStatus._5, label: 'Cancelled' }
];

const PLANS = [
  { code: 'TRIAL', label: 'Free trial' },
  { code: 'MONTHLY', label: 'Monthly' },
  { code: 'YEARLY', label: 'Yearly' },
  { code: 'CUSTOM', label: 'Custom' }
];

// yyyy-MM-dd using LOCAL date parts (toISOString() would shift the day in timezones ahead of UTC)
function toDateInput(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

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

  // Subscription section
  readonly statuses = STATUSES;
  readonly plans = signal(PLANS);
  readonly savingSubscription = signal(false);
  readonly subscriptionError = signal<string | null>(null);

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

  // Saved separately from the details above, through its own endpoint
  subForm = this.fb.group({
    subscriptionStatus: [SubscriptionStatus._2 as SubscriptionStatus, Validators.required],
    subscriptionPlanCode: ['MONTHLY'],
    subscriptionEndDate: ['']
  });

  get businessNameControl() { return this.form.controls.businessName; }
  get ownerNameControl() { return this.form.controls.ownerName; }
  get contactNoControl() { return this.form.controls.contactNo; }
  get maxShopsControl() { return this.form.controls.maxShops; }
  get maxUsersControl() { return this.form.controls.maxUsers; }

  // Days until the subscription ends (negative = already expired, null = no end date)
  get daysLeft(): number | null {
    const v = this.subForm.controls.subscriptionEndDate.value;
    if (!v) return null;
    const end = new Date(v + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.round((end.getTime() - today.getTime()) / 86400000);
  }

  statusLabel(value: SubscriptionStatus | undefined): string {
    return STATUSES.find((s) => s.value === value)?.label ?? '';
  }

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
        this.patchSubscription(t);
        this.loading.set(false);
        setTimeout(() => this.businessNameInput?.nativeElement.focus());
      },
      error: (err: any) => {
        const msg = this.extractErrorMessage(err, 'Could not load this tenant.');
        this.errorMessage.set(msg);
        this.notify.danger(msg);
        this.loading.set(false);
      }
    });
  }

  ngAfterViewInit(): void {
    // Focus happens after data loads (see ngOnInit), because the input only
    // exists once the loading skeleton is replaced.
  }

  // ───────────────────────── Subscription ─────────────────────────

  private patchSubscription(t: TenantDto): void {
    // Keep a plan code that isn't in the standard list instead of silently replacing it
    const code = t.subscriptionPlanCode ?? 'CUSTOM';
    if (!this.plans().some((p) => p.code === code)) {
      this.plans.update((list) => [...list, { code, label: code }]);
    }

    this.subForm.patchValue({
      subscriptionStatus: t.subscriptionStatus,
      subscriptionPlanCode: code,
      subscriptionEndDate: t.subscriptionEndDate ? toDateInput(new Date(t.subscriptionEndDate)) : ''
    });
    this.subForm.markAsPristine();
  }

  // Renewal: extends from the current end date (or from today if it already expired).
  // Only fills the form, nothing is saved until "Update Subscription" is clicked.
  renew(plan: 'MONTHLY' | 'YEARLY'): void {
    const current = this.subForm.controls.subscriptionEndDate.value;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let base = current ? new Date(current + 'T00:00:00') : new Date(today);
    if (base < today) base = new Date(today);

    if (plan === 'MONTHLY') base.setMonth(base.getMonth() + 1);
    else base.setFullYear(base.getFullYear() + 1);

    this.subForm.patchValue({
      subscriptionStatus: SubscriptionStatus._2,
      subscriptionPlanCode: plan,
      subscriptionEndDate: toDateInput(base)
    });
    this.subForm.markAsDirty();
  }

  saveSubscription(): void {
    if (this.savingSubscription()) return;

    const v = this.subForm.getRawValue();
    if (v.subscriptionStatus === SubscriptionStatus._1 && !v.subscriptionEndDate) {
      this.notify.warning('A trial needs an end date.');
      return;
    }

    this.subscriptionError.set(null);
    this.savingSubscription.set(true);

    // If this method name doesn't exist, search api-client.ts for "UpdateSubscriptionDto" to find the right one
    this.client.subscription(new UpdateSubscriptionDto({
      tenantId: this.tenantId,
      subscriptionStatus: v.subscriptionStatus!,
      subscriptionPlanCode: v.subscriptionPlanCode || undefined,
      subscriptionEndDate: v.subscriptionEndDate ? (new Date(v.subscriptionEndDate) as any) : undefined
    })).subscribe({
      next: (updated) => {
        this.savingSubscription.set(false);
        this.tenant.set(updated);
        this.patchSubscription(updated);
        this.notify.success('Subscription updated.');
      },
      error: (err: any) => {
        this.savingSubscription.set(false);
        const msg = this.extractErrorMessage(err, 'Could not update the subscription.');
        this.subscriptionError.set(msg);
        this.notify.danger(msg);
      }
    });
  }

  // ───────────────────────── Details ─────────────────────────

  submit(): void {
    if (this.saving()) return;

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

    // The subscription is saved with its own button; don't leave the page and lose those edits
    if (this.subForm.dirty) {
      this.notify.warning('You have unsaved subscription changes. Click "Update Subscription" first.');
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
      error: (err: any) => {
        this.saving.set(false);
        const message = this.extractErrorMessage(err, 'Could not save this tenant.');
        this.errorMessage.set(message);
        this.notify.danger(message);
      }
    });
  }

  async cancel(): Promise<void> {
    if (this.form.dirty || this.subForm.dirty) {
      const confirmed = await this.alert.confirm(
        'Discard changes?',
        'You have unsaved changes. Are you sure you want to leave without saving?'
      );
      if (!confirmed) return;
    }
    this.router.navigate(['/tenants']);
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