import { Component, OnInit, AfterViewInit, ElementRef, ViewChild, inject, signal, computed } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { Client, CreateSupplierPaymentDto, SupplierDto, PaymentMethodDto, UnpaidPurchaseDto } from '../../../core/api/api-client';
import { NotificationService } from '../../../shared/notification/notification.service';
import { AlertService } from '../../../shared/alert/alert.service';
import { SearchableSelect, SearchableOption } from '../../../shared/searchable-select/searchable-select';
import { PageHeader } from '../../../shared/page-header/page-header';
import { DecimalPipe } from '@angular/common';

@Component({
  selector: 'app-supplier-payment-form',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, SearchableSelect, PageHeader, DecimalPipe],
  templateUrl: './supplier-payment-form.html',
  styleUrl: './supplier-payment-form.css'
})
export class SupplierPaymentForm implements OnInit, AfterViewInit {
  private fb = inject(FormBuilder);
  private client = inject(Client);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private notify = inject(NotificationService);
  private alert = inject(AlertService);

  @ViewChild('amountInput') amountInput?: ElementRef<HTMLInputElement>;

  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly isEditMode = signal(false);
  private paymentId: number | null = null;

  readonly allSuppliers = signal<SupplierDto[]>([]);
  readonly allPaymentMethods = signal<PaymentMethodDto[]>([]);
  readonly unpaidPurchases = signal<UnpaidPurchaseDto[]>([]);
  readonly loadingPurchases = signal(false);

  // Syncs with the purchaseId form control so computed signals react to changes
  readonly currentPurchaseId = signal<number | null>(null);

  private originalPurchaseId: number | null = null;
  private originalAmount = 0;

  form = this.fb.group({
    supplierId: [null as number | null, Validators.required],
    purchaseId: [null as number | null, Validators.required],
    paymentDate: [this.today(), Validators.required],
    amount: [0, [Validators.required, Validators.min(0.01)]],
    paymentMethodId: [null as number | null, Validators.required],
    referenceNo: [{ value: '', disabled: true }],
    remarks: ['']
  });

  get supplierIdControl() { return this.form.controls.supplierId; }
  get purchaseIdControl() { return this.form.controls.purchaseId; }
  get amountControl() { return this.form.controls.amount; }
  get paymentMethodIdControl() { return this.form.controls.paymentMethodId; }

  get breadcrumbSegments(): string[] {
    return ['Purchasing', this.isEditMode() ? 'Edit Payment' : 'New Payment'];
  }

  readonly supplierOptions = computed<SearchableOption[]>(() =>
    this.allSuppliers().map((s) => ({
      id: s.id!,
      label: s.name!
    }))
  );

  readonly purchaseOptions = computed<SearchableOption[]>(() =>
    this.unpaidPurchases().map((p) => ({
      id: p.id!,
      label: p.invoiceNo!,
      sublabel: `Due: ${(p.dueAmount ?? 0).toFixed(2)}`
    }))
  );

  readonly selectedPurchase = computed<UnpaidPurchaseDto | undefined>(() =>
    this.unpaidPurchases().find((p) => p.id === this.currentPurchaseId())
  );

