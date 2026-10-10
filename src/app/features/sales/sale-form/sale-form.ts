import { Component, OnInit, AfterViewInit, DestroyRef, ElementRef, HostListener, ViewChild, inject, signal, computed } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule, FormBuilder, FormArray, FormGroup, Validators, FormControl } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Client, CreateSaleDto, CreateSaleDetailDto, ProductDto, PaymentMethodDto, CompanySettingsDto } from '../../../core/api/api-client';
import { NotificationService } from '../../../shared/notification/notification.service';
import { SearchableSelect, SearchableOption } from '../../../shared/searchable-select/searchable-select';
import { AlertService } from '../../../shared/alert/alert.service';
import { PageHeader } from '../../../shared/page-header/page-header';
import { ReceiptPrintService } from '../../../shared/receipt-print/receipt-print.service';
import { DecimalPipe } from '@angular/common';

/**
 * KEYBOARD SHORTCUTS
 * ------------------------------------------------------------
 *  F2            Focus product search / barcode
 *  F3            Customer name
 *  F4            Overall discount
 *  F6            Payment method
 *  F7            Paid amount
 *  F8            Exact amount (paid = grand total)
 *  F9            Save & Print   (also Ctrl+Enter)
 *  Ctrl+S        Save only (no print)
 *  F10           Void / clear sale
 *  Ctrl+Delete   Remove the cart row you are currently in
 *  Enter         In a cart row -> back to search | in Paid -> Save & Print
 *
 * TAB ORDER
 * Search -> cart rows (Qty, Price, Disc type, Disc, Tax) -> Customer -> Date -> Remarks
 * -> Overall discount type -> Overall discount -> Overall tax -> Payment method
 * -> Paid amount -> Save & Print -> Save -> Void
 */
@Component({
  selector: 'app-sale-form',
  standalone: true,
  imports: [ReactiveFormsModule, DecimalPipe, SearchableSelect, PageHeader],
  templateUrl: './sale-form.html',
  styleUrl: './sale-form.css'
})
export class SaleForm implements OnInit, AfterViewInit {
  private fb = inject(FormBuilder);
  private client = inject(Client);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private notify = inject(NotificationService);
  private alert = inject(AlertService);
  private destroyRef = inject(DestroyRef);
  private receipt = inject(ReceiptPrintService);
  readonly productStocks = signal<{ [key: number]: number }>({});
  @ViewChild('searchHost', { read: ElementRef }) searchHost?: ElementRef<HTMLElement>;
  @ViewChild('customerInput') customerInput?: ElementRef<HTMLInputElement>;
  @ViewChild('discountValueInput') discountValueInput?: ElementRef<HTMLInputElement>;
  @ViewChild('paymentSelect') paymentSelect?: ElementRef<HTMLSelectElement>;
  @ViewChild('paidInput') paidInput?: ElementRef<HTMLInputElement>;

  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly isEditMode = signal(false);
  readonly existingInvoiceNo = signal<string | null>(null);
  private saleId: number | null = null;
  private confirming = false;
  private company: CompanySettingsDto | null = null;

  readonly allProducts = signal<ProductDto[]>([]);
  readonly allPaymentMethods = signal<PaymentMethodDto[]>([]);
  readonly lastAddedId = signal<number | null>(null);

  readonly discountTypes = [
    { value: 1, label: '%' },
    { value: 2, label: '/pc' },
    { value: 3, label: 'Flat' }
  ];

