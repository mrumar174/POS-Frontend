import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, FormArray, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { Client, CreatePurchaseDto, CreatePurchaseDetailDto, SupplierDto, PaymentMethodDto, ProductDto } from '../../../core/api/api-client';
import { NotificationService } from '../../../shared/notification/notification.service';
import { SearchableSelect, SearchableOption } from '../../../shared/searchable-select/searchable-select';
import { AlertService } from '../../../shared/alert/alert.service';
import { PageHeader } from '../../../shared/page-header/page-header';
import { DecimalPipe } from '@angular/common';

@Component({
  selector: 'app-purchase-form',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, DecimalPipe, SearchableSelect, PageHeader],
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

  readonly discountTypes = [
    { value: 1, label: 'Percentage (%)' },
    { value: 2, label: 'Per Piece' },
    { value: 3, label: 'Flat Amount' }
  ];

  readonly productOptions = computed<SearchableOption[]>(() =>
    this.allProducts().map((p) => ({ id: p.id!, label: p.name!, sublabel: p.productCode }))
  );

  form = this.fb.group({
    supplierId: [null as number | null, Validators.required],
    purchaseDate: [this.today(), Validators.required],
    paymentMethodId: [null as number | null],
    discountType: [3, Validators.required],
    discountValue: [0, [Validators.required, Validators.min(0)]], 
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

  rowTotal(index: number): number {
    const row = this.items.at(index);
    const qty = Number(row.get('quantity')?.value) || 0;
    const price = Number(row.get('purchasePrice')?.value) || 0;
    const tax = Number(row.get('tax')?.value) || 0;
    const discount = this.rowDiscountAmount(index);
    const total = qty * price - discount + tax;
    row.get('total')?.setValue(Math.max(0, total), { emitEvent: false });
    return Math.max(0, total);
  }

  get subTotal(): number {
    return this.items.controls.reduce((sum, _, i) => sum + this.rowTotal(i), 0);
  }

  get headerDiscountAmount(): number {
    const type = Number(this.form.get('discountType')?.value);
    const value = Number(this.form.get('discountValue')?.value) || 0;
    const totalQty = this.items.controls.reduce((sum, r) => sum + (Number(r.get('quantity')?.value) || 0), 0);

    if (type === 1) return Math.round(this.subTotal * (value / 100) * 100) / 100;
    if (type === 2) return Math.round(value * totalQty * 100) / 100;
    return value;
  }

  // Computes the combined total of row-level discounts and the header discount
  get totalDiscountAmount(): number {
    const rowDiscounts = this.items.controls.reduce((sum, _, i) => sum + this.rowDiscountAmount(i), 0);
    return rowDiscounts + this.headerDiscountAmount;
  }

  // Add this new getter for Total Tax
  get totalTaxAmount(): number {
    const headerTax = Number(this.form.get('tax')?.value) || 0;
    const rowTaxes = this.items.controls.reduce((sum, r) => sum + (Number(r.get('tax')?.value) || 0), 0);
    return headerTax + rowTaxes;
  }

  get grandTotal(): number {
    const tax = Number(this.form.get('tax')?.value) || 0;
    return Math.max(0, this.subTotal - this.headerDiscountAmount + tax);
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
            discountType: purchase.discountType,
            discountValue: purchase.discountValue,
            tax: purchase.tax,
            paidAmount: purchase.paidAmount,
            remarks: purchase.remarks ?? ''
          });
          for (const item of purchase.items ?? []) {
            this.items.push(this.buildRow(item.productId!, item.quantity!, item.purchasePrice!, item.discountType!, item.discountValue!, item.tax!, item.total!));
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

  private buildRow(productId: number | null, quantity: number, purchasePrice: number, discountType: number, discountValue: number, tax: number, total: number): FormGroup {    const group = this.fb.group({
      productId: [productId, Validators.required],
      quantity: [quantity, [Validators.required, Validators.min(0.001)]],
      purchasePrice: [purchasePrice, [Validators.required, Validators.min(0)]],
      discountType: [discountType, Validators.required],
      discountValue: [discountValue, [Validators.min(0)]],
      tax: [tax, [Validators.min(0)]],
      total: [total]
    });

    group.get('productId')?.valueChanges.subscribe((id: number | null) => {
      if (id === null) return; 
      const product = this.allProducts().find((p) => p.id === id);
      if (product) {
        group.get('purchasePrice')?.setValue(product.purchasePrice ?? 0);
      }
    });

    return group;
  }

  addRow(): void {
    this.items.push(this.buildRow(null, 1, 0, 3, 0, 0, 0));
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

  productName(id: number | null): string {
    return this.allProducts().find((p) => p.id === id)?.name ?? '';
  }

  submit(): void {
    if (this.form.invalid || this.items.length === 0) {
      this.form.markAllAsTouched();
      if (this.supplierIdControl.invalid) {
        this.notify.warning('Supplier is required.');
      } else if (this.items.controls.some((r) => !r.get('productId')?.value)) {
        this.notify.warning('Every item needs a product selected.');
      } else {
        this.notify.warning('Please check the highlighted fields.');
      }
      return;
    }

    const v = this.form.getRawValue();

    // Prevent submission if money is entered but no payment method is selected
    if (v.paidAmount! > 0 && !v.paymentMethodId) {
      this.notify.warning('Please select a Payment Method to record this payment.');
      return;
    }

    this.errorMessage.set(null);
    this.saving.set(true);
    
    const items = v.items!.map(
      (r: any, i: number) =>
        new CreatePurchaseDetailDto({
          productId: r.productId,
          quantity: r.quantity,
          purchasePrice: r.purchasePrice,
          discountType: r.discountType,
          discountValue: r.discountValue || 0,
          tax: r.tax || 0,
          total: this.rowTotal(i)
        })
    );

    const dto = new CreatePurchaseDto({
      supplierId: v.supplierId!,
      purchaseDate: new Date(v.purchaseDate!) as any,
      discountType: v.discountType!,
      discountValue: v.discountValue!,
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

  rowDiscountAmount(index: number): number {
    const row = this.items.at(index);
    const qty = Number(row.get('quantity')?.value) || 0;
    const price = Number(row.get('purchasePrice')?.value) || 0;
    const type = Number(row.get('discountType')?.value);
    const value = Number(row.get('discountValue')?.value) || 0;
    const base = qty * price;

    if (type === 1) return Math.round(base * (value / 100) * 100) / 100;
    if (type === 2) return Math.round(value * qty * 100) / 100;
    return value;
  }
}