  readonly maxPayable = computed<number | null>(() => {
    const purchase = this.selectedPurchase();
    if (!purchase) return null;
    const bonus = this.isEditMode() && purchase.id === this.originalPurchaseId ? this.originalAmount : 0;
    return (purchase.dueAmount ?? 0) + bonus;
  });

  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }

  ngOnInit(): void {
    this.client.paymentMethodsAll().subscribe({ next: (d) => this.allPaymentMethods.set(d) });

    const idParam = this.route.snapshot.paramMap.get('id');
    if (idParam) {
      this.paymentId = Number(idParam);
      this.isEditMode.set(true);
      this.loading.set(true);

      this.client.suppliersAll().subscribe({ next: (d) => this.allSuppliers.set(d) });

      this.client.supplierPaymentsGET(this.paymentId).subscribe({
        next: (payment) => {
          this.originalPurchaseId = payment.purchaseId ?? null;
          this.originalAmount = payment.amount ?? 0;

          this.form.patchValue({
            supplierId: payment.supplierId,
            purchaseId: payment.purchaseId ?? null,
            paymentDate: payment.paymentDate ? new Date(payment.paymentDate).toISOString().slice(0, 10) : this.today(),
            amount: payment.amount,
            paymentMethodId: payment.paymentMethodId,
            referenceNo: payment.referenceNo ?? '',
            remarks: payment.remarks ?? ''
          });

          this.currentPurchaseId.set(payment.purchaseId ?? null);
          this.loadUnpaidPurchases(payment.supplierId!, this.paymentId!);
          this.form.markAsPristine();
          this.loading.set(false);
        },
        error: (err: HttpErrorResponse) => {
          const msg = this.extractErrorMessage(err, 'Could not load this payment.');
          this.errorMessage.set(msg);
          this.notify.danger(msg);
          this.loading.set(false);
        }
      });
    } else {
      this.client.suppliersAll().subscribe({ next: (d) => this.allSuppliers.set(d) });
      this.loading.set(false);
    }

    this.supplierIdControl.valueChanges.subscribe((supplierId) => {
      this.form.get('purchaseId')?.setValue(null, { emitEvent: false });
      this.currentPurchaseId.set(null); 
      this.form.controls.referenceNo.setValue('');

      if (supplierId) {
        this.loadUnpaidPurchases(supplierId, this.isEditMode() ? this.paymentId : null);
      } else {
        this.unpaidPurchases.set([]);
      }
    });

    this.purchaseIdControl.valueChanges.subscribe((purchaseId) => {
      this.currentPurchaseId.set(purchaseId);
      
      if (purchaseId) {
        const purchase = this.unpaidPurchases().find((p) => p.id === purchaseId);
        if (purchase?.invoiceNo) {
          this.form.controls.referenceNo.setValue(purchase.invoiceNo);
        }
      } else {
        this.form.controls.referenceNo.setValue('');
      }
    });
  }

  ngAfterViewInit(): void {
    if (!this.isEditMode()) {
      this.amountInput?.nativeElement.focus();
    }
  }

  private loadUnpaidPurchases(supplierId: number, excludePaymentId: number | null): void {
    this.loadingPurchases.set(true);
    this.client.unpaidPurchases(supplierId, excludePaymentId ?? undefined).subscribe({
      next: (data) => {
        this.unpaidPurchases.set(data);
        this.loadingPurchases.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.notify.danger(this.extractErrorMessage(err, 'Could not load unpaid purchases for this supplier.'));
        this.loadingPurchases.set(false);
      }
    });
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      if (this.supplierIdControl.invalid) this.notify.warning('Supplier is required.');
      else if (this.purchaseIdControl.invalid) this.notify.warning('Purchase Invoice is required.');
      else if (this.amountControl.invalid) this.notify.warning('Enter a valid payment amount.');
      else if (this.paymentMethodIdControl.invalid) this.notify.warning('Payment method is required.');
      return;
    }

    const max = this.maxPayable();
    if (max !== null && this.amountControl.value! > max) {
      const msg = `Amount cannot exceed the remaining amount (${max.toFixed(2)}).`;
      this.errorMessage.set(msg);
      this.notify.warning(msg);
      return;
    }

    this.errorMessage.set(null);
    this.saving.set(true);
    const v = this.form.getRawValue();

    const dto = new CreateSupplierPaymentDto({
      supplierId: v.supplierId!,
      purchaseId: v.purchaseId ?? undefined,
      paymentDate: new Date(v.paymentDate!) as any,
      amount: v.amount!,
      paymentMethodId: v.paymentMethodId!,
      referenceNo: v.referenceNo?.trim() || undefined,
      remarks: v.remarks?.trim() || undefined
    });

    const request$ = this.isEditMode()
      ? this.client.supplierPaymentsPUT(this.paymentId!, dto)
      : this.client.supplierPaymentsPOST(dto);

    request$.subscribe({
      next: () => {
        this.saving.set(false);
        this.form.markAsPristine();
        this.notify.success(this.isEditMode() ? 'Payment updated successfully.' : 'Payment recorded successfully.');
        this.router.navigate(['/supplier-payments']);
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        const msg = this.extractErrorMessage(err, 'Could not save this payment.');
        this.errorMessage.set(msg);
        this.notify.danger(msg);
      }
    });
  }

  async cancel(): Promise<void> {
    if (this.form.dirty) {
      const confirmed = await this.alert.confirm('Discard changes?', 'You have unsaved changes. Are you sure you want to leave without saving?');
      if (!confirmed) return;
    }
    this.router.navigate(['/supplier-payments']);
  }

  private extractErrorMessage(err: any, defaultMessage: string): string {
    if (err.response) {
      try {
        const parsed = JSON.parse(err.response);
        if (parsed.message) return parsed.message;
        if (parsed.detail) return parsed.detail;
        if (parsed.title) return parsed.title;
      } catch {
        if (typeof err.response === 'string' && err.response.trim() !== '') {
          return err.response;
        }
      }
    }

    if (err.error) {
      if (typeof err.error === 'string') return err.error;
      if (err.error.message) return err.error.message;
      if (err.error.detail) return err.error.detail;
      if (err.error.title) return err.error.title;
    }
    return err.message || defaultMessage;
  }
}