import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, FormArray, FormGroup, Validators, FormControl } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Client, CreateSaleDto, CreateSaleDetailDto, ProductDto, PaymentMethodDto } from '../../../core/api/api-client';
import { NotificationService } from '../../../shared/notification/notification.service';
import { SearchableSelect, SearchableOption } from '../../../shared/searchable-select/searchable-select';
import { AlertService } from '../../../shared/alert/alert.service';
import { PageHeader } from '../../../shared/page-header/page-header';
import { DecimalPipe } from '@angular/common';

@Component({
  selector: 'app-sale-form',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, DecimalPipe, SearchableSelect, PageHeader],
  templateUrl: './sale-form.html',
  styleUrl: './sale-form.css'
})
export class SaleForm implements OnInit {
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
  private saleId: number | null = null;

  readonly allProducts = signal<ProductDto[]>([]);
  readonly allPaymentMethods = signal<PaymentMethodDto[]>([]);

  readonly discountTypes = [
    { value: 1, label: '%' },
    { value: 2, label: '/pc' },
    { value: 3, label: 'Flat' }
  ];

  readonly productOptions = computed<SearchableOption[]>(() =>
    this.allProducts().map((p) => ({ id: p.id!, label: p.name!, sublabel: p.productCode }))
  );

  productSearchControl = new FormControl<number | null>(null);

  form = this.fb.group({
    customerName: [''],
    saleDate: [this.today(), Validators.required],
    discountType: [3, Validators.required],
    discountValue: [0, [Validators.min(0)]],
    tax: [0, [Validators.min(0)]],
    paidAmount: [0, [Validators.required, Validators.min(0)]],
    paymentMethodId: [null as number | null, Validators.required],
    remarks: [''],
    items: this.fb.array<FormGroup>([])
  });

  get items(): FormArray<FormGroup> { return this.form.get('items') as FormArray<FormGroup>; }
  get breadcrumbSegments(): string[] { return ['Sales', this.isEditMode() ? 'Edit Sale' : 'Point of Sale']; }

  rowTotal(index: number): number {
    const row = this.items.at(index);
    const qty = Number(row.get('quantity')?.value) || 0;
    const price = Number(row.get('salePrice')?.value) || 0;
    const tax = Number(row.get('tax')?.value) || 0;
    const discount = this.rowDiscountAmount(index);
    const total = (qty * price) - discount + tax;
    
    row.get('total')?.setValue(Math.max(0, total), { emitEvent: false });
    return Math.max(0, total);
  }

  rowDiscountAmount(index: number): number {
    const row = this.items.at(index);
    const qty = Number(row.get('quantity')?.value) || 0;
    const price = Number(row.get('salePrice')?.value) || 0;
    const type = Number(row.get('discountType')?.value);
    const value = Number(row.get('discountValue')?.value) || 0;
    const base = qty * price;

    if (type === 1) return Math.round(base * (value / 100) * 100) / 100;
    if (type === 2) return Math.round(value * qty * 100) / 100;
    return value;
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

  get totalDiscountAmount(): number {
    const rowDiscounts = this.items.controls.reduce((sum, _, i) => sum + this.rowDiscountAmount(i), 0);
    return rowDiscounts + this.headerDiscountAmount;
  }

  get totalTaxAmount(): number {
    const headerTax = Number(this.form.get('tax')?.value) || 0;
    const rowTaxes = this.items.controls.reduce((sum, r) => sum + (Number(r.get('tax')?.value) || 0), 0);
    return headerTax + rowTaxes;
  }

  get grandTotal(): number {
    const tax = Number(this.form.get('tax')?.value) || 0;
    return Math.max(0, this.subTotal - this.headerDiscountAmount + tax);
  }

  get paidAmount(): number { return Number(this.form.get('paidAmount')?.value) || 0; }
  
  get changeAmount(): number {
    return this.paidAmount > this.grandTotal ? this.paidAmount - this.grandTotal : 0;
  }

  get dueAmount(): number {
    return this.grandTotal > this.paidAmount ? this.grandTotal - this.paidAmount : 0;
  }

  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }

  ngOnInit(): void {
    this.client.productsAll().subscribe({ next: (d) => this.allProducts.set(d) });
    this.client.paymentMethodsAll().subscribe({ next: (d) => {
      this.allPaymentMethods.set(d);
      if (!this.isEditMode() && d.length > 0) {
        const cash = d.find(m => m.name?.toLowerCase().includes('cash')) || d[0];
        this.form.get('paymentMethodId')?.setValue(cash.id!);
      }
    }});

    this.productSearchControl.valueChanges.subscribe(id => {
      if (id) this.onProductSelected(id);
    });

    this.form.valueChanges.subscribe(() => {
      if (!this.form.get('paidAmount')?.dirty) {
        this.form.get('paidAmount')?.setValue(this.grandTotal, { emitEvent: false });
      }
    });

    const idParam = this.route.snapshot.paramMap.get('id');
    if (idParam) {
      this.saleId = Number(idParam);
      this.isEditMode.set(true);
      this.loading.set(true);

      this.client.salesGET(this.saleId).subscribe({
        next: (sale) => {
          this.existingInvoiceNo.set(sale.invoiceNo ?? null);
          this.form.patchValue({
            customerName: sale.customerName ?? '',
            saleDate: sale.saleDate ? new Date(sale.saleDate).toISOString().slice(0, 10) : this.today(),
            discountType: sale.discountType,
            discountValue: sale.discountValue,
            tax: sale.tax,
            paidAmount: sale.paidAmount,
            paymentMethodId: sale.paymentMethodId ?? null,
            remarks: sale.remarks ?? ''
          });
          for (const item of sale.items ?? []) {
            this.items.push(this.buildRow(item.productId!, item.productName!, item.quantity!, item.salePrice!, item.discountType!, item.discountValue!, item.tax!, item.total!));
          }
          this.form.markAsPristine();
          this.loading.set(false);
        },
        error: (err: any) => {
          this.errorMessage.set('Could not load this sale.');
          this.notify.danger('Could not load this sale.');
          this.loading.set(false);
        }
      });
    }
  }

