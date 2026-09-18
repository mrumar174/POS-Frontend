import { Component, OnInit, AfterViewInit, ElementRef, ViewChild, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { Client, CreateShopDto, UpdateShopDto } from '../../../core/api/api-client';
import { NotificationService } from '../../../shared/notification/notification.service';
import { AlertService } from '../../../shared/alert/alert.service';
import { PageHeader } from '../../../shared/page-header/page-header';

const NAME_MAX_LENGTH = 100;
const INVOICE_PREFIX_MAX_LENGTH = 10;

@Component({
  selector: 'app-shop-form',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, PageHeader],
  templateUrl: './shop-form.html',
  styleUrl: './shop-form.css'
})
export class ShopForm implements OnInit, AfterViewInit {
  private fb = inject(FormBuilder);
  private client = inject(Client);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private notify = inject(NotificationService);
  private alert = inject(AlertService);

  @ViewChild('nameInput') nameInput?: ElementRef<HTMLInputElement>;

  readonly loading = signal(false);   // initial load in edit mode
  readonly saving = signal(false);    // submit in progress
  readonly errorMessage = signal<string | null>(null);
  readonly isEditMode = signal(false);
  private shopId: number | null = null;

  readonly nameMaxLength = NAME_MAX_LENGTH;
  readonly invoicePrefixMaxLength = INVOICE_PREFIX_MAX_LENGTH;

  form = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(NAME_MAX_LENGTH)]],
    address: [''],
    city: [''],
    contactNo: [''],
    invoicePrefix: ['', [Validators.maxLength(INVOICE_PREFIX_MAX_LENGTH)]]
  });

  get breadcrumbSegments(): string[] {
    return ['Tenancy', this.isEditMode() ? 'Edit Shop' : 'Create Shop'];
  }

  get nameControl() { return this.form.controls.name; }
  get invoicePrefixControl() { return this.form.controls.invoicePrefix; }

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
          this.form.markAsPristine();
          this.loading.set(false);
        },
        error: () => {
          this.errorMessage.set('Could not load this shop.');
          this.notify.danger('Could not load this shop.');
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
    const trimmedName = (this.nameControl.value ?? '').trim();
    const trimmedPrefix = (this.invoicePrefixControl.value ?? '').trim().toUpperCase();
    this.form.patchValue({ name: trimmedName, invoicePrefix: trimmedPrefix }, { emitEvent: false });

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.nameInput?.nativeElement.focus();

      if (this.nameControl.hasError('required')) {
        this.notify.warning('Name is required.');
      } else if (this.nameControl.hasError('maxlength')) {
        this.notify.warning(`Name cannot exceed ${this.nameMaxLength} characters.`);
      } else if (this.invoicePrefixControl.hasError('maxlength')) {
        this.notify.warning(`Invoice prefix cannot exceed ${this.invoicePrefixMaxLength} characters.`);
      }
      return;
    }

    this.errorMessage.set(null);
    this.saving.set(true);
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
        this.saving.set(false);
        this.form.markAsPristine();
        this.notify.success(this.isEditMode() ? 'Shop updated successfully.' : 'Shop created successfully.');
        this.router.navigate(['/shops']);
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        const message = typeof err.error === 'string' ? err.error : err.error?.message ?? 'Could not save this shop.';
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
    this.router.navigate(['/shops']);
  }
}