  /** Shown in the legend bar under the cart. */
  readonly shortcuts = [
    { key: 'F2', label: 'Search' },
    { key: 'F3', label: 'Customer' },
    { key: 'F4', label: 'Discount' },
    { key: 'F6', label: 'Payment' },
    { key: 'F7', label: 'Paid' },
    { key: 'F8', label: 'Exact amount' },
    { key: 'F9', label: 'Save & Print' },
    { key: 'Ctrl+S', label: 'Save only' },
    { key: 'F10', label: 'Void' },
    { key: 'Ctrl+Del', label: 'Remove row' },
    { key: 'Enter', label: 'Back to search' }
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

  // ---------- Calculations (unchanged logic) ----------

  rowTotal(index: number): number {
    const row = this.items.at(index);
    const qty = Number(row.get('quantity')?.value) || 0;
    const price = Number(row.get('salePrice')?.value) || 0;
    const tax = Number(row.get('tax')?.value) || 0;
    const discount = this.rowDiscountAmount(index);
    const total = Math.max(0, (qty * price) - discount + tax);

    row.get('total')?.setValue(total, { emitEvent: false });
    return total;
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

  get totalQty(): number {
    return this.items.controls.reduce((sum, r) => sum + (Number(r.get('quantity')?.value) || 0), 0);
  }

  get subTotal(): number {
    return this.items.controls.reduce((sum, _, i) => sum + this.rowTotal(i), 0);
  }

  get headerDiscountAmount(): number {
    const type = Number(this.form.get('discountType')?.value);
    const value = Number(this.form.get('discountValue')?.value) || 0;

    if (type === 1) return Math.round(this.subTotal * (value / 100) * 100) / 100;
    if (type === 2) return Math.round(value * this.totalQty * 100) / 100;
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

  // ---------- Lifecycle ----------

ngOnInit(): void {
  this.client.productsAll().subscribe({ next: (d) => this.allProducts.set(d) });
  
  // Fetch stock dictionary from backend
  this.client.dictionary().subscribe({ 
    next: (stocks) => this.productStocks.set(stocks) 
  });

  this.client.paymentMethodsAll().subscribe({ next: (d) => {
    this.allPaymentMethods.set(d);
    if (!this.isEditMode() && d.length > 0) {
      this.form.get('paymentMethodId')?.setValue(this.defaultPaymentMethod(d).id!);
    }
  }});

  this.client.companySettingsGET().subscribe({ next: (c) => this.company = c });

  this.productSearchControl.valueChanges
    .pipe(takeUntilDestroyed(this.destroyRef))
    .subscribe(id => { if (id) this.onProductSelected(id); });

  this.form.valueChanges
    .pipe(takeUntilDestroyed(this.destroyRef))
    .subscribe(() => {
      if (this.isEditMode()) return;
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
          // Look up stock from our dictionary when loading existing sale items
          const stock = this.productStocks()[item.productId!] ?? 0;
          this.items.push(this.buildRow(item.productId!, item.productName!, item.quantity!, item.salePrice!, item.discountType!, item.discountValue!, item.tax!, item.total!, stock));
        }
        this.form.markAsPristine();
        this.loading.set(false);
        this.focusSearch(250);
      },
      error: () => {
        this.errorMessage.set('Could not load this sale.');
        this.notify.danger('Could not load this sale.');
        this.loading.set(false);
      }
    });
  }
}

  ngAfterViewInit(): void {
    // Cashier can start scanning immediately.
    this.focusSearch(300);
  }

  // ---------- Keyboard handling ----------

  @HostListener('document:keydown', ['$event'])
  onGlobalKey(e: KeyboardEvent): void {
    if (this.loading()) return;
    const ctrl = e.ctrlKey || e.metaKey;

    // Ctrl+S -> save only (no print). preventDefault stops the browser's "Save page" dialog.
    if (ctrl && (e.key === 's' || e.key === 'S')) {
      e.preventDefault();
      this.submit(false);
      return;
    }

    // Ctrl+Enter -> save & print
    if (ctrl && e.key === 'Enter') {
      e.preventDefault();
      this.submit(true);
      return;
    }

    if (ctrl && e.key === 'Delete') {
      const tr = (e.target as HTMLElement | null)?.closest('tr[data-row]');
      if (tr) {
        e.preventDefault();
        this.removeRow(Number(tr.getAttribute('data-row')));
        this.focusSearch();
      }
      return;
    }

    if (ctrl || e.altKey || e.shiftKey) return;

    switch (e.key) {
      case 'F2': e.preventDefault(); this.focusSearch(); break;
      case 'F3': e.preventDefault(); this.focusEl(this.customerInput); break;
      case 'F4': e.preventDefault(); this.focusEl(this.discountValueInput); break;
      case 'F6': e.preventDefault(); this.focusEl(this.paymentSelect); break;
      case 'F7': e.preventDefault(); this.focusEl(this.paidInput); break;
      case 'F8': e.preventDefault(); this.exactAmount(); break;
      case 'F9': e.preventDefault(); this.submit(true); break;
      case 'F10': e.preventDefault(); this.cancel(); break;
    }
  }

  /** Enter key inside the form: never submits by accident, jumps where the cashier expects. */
  onFormEnter(e: Event): void {
    const t = e.target as HTMLElement;
    if (t.closest('app-searchable-select') || t.tagName === 'TEXTAREA' || t.tagName === 'BUTTON') return;

    e.preventDefault();
    switch (t.getAttribute('data-enter')) {
      case 'search': this.focusSearch(); break;
      case 'paid':   this.focusEl(this.paidInput); break;
      case 'pay':    this.submit(true); break;   // use false here if Enter should save without printing
    }
  }

  selectAll(e: Event): void {
    (e.target as HTMLInputElement).select?.();
  }

  private focusEl(ref?: ElementRef<HTMLElement>): void {
    const el = ref?.nativeElement as HTMLInputElement | undefined;
    if (!el) return;
    el.focus();
    el.select?.();
  }