  onProductSelected(productId: number): void {
    const existingRowIdx = this.items.controls.findIndex(c => c.get('productId')?.value === productId);
    
    if (existingRowIdx >= 0) {
      const row = this.items.at(existingRowIdx);
      const currentQty = Number(row.get('quantity')?.value) || 0;
      row.get('quantity')?.setValue(currentQty + 1);
    } else {
      const product = this.allProducts().find(p => p.id === productId);
      if (product) {
        this.items.push(this.buildRow(product.id!, product.name!, 1, product.salePrice ?? 0, 3, 0, 0, product.salePrice ?? 0));
      }
    }
    
    this.form.markAsDirty();
    setTimeout(() => this.productSearchControl.setValue(null, { emitEvent: false }), 0);
  }

  private buildRow(productId: number, productName: string, quantity: number, salePrice: number, discountType: number, discountValue: number, tax: number, total: number): FormGroup {    
    return this.fb.group({
      productId: [productId],
      productName: [{ value: productName, disabled: true }],
      quantity: [quantity, [Validators.required, Validators.min(0.001)]],
      salePrice: [salePrice, [Validators.required, Validators.min(0)]],
      discountType: [discountType, Validators.required],
      discountValue: [discountValue, [Validators.min(0)]],
      tax: [tax, [Validators.min(0)]],
      total: [{ value: total, disabled: true }]
    });
  }

  removeRow(index: number): void {
    this.items.removeAt(index);
    this.form.markAsDirty();
  }

  submit(): void {
    if (this.form.invalid || this.items.length === 0) {
      this.form.markAllAsTouched();
      if (this.items.length === 0) this.notify.warning('Cart is empty.');
      else this.notify.warning('Please complete all required fields.');
      return;
    }

    const v = this.form.getRawValue();
    this.errorMessage.set(null);
    this.saving.set(true);
    
    const items = v.items!.map(
      (r: any) => new CreateSaleDetailDto({
          productId: r.productId,
          quantity: r.quantity,
          salePrice: r.salePrice,
          discountType: r.discountType,
          discountValue: r.discountValue || 0,
          tax: r.tax || 0
        })
    );

    const dto = new CreateSaleDto({
      customerName: v.customerName?.trim() || undefined,
      saleDate: new Date(v.saleDate!) as any,
      discountType: v.discountType!,
      discountValue: v.discountValue || 0,
      tax: v.tax || 0,
      paidAmount: v.paidAmount || 0,
      paymentMethodId: v.paymentMethodId ?? undefined,
      remarks: v.remarks?.trim() || undefined,
      items
    });

    const request$ = this.isEditMode()
      ? this.client.salesPUT(this.saleId!, dto)
      : this.client.salesPOST(dto);

    request$.subscribe({
      next: (res) => {
        this.saving.set(false);
        
        if (this.isEditMode()) {
          this.notify.success('Sale updated successfully.');
          this.router.navigate(['/sales']);
        } else {
          this.notify.success(`Sale completed! Invoice: ${res.invoiceNo}`);
          this.resetTill();
        }
      },
      error: (err: any) => {
        this.saving.set(false);
        const msg = err.response ? JSON.parse(err.response).message : 'Could not complete sale.';
        this.errorMessage.set(msg);
        this.notify.danger(msg);
      }
    });
  }

  private resetTill(): void {
    this.items.clear();
    this.form.reset({
      customerName: '',
      saleDate: this.today(),
      discountType: 3,
      discountValue: 0,
      tax: 0,
      paidAmount: 0,
      remarks: ''
    });
    const pm = this.allPaymentMethods();
    if (pm.length > 0) {
      const cash = pm.find(m => m.name?.toLowerCase().includes('cash')) || pm[0];
      this.form.get('paymentMethodId')?.setValue(cash.id!);
    }
  }

  async cancel(): Promise<void> {
    if (this.form.dirty && this.items.length > 0) {
      const confirmed = await this.alert.confirm('Void Sale?', 'Are you sure you want to clear this sale?');
      if (!confirmed) return;
    }
    
    if (this.isEditMode()) {
      this.router.navigate(['/sales']);
    } else {
      this.resetTill();
    }
  }
}