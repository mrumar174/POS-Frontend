import { Component, OnInit, AfterViewInit, DestroyRef, ElementRef, HostListener, ViewChild, inject, signal, computed } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule, FormBuilder, FormArray, FormGroup, Validators, FormControl } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { startWith } from 'rxjs';
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
 *  F6            Next payment method
 *  F7            Paid amount
 *  F8            Exact amount (paid = grand total)
 *  F9            Save & Print   (also Ctrl+Enter)
 *  Ctrl+S        Save only (no print)
 *  F10           Void / clear sale
 *  Ctrl+Delete   Remove the cart row you are currently in
 *  Enter         In a cart row -> back to search | in Paid -> Save & Print
 */

interface Totals {
  lines: number[];
  itemCount: number;
  totalQty: number;
  subTotal: number;
  headerDiscount: number;
  totalDiscount: number;
  totalTax: number;
  grandTotal: number;
  paid: number;
  change: number;
  due: number;
}

const num = (v: unknown): number => Number(v) || 0;
const r2 = (n: number): number => Math.round(n * 100) / 100;
const EPS = 0.005;

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

  @ViewChild('searchHost', { read: ElementRef }) searchHost?: ElementRef<HTMLElement>;
  @ViewChild('customerInput') customerInput?: ElementRef<HTMLInputElement>;
  @ViewChild('discountValueInput') discountValueInput?: ElementRef<HTMLInputElement>;
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

  /** productId -> stock on hand (from the backend). */
  readonly productStocks = signal<{ [key: number]: number }>({});
  readonly stocksLoaded = signal(false);
  /** Edit mode: quantities already sold on this invoice (they are available to re-sell). */
  private originalQty = new Map<number, number>();

  /** Last completed sale, kept so the cashier can reprint it. */
  readonly lastSale = signal<any | null>(null);

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

  private readonly productById = computed(() =>
    new Map<number, ProductDto>(this.allProducts().map((p) => [p.id!, p] as [number, ProductDto]))
  );

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

  // ---------- Calculations (same maths as before, computed once per change) ----------

  /** Snapshot of the form; every total below derives from it, so nothing recomputes on each change-detection pass. */
  private readonly snap = signal<any>(null);

  readonly totals = computed<Totals>(() => this.computeTotals(this.snap()));

  /** Cart rows whose quantity is higher than available stock. */
  readonly overStockCount = computed(() => {
    const rows: any[] = this.snap()?.items ?? [];
    return rows.filter((r) => this.isOverQty(r.productId, r.quantity)).length;
  });

  /** One-tap cash amounts above the grand total (rounded up to 100 / 500 / 1000 / 5000). */
  readonly quickCash = computed(() => {
    const g = this.totals().grandTotal;
    if (g <= 0) return [];
    const out: number[] = [];
    for (const step of [100, 500, 1000, 5000]) {
      const v = Math.ceil(g / step) * step;
      if (v > g + EPS && !out.includes(v)) out.push(v);
    }
    return out;
  });

  private computeTotals(v: any): Totals {
    const rows: any[] = v?.items ?? [];
    let totalQty = 0;
    let rowDiscounts = 0;
    let rowTaxes = 0;

    const lines = rows.map((r) => {
      const qty = num(r.quantity);
      const price = num(r.salePrice);
      const tax = num(r.tax);
      const dv = num(r.discountValue);
      const type = Number(r.discountType);
      const base = qty * price;

      let discount = dv;
      if (type === 1) discount = r2(base * (dv / 100));
      else if (type === 2) discount = r2(dv * qty);

      totalQty += qty;
      rowDiscounts += discount;
      rowTaxes += tax;
      return Math.max(0, base - discount + tax);
    });

    const subTotal = lines.reduce((a, b) => a + b, 0);

    const hType = Number(v?.discountType);
    const hValue = num(v?.discountValue);
    const hTax = num(v?.tax);
    let headerDiscount = hValue;
    if (hType === 1) headerDiscount = r2(subTotal * (hValue / 100));
    else if (hType === 2) headerDiscount = r2(hValue * totalQty);

    const grandTotal = Math.max(0, subTotal - headerDiscount + hTax);
    const paid = num(v?.paidAmount);

    return {
      lines,
      itemCount: rows.length,
      totalQty: Math.round(totalQty * 1000) / 1000,
      subTotal,
      headerDiscount,
      totalDiscount: rowDiscounts + headerDiscount,
      totalTax: rowTaxes + hTax,
      grandTotal,
      paid,
      change: paid > grandTotal + EPS ? r2(paid - grandTotal) : 0,
      due: grandTotal > paid + EPS ? r2(grandTotal - paid) : 0
    };
  }

  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }

  // ---------- Stock helpers (used by the cart) ----------

  /** Available stock for a product, or null while stock is still loading. */
  availableFor(productId: number): number | null {
    if (!this.stocksLoaded()) return null;
    return (this.productStocks()[productId] ?? 0) + (this.originalQty.get(productId) ?? 0);
  }

  private isOverQty(productId: number, qty: unknown): boolean {
    const a = this.availableFor(productId);
    return a !== null && num(qty) > a;
  }

  isOver(row: FormGroup): boolean {
    return this.isOverQty(row.get('productId')?.value, row.get('quantity')?.value);
  }

  stockLabel(row: FormGroup): string {
    const a = this.availableFor(row.get('productId')?.value);
    return a === null ? '–' : String(Math.round(a * 1000) / 1000);
  }

  stockClass(row: FormGroup): string {
    const a = this.availableFor(row.get('productId')?.value);
    if (a === null) return 'muted';
    if (this.isOver(row)) return 'over';
    return a <= 5 ? 'low' : '';
  }

  productCode(productId: number): string {
    return this.productById().get(productId)?.productCode ?? '';
  }

  // ---------- Lifecycle ----------

  ngOnInit(): void {
    this.client.productsAll().subscribe({ next: (d) => this.allProducts.set(d) });

    this.client.dictionary().subscribe({
      next: (stocks) => { this.productStocks.set(stocks); this.stocksLoaded.set(true); }
    });

    this.client.paymentMethodsAll().subscribe({ next: (d) => {
      this.allPaymentMethods.set(d);
      if (!this.isEditMode() && d.length > 0 && this.form.get('paymentMethodId')?.value == null) {
        this.form.get('paymentMethodId')?.setValue(this.defaultPaymentMethod(d).id!);
      }
    }});

    this.client.companySettingsGET().subscribe({ next: (c) => this.company = c });

    this.productSearchControl.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(id => { if (id) this.onProductSelected(id); });

    // Single source of truth for all totals + "paid follows grand total" behaviour.
    this.form.valueChanges
      .pipe(startWith(null), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.snap.set(this.form.getRawValue());
        if (!this.isEditMode() && !this.form.get('paidAmount')?.dirty) {
          this.form.get('paidAmount')?.setValue(this.totals().grandTotal, { emitEvent: false });
          this.snap.set(this.form.getRawValue());
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
            this.originalQty.set(item.productId!, (this.originalQty.get(item.productId!) ?? 0) + (item.quantity ?? 0));
            this.items.push(this.buildRow(item.productId!, item.productName!, item.quantity!, item.salePrice!, item.discountType!, item.discountValue!, item.tax!));
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
    if (this.loading() || this.confirming) return;
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
      case 'F6': e.preventDefault(); this.cyclePayment(); break;
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
    setTimeout(run, delay);
  }

  // ---------- Cart actions ----------

  onProductSelected(productId: number): void {
    const existingRowIdx = this.items.controls.findIndex(
      c => c.get('productId')?.value === productId
    );

    if (existingRowIdx >= 0) {
      const row = this.items.at(existingRowIdx);
      const currentQty = Number(row.get('quantity')?.value) || 0;
      row.get('quantity')?.setValue(currentQty + 1);
    } else {
      const product = this.productById().get(productId);

      if (product) {
        this.items.push(
          this.buildRow(
            product.id!,
            product.name!,
            1,
            product.salePrice ?? 0,
            3,
            0,
            0
          )
        );
      }
    }

    this.form.markAsDirty();
    this.flashRow(productId);

    // Clear the selected product without emitting another selection event.
    this.productSearchControl.setValue(null, { emitEvent: false });

    // Keep focus in the search input without automatically opening the dropdown.
    setTimeout(() => {
      const host = this.searchHost?.nativeElement;
      const input = host?.querySelector('input') as HTMLInputElement | null;

      if (input) {
        input.focus();
      }
    }, 30);
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

  private buildRow(productId: number, productName: string, quantity: number, salePrice: number, discountType: number, discountValue: number, tax: number): FormGroup {
    return this.fb.group({
      productId: [productId],
      productName: [{ value: productName, disabled: true }],
      quantity: [quantity, [Validators.required, Validators.min(0.001)]],
      salePrice: [salePrice, [Validators.required, Validators.min(0)]],
      discountType: [discountType, Validators.required],
      discountValue: [discountValue, [Validators.min(0)]],
      tax: [tax, [Validators.min(0)]]
    });
  }

  removeRow(index: number): void {
    if (index < 0 || index >= this.items.length) return;
    this.items.removeAt(index);
    this.form.markAsDirty();
  }

  // ---------- Payment ----------

  selectPayment(id: number): void {
    const ctrl = this.form.get('paymentMethodId');
    ctrl?.setValue(id);
    ctrl?.markAsTouched();
  }

  /** F6: jump to the next payment method. */
  cyclePayment(): void {
    const list = this.allPaymentMethods();
    if (!list.length) return;
    const cur = this.form.get('paymentMethodId')?.value;
    const idx = list.findIndex(m => m.id === cur);
    this.selectPayment(list[(idx + 1) % list.length].id!);
  }

  /** Quick-cash chips: customer hands over a round amount. */
  setPaid(amount: number): void {
    const ctrl = this.form.get('paidAmount');
    ctrl?.setValue(amount);
    ctrl?.markAsDirty();
  }

  exactAmount(): void {
    const ctrl = this.form.get('paidAmount');
    ctrl?.setValue(this.totals().grandTotal);
    ctrl?.markAsPristine(); // keep auto-follow active
  }

  private defaultPaymentMethod(list: PaymentMethodDto[]): PaymentMethodDto {
    return list.find(m => m.name?.toLowerCase().includes('cash')) || list[0];
  }

  // ---------- Submit / print / reset ----------

  /**
   * @param print true  -> save, then print the receipt automatically (Save & Print / F9 / Ctrl+Enter)
   *              false -> save only (Ctrl+S)
   */
  async submit(print = true): Promise<void> {
    if (this.saving() || this.confirming) return;

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

    // Safety net: an unpaid balance on a walk-in sale is usually a mistake.
    const t = this.totals();
    if (t.due > EPS && !this.form.get('customerName')?.value?.trim()) {
      this.confirming = true;
      const ok = await this.alert.confirm('Unpaid balance', `Due ${t.due.toFixed(2)} will be left on a sale with no customer name. Save anyway?`);
      this.confirming = false;
      if (!ok) { this.focusEl(this.customerInput); return; }
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

        // Print FIRST, before the form is reset / page navigates away.
        if (print) this.printReceipt(res);

        if (this.isEditMode()) {
          this.notify.success('Sale updated successfully.');
          this.router.navigate(['/sales']);
        } else {
          this.lastSale.set(res);
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

  private printReceipt(sale: any): void {
    try {
      this.receipt.print(sale, this.company);
    } catch {
      this.notify.warning('Sale saved, but the receipt could not be printed. Use Reprint.');
    }
  }

  /** Reprint button — runs inside a click, so browsers never block it as a pop-up. */
  reprint(): void {
    const sale = this.lastSale();
    if (sale) this.printReceipt(sale);
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
    this.refreshStock();
  }

  /** Stock changed after a sale — reload so the badges stay accurate. */
  private refreshStock(): void {
    this.client.dictionary().subscribe({ next: (s) => this.productStocks.set(s) });
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
}