  focusSearch(delay = 0): void {
    const run = () => {
      const host = this.searchHost?.nativeElement;
      if (!host) return;
      const input = host.querySelector('input') as HTMLInputElement | null;
      if (input) {
        input.focus();
        input.select?.();
      } else {
        (host.querySelector('[tabindex], button, .ng-select-container') as HTMLElement | null)?.click();
      }
    };
    delay ? setTimeout(run, delay) : setTimeout(run, 0);
  }

  // ---------- Cart actions ----------

onProductSelected(productId: number): void {
  const existingRowIdx = this.items.controls.findIndex(c => c.get('productId')?.value === productId);

  if (existingRowIdx >= 0) {
    const row = this.items.at(existingRowIdx);
    const currentQty = Number(row.get('quantity')?.value) || 0;
    row.get('quantity')?.setValue(currentQty + 1);
  } else {
    const product = this.allProducts().find(p => p.id === productId);
    if (product) {
      const stock = this.productStocks()[productId] ?? 0;
      this.items.push(this.buildRow(product.id!, product.name!, 1, product.salePrice ?? 0, 3, 0, 0, product.salePrice ?? 0, stock));
    }
  }

  this.form.markAsDirty();
  this.flashRow(productId);
  setTimeout(() => this.productSearchControl.setValue(null, { emitEvent: false }), 0);
  this.focusSearch(30);
}

  private flashRow(productId: number): void {
    this.lastAddedId.set(null);
    setTimeout(() => this.lastAddedId.set(productId), 0);
    setTimeout(() => { if (this.lastAddedId() === productId) this.lastAddedId.set(null); }, 1100);
  }

  changeQty(index: number, delta: number): void {
    const ctrl = this.items.at(index).get('quantity');
    const next = (Number(ctrl?.value) || 0) + delta;
    if (next <= 0) return;
    ctrl?.setValue(Math.round(next * 1000) / 1000);
    this.form.markAsDirty();
  }

  private buildRow(productId: number, productName: string, quantity: number, salePrice: number, discountType: number, discountValue: number, tax: number, total: number, availableStock: number = 0): FormGroup {
  return this.fb.group({
    productId: [productId],
    productName: [{ value: productName, disabled: true }],
    availableStock: [{ value: availableStock, disabled: true }],
    quantity: [quantity, [Validators.required, Validators.min(0.001)]],
    salePrice: [salePrice, [Validators.required, Validators.min(0)]],
    discountType: [discountType, Validators.required],
    discountValue: [discountValue, [Validators.min(0)]],
    tax: [tax, [Validators.min(0)]],
    total: [{ value: total, disabled: true }]
  });
}

  removeRow(index: number): void {
    if (index < 0 || index >= this.items.length) return;
    this.items.removeAt(index);
    this.form.markAsDirty();
  }

  exactAmount(): void {
    const ctrl = this.form.get('paidAmount');
    ctrl?.setValue(this.grandTotal);
    ctrl?.markAsPristine(); // keep auto-follow active
  }

  private defaultPaymentMethod(list: PaymentMethodDto[]): PaymentMethodDto {
    return list.find(m => m.name?.toLowerCase().includes('cash')) || list[0];
  }

  // ---------- Submit / reset ----------

  /**
   * @param print true  -> save, then print the receipt automatically (F9 / Ctrl+Enter)
   *              false -> save only (Ctrl+S)
   */
  submit(print = true): void {
    if (this.saving()) return;

    if (this.form.invalid || this.items.length === 0) {
      this.form.markAllAsTouched();
      if (this.items.length === 0) {
        this.notify.warning('Cart is empty.');
        this.focusSearch();
      } else {
        this.notify.warning('Please complete all required fields.');
      }
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

        if (print) this.receipt.print(res, this.company);

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
        let msg = 'Could not complete sale.';
        try { if (err.response) msg = JSON.parse(err.response).message || msg; } catch { /* keep default */ }
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
      this.form.get('paymentMethodId')?.setValue(this.defaultPaymentMethod(pm).id!);
    }
    this.errorMessage.set(null);
    this.focusSearch(50);
  }

  async cancel(): Promise<void> {
    if (this.confirming || this.saving()) return;

    if (this.form.dirty && this.items.length > 0) {
      this.confirming = true;
      const confirmed = await this.alert.confirm('Void Sale?', 'Are you sure you want to clear this sale?');
      this.confirming = false;
      if (!confirmed) { this.focusSearch(50); return; }
    }

    if (this.isEditMode()) {
      this.router.navigate(['/sales']);
    } else {
      this.resetTill();
    }
  }
  getProductStock(productId: number): number {
    const product = this.allProducts().find(p => p.id === productId);
    // Replace 'stockQty' with the exact property name generated in your ProductDto, 
    // e.g., product?.currentStock, product?.stock, etc.
    return (product as any)?.stockQty ?? (product as any)?.currentStock ?? 0;
  }
}