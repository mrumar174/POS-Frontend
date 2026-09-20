import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, FormArray, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { Client, CreatePurchaseDto, CreatePurchaseDetailDto, SupplierDto, PaymentMethodDto, ProductDto } from '../../../core/api/api-client';
import { NotificationService } from '../../../shared/notification/notification.service';
import { AlertService } from '../../../shared/alert/alert.service';
import { PageHeader } from '../../../shared/page-header/page-header';
import { DecimalPipe } from '@angular/common';

@Component({
  selector: 'app-purchase-form',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, PageHeader, DecimalPipe],
  templateUrl: './purchase-form.html',
  styleUrl: './purchase-form.css'
})
export class PurchaseForm implements OnInit {
  private fb = inject(FormBuilder);
  private client = inject(Client);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private notify = inject(NotificationService);
  private alert = inject(AlertService);

  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly isEditMode = signal(false);
  readonly existingInvoiceNo = signal<string | null>(null);
  private purchaseId: number | null = null;

  readonly allSuppliers = signal<SupplierDto[]>([]);
  readonly allPaymentMethods = signal<PaymentMethodDto[]>([]);
  readonly allProducts = signal<ProductDto[]>([]);

  form = this.fb.group({
    supplierId: [null as number | null, Validators.required],
    purchaseDate: [this.today(), Validators.required],
    paymentMethodId: [null as number | null],
    discount: [0, [Validators.required, Validators.min(0)]],
    tax: [0, [Validators.required, Validators.min(0)]],
    paidAmount: [0, [Validators.required, Validators.min(0)]],
    remarks: [''],
    items: this.fb.array<FormGroup>([])
  });

  get supplierIdControl() { return this.form.controls.supplierId; }
  get items(): FormArray<FormGroup> { return this.form.get('items') as FormArray<FormGroup>; }

  get breadcrumbSegments(): string[] {
    return ['Purchasing', this.isEditMode() ? 'Edit Purchase' : 'New Purchase'];
  }

  // ---------------------------------------------------------
  // Live totals — recomputed on every change-detection pass, which is
  // fine at the row counts a purchase form realistically has.
  // ---------------------------------------------------------
  rowTotal(index: number): number {
    const row = this.items.at(index);
    const qty = Number(row.get('quantity')?.value) || 0;
    const price = Number(row.get('purchasePrice')?.value) || 0;
    const discount = Number(row.get('discount')?.value) || 0;
    const tax = Number(row.get('tax')?.value) || 0;
    const total = qty * price - discount + tax;
    row.get('total')?.setValue(Math.max(0, total), { emitEvent: false });
    return Math.max(0, total);
  }

  get subTotal(): number {
    return this.items.controls.reduce((sum, _, i) => sum + this.rowTotal(i), 0);
  }

  get grandTotal(): number {
    const discount = Number(this.form.get('discount')?.value) || 0;
    const tax = Number(this.form.get('tax')?.value) || 0;
    return Math.max(0, this.subTotal - discount + tax);
  }

  get dueAmount(): number {
    const paid = Number(this.form.get('paidAmount')?.value) || 0;
    return this.grandTotal - paid;
  }

  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }

  ngOnInit(): void {
    this.client.suppliersAll().subscribe({ next: (d) => this.allSuppliers.set(d) });
    this.client.paymentMethodsAll().subscribe({ next: (d) => this.allPaymentMethods.set(d) });
    this.client.productsAll().subscribe({ next: (d) => this.allProducts.set(d) });

    const idParam = this.route.snapshot.paramMap.get('id');
    if (idParam) {
      this.purchaseId = Number(idParam);
      this.isEditMode.set(true);
      this.loading.set(true);

      this.client.purchasesGET(this.purchaseId).subscribe({
        next: (purchase) => {
          this.existingInvoiceNo.set(purchase.invoiceNo ?? null);
          this.form.patchValue({
            supplierId: purchase.supplierId,
            purchaseDate: purchase.purchaseDate ? new Date(purchase.purchaseDate).toISOString().slice(0, 10) : this.today(),
            paymentMethodId: purchase.paymentMethodId ?? null,
            discount: purchase.discount,
            tax: purchase.tax,
            paidAmount: purchase.paidAmount,
            remarks: purchase.remarks ?? ''
          });
          for (const item of purchase.items ?? []) {
            this.items.push(this.buildRow(item.productId!, item.quantity!, item.purchasePrice!, item.discount!, item.tax!, item.total!));
          }
          this.form.markAsPristine();
          this.loading.set(false);
        },
        error: () => {
          this.errorMessage.set('Could not load this purchase.');
          this.notify.danger('Could not load this purchase.');
          this.loading.set(false);
        }
      });
    } else {
      this.addRow(); // start with one empty row
      this.loading.set(false);
    }
  }

  private buildRow(productId: number, quantity: number, purchasePrice: number, discount: number, tax: number, total: number): FormGroup {
    return this.fb.group({
      productId: [productId, Validators.required],
      quantity: [quantity, [Validators.required, Validators.min(0.001)]],
      purchasePrice: [purchasePrice, [Validators.required, Validators.min(0)]],
      discount: [discount, [Validators.min(0)]],
      tax: [tax, [Validators.min(0)]],
      total: [total]
    });
  }

  addRow(): void {
    this.items.push(this.buildRow(0, 1, 0, 0, 0, 0));
    this.form.markAsDirty();
  }

  async removeRow(index: number): Promise<void> {
    if (this.items.length <= 1) {
      this.notify.warning('A purchase must have at least one item.');
      return;
    }
    this.items.removeAt(index);
    this.form.markAsDirty();
  }

  onProductChange(index: number, event: Event): void {
    const productId = Number((event.target as HTMLSelectElement).value);
    const product = this.allProducts().find((p) => p.id === productId);
    if (product) {
      this.items.at(index).patchValue({ purchasePrice: product.purchasePrice ?? 0 });
    }
  }

  productName(id: number | null): string {
    return this.allProducts().find((p) => p.id === id)?.name ?? '';
  }

  submit(): void {
    if (this.form.invalid || this.items.length === 0) {
      this.form.markAllAsTouched();
      if (this.supplierIdControl.invalid) {
        this.notify.warning('Supplier is required.');
      } else if (this.items.controls.some((r) => r.get('productId')?.value === 0)) {
        this.notify.warning('Every item needs a product selected.');
      } else {
        this.notify.warning('Please check the highlighted fields.');
      }
      return;
    }

    this.errorMessage.set(null);
    this.saving.set(true);
    const v = this.form.getRawValue();

    const items = v.items!.map(
      (r: any, i: number) =>
        new CreatePurchaseDetailDto({
          productId: r.productId,
          quantity: r.quantity,
          purchasePrice: r.purchasePrice,
          discount: r.discount || 0,
          tax: r.tax || 0,
          total: this.rowTotal(i)
        })
    );

    const dto = new CreatePurchaseDto({
      supplierId: v.supplierId!,
      purchaseDate: new Date(v.purchaseDate!) as any,
      discount: v.discount!,
      tax: v.tax!,
      paidAmount: v.paidAmount!,
      paymentMethodId: v.paymentMethodId ?? undefined,
      remarks: v.remarks?.trim() || undefined,
      items
    });

    const request$ = this.isEditMode()
      ? this.client.purchasesPUT(this.purchaseId!, dto)
      : this.client.purchasesPOST(dto);

    request$.subscribe({
      next: () => {
        this.saving.set(false);
        this.form.markAsPristine();
        this.notify.success(this.isEditMode() ? 'Purchase updated successfully.' : 'Purchase recorded successfully.');
        this.router.navigate(['/purchases']);
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        const message = typeof err.error === 'string' ? err.error : err.error?.message ?? 'Could not save this purchase.';
        this.errorMessage.set(message);
        this.notify.danger(message);
      }
    });
  }

  async cancel(): Promise<void> {
    if (this.form.dirty) {
      const confirmed = await this.alert.confirm('Discard changes?', 'You have unsaved changes. Are you sure you want to leave without saving?');
      if (!confirmed) return;
    }
    this.router.navigate(['/purchases']);
  }
}