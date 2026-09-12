import { Component, OnInit, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Client, UpdateTenantDto } from '../../../core/api/api-client';
import { NotificationService } from '../../../shared/notification/notification.service';
import { PageHeader } from "../../../shared/page-header/page-header";

@Component({
  selector: 'app-tenant-form',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, PageHeader],
  templateUrl: './tenant-form.html'
})
export class TenantForm implements OnInit {
  private fb = inject(FormBuilder);
  private client = inject(Client);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private notify = inject(NotificationService);

  readonly loading = signal(false);
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

  ngOnInit(): void {
    this.tenantId = Number(this.route.snapshot.paramMap.get('id'));
    this.loading.set(true);
    this.client.tenantsGET(this.tenantId).subscribe({
      next: (t) => {
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
        this.loading.set(false);
      },
      error: () => {
        this.notify.danger('Could not load this tenant.');
        this.loading.set(false);
      }
    });
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.notify.warning('Please check the highlighted fields.');
      return;
    }

    this.loading.set(true);
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
        this.loading.set(false);
        this.notify.success('Tenant updated successfully.');
        this.router.navigate(['/tenants']);
      },
      error: (err) => {
        this.loading.set(false);
        const message = typeof err.error === 'string' ? err.error : 'Could not save this tenant.';
        this.notify.danger(message);
      }
    });
  }
}