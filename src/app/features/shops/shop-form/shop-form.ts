import { Component, OnInit, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Client, CreateShopDto, UpdateShopDto } from '../../../core/api/api-client';
import { NotificationService } from '../../../shared/notification/notification.service';
import { PageHeader } from "../../../shared/page-header/page-header";

@Component({
  selector: 'app-shop-form',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, PageHeader],
  templateUrl: './shop-form.html'
})
export class ShopForm implements OnInit {
  private fb = inject(FormBuilder);
  private client = inject(Client);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private notify = inject(NotificationService);

  readonly loading = signal(false);
  readonly isEditMode = signal(false);
  private shopId: number | null = null;

  form = this.fb.group({
    name: ['', Validators.required],
    address: [''],
    city: [''],
    contactNo: [''],
    invoicePrefix: ['']
  });

  ngOnInit(): void {
    const idParam = this.route.snapshot.paramMap.get('id');
    if (idParam) {
      this.shopId = Number(idParam);
      this.isEditMode.set(true);
      this.loading.set(true);
      this.client.shopsGET(this.shopId).subscribe({
        next: (shop) => {
          this.form.patchValue({
            name: shop.name,
            address: shop.address ?? '',
            city: shop.city ?? '',
            contactNo: shop.contactNo ?? '',
            invoicePrefix: shop.invoicePrefix ?? ''
          });
          this.loading.set(false);
        },
        error: () => {
          this.notify.danger('Could not load this shop.');
          this.loading.set(false);
        }
      });
    }
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      if (this.form.controls.name.hasError('required')) {
        this.notify.warning('Name is required.');
      }
      return;
    }

    this.loading.set(true);
    const v = this.form.getRawValue();

    const request$ = this.isEditMode()
      ? this.client.shopsPUT(this.shopId!, new UpdateShopDto({
          id: this.shopId!,
          name: v.name!,
          address: v.address || undefined,
          city: v.city || undefined,
          contactNo: v.contactNo || undefined,
          invoicePrefix: v.invoicePrefix || undefined
        }))
      : this.client.shopsPOST(new CreateShopDto({
          name: v.name!,
          address: v.address || undefined,
          city: v.city || undefined,
          contactNo: v.contactNo || undefined,
          invoicePrefix: v.invoicePrefix || undefined
        }));

    request$.subscribe({
      next: () => {
        this.loading.set(false);
        this.notify.success(this.isEditMode() ? 'Shop updated successfully.' : 'Shop created successfully.');
        this.router.navigate(['/shops']);
      },
      error: (err) => {
        this.loading.set(false);
        const message = typeof err.error === 'string' ? err.error : 'Could not save this shop.';
        this.notify.danger(message);
      }
    });
  }
}