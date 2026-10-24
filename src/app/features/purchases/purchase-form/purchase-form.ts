import { Component, ElementRef, HostListener, OnInit, inject, signal, computed } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, FormArray, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
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
  private host = inject<ElementRef<HTMLElement>>(ElementRef);
  private confirming = false; // true while the 'discard changes' dialog is open

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

  // ───────────────────────── Calculations (pure, no side effects) ─────────────────────────

  private num(control: { value: any } | null | undefined): number {
    return Number(control?.value) || 0;
  }

  private calcRowDiscount(row: FormGroup): number {
    const qty = this.num(row.get('quantity'));
    const price = this.num(row.get('purchasePrice'));
    const type = Number(row.get('discountType')?.value);
    const value = this.num(row.get('discountValue'));
    const base = qty * price;

    let discount = value;
    if (type === 1) discount = Math.round(base * (value / 100) * 100) / 100;
    else if (type === 2) discount = Math.round(value * qty * 100) / 100;

    return Math.min(discount, base); // a discount can never exceed the line amount
  }

  private calcRowTotal(row: FormGroup): number {
    const base = this.num(row.get('quantity')) * this.num(row.get('purchasePrice'));
    const total = base - this.calcRowDiscount(row) + this.num(row.get('tax'));
    return Math.max(0, total);
  }

  rowDiscountAmount(index: number): number {
    return this.calcRowDiscount(this.items.at(index));
  }

  rowTotal(index: number): number {
    return this.calcRowTotal(this.items.at(index));
  }

  // Number of rows that actually have a product selected
  get filledCount(): number {
    return this.items.controls.filter((r) => !!r.get('productId')?.value).length;
  }

  // Gross amount: sum of qty × price (before any discount or tax)
  get subTotal(): number {
    return this.items.controls.reduce(
      (sum, r) => sum + this.num(r.get('quantity')) * this.num(r.get('purchasePrice')),
      0
    );
  }

  // Sum of row totals (after row discount and row tax). Base for the overall discount.
  private get itemsNetTotal(): number {
    return this.items.controls.reduce((sum, r) => sum + this.calcRowTotal(r), 0);
  }

  get headerDiscountAmount(): number {
    const type = Number(this.form.get('discountType')?.value);
    const value = this.num(this.form.get('discountValue'));
    const net = this.itemsNetTotal;
    const totalQty = this.items.controls.reduce((sum, r) => sum + this.num(r.get('quantity')), 0);

    let discount = value;
    if (type === 1) discount = Math.round(net * (value / 100) * 100) / 100;
    else if (type === 2) discount = Math.round(value * totalQty * 100) / 100;

    return Math.min(discount, net);
  }

  // Row-level discounts + overall discount
  get totalDiscountAmount(): number {
    const rowDiscounts = this.items.controls.reduce((sum, r) => sum + this.calcRowDiscount(r), 0);
    return rowDiscounts + this.headerDiscountAmount;
  }

  // Row-level taxes + overall tax
  get totalTaxAmount(): number {
    const headerTax = this.num(this.form.get('tax'));
    const rowTaxes = this.items.controls.reduce((sum, r) => sum + this.num(r.get('tax')), 0);
    return headerTax + rowTaxes;
  }

  get grandTotal(): number {
    return Math.max(0, this.itemsNetTotal - this.headerDiscountAmount + this.num(this.form.get('tax')));
  }

  get dueAmount(): number {
    return this.grandTotal - this.num(this.form.get('paidAmount'));
  }

  // ───────────────────────── Dates ─────────────────────────

  // yyyy-MM-dd using LOCAL date parts (toISOString() would shift the day in timezones ahead of UTC)
  private toDateInput(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  private today(): string {
    return this.toDateInput(new Date());
  }

  // ───────────────────────── Lifecycle ─────────────────────────

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
            purchaseDate: purchase.purchaseDate ? this.toDateInput(new Date(purchase.purchaseDate)) : this.today(),
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
          this.ensureTrailingRow(); // keep one empty row at the end for adding more items
          this.form.markAsPristine();
          this.loading.set(false);
        },
        error: (err: any) => {
          const msg = this.extractErrorMessage(err, 'Could not load this purchase.');
          this.errorMessage.set(msg);
          this.notify.danger(msg);
          this.loading.set(false);
        }
      });
    } else {
      this.ensureTrailingRow(); // start with one empty row
      this.form.markAsPristine();
      this.loading.set(false);
    }
  }

  // ───────────────────────── Rows ─────────────────────────

  private buildRow(productId: number | null, quantity: number, purchasePrice: number, discountType: number, discountValue: number, tax: number, total: number): FormGroup {
    const group = this.fb.group({
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
      // Auto-add a new empty row when a product is picked in the last row
      if (this.items.at(this.items.length - 1) === group) {
        this.items.push(this.buildRow(null, 1, 0, 3, 0, 0, 0));
        this.form.markAsDirty();
      }
      // Keyboard flow: after choosing a product, jump straight to its Qty
      setTimeout(() => this.focusRowField(group, 'quantity'));
    });

    return group;
  }

  // Makes sure the last row is an empty one (does not mark the form dirty)
  private ensureTrailingRow(): void {
    const last = this.items.length ? this.items.at(this.items.length - 1) : null;
    if (!last || last.get('productId')?.value) {
      this.items.push(this.buildRow(null, 1, 0, 3, 0, 0, 0));
    }
  }

  // Removes rows with no product selected (always keeps at least one row)
  private removeEmptyRows(): void {
    for (let i = this.items.length - 1; i >= 0; i--) {
      if (!this.items.at(i).get('productId')?.value && this.items.length > 1) {
        this.items.removeAt(i);
      }
    }
  }

  // The empty row at the bottom is just a placeholder, it can't be deleted
  isPlaceholderRow(index: number): boolean {
    return index === this.items.length - 1 && !this.items.at(index).get('productId')?.value;
  }

  removeRow(index: number): void {
    if (this.isPlaceholderRow(index)) return;
    this.items.removeAt(index);
    this.ensureTrailingRow();
    this.form.markAsDirty();
  }

  productName(id: number | null): string {
    return this.allProducts().find((p) => p.id === id)?.name ?? '';
  }

  // ───────────────────────── Keyboard: Enter + shortcuts ─────────────────────────

  // Enter moves to the next field (like Tab) instead of submitting the form.
  // It is left alone in the remarks box, on buttons, and inside the product dropdown.
  onEnter(event: Event): void {
    const el = event.target as HTMLElement | null;
    if (!el) return;
    const tag = el.tagName;
    if (tag === 'TEXTAREA' || tag === 'BUTTON' || tag === 'A') return;

    event.preventDefault();
    if (el.closest('app-searchable-select')) return;

    const list = this.tabbables();
    const next = list[list.indexOf(el) + 1];
    this.focusEl(next);
  }

  /*
   * Shortcuts
   *   Ctrl+S  Save / Record purchase
   *   Alt+N   Go to the empty item row (add next item)
   *   Alt+D   Delete the row you are currently in
   *   Alt+S   Supplier
   *   Alt+P   Paid amount
   *   Alt+C   Cancel
   */
  @HostListener('document:keydown', ['$event'])
  onShortcut(e: KeyboardEvent): void {
    if (this.loading() || this.confirming) return;

    if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 's') {
      e.preventDefault(); // stop the browser's "Save page" dialog
      this.submit();
      return;
    }

    if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;

    switch (e.code) {
      case 'KeyN':
        e.preventDefault();
        this.focusRowProduct(this.items.length - 1);
        break;
      case 'KeyD': {
        e.preventDefault();
        const idx = this.activeRowIndex();
        if (idx >= 0 && !this.isPlaceholderRow(idx)) {
          this.removeRow(idx);
          this.focusRowProduct(idx);
        }
        break;
      }
      case 'KeyS':
        e.preventDefault();
        this.focusEl(this.host.nativeElement.querySelector<HTMLElement>('#supplierId'));
        break;
      case 'KeyP':
        e.preventDefault();
        this.focusEl(this.host.nativeElement.querySelector<HTMLElement>('#paidAmount'));
        break;
      case 'KeyC':
        e.preventDefault();
        this.cancel();
        break;
    }
  }

  // All fields that Tab / Enter can reach, in screen order
  private tabbables(): HTMLElement[] {
    const form = this.host.nativeElement.querySelector('form');
    if (!form) return [];
    return Array.from(form.querySelectorAll<HTMLElement>('input, select, textarea, button, [tabindex]')).filter(
      (el) => !(el as HTMLInputElement).disabled && el.tabIndex >= 0 && el.offsetParent !== null
    );
  }

  private focusEl(el: HTMLElement | null | undefined): void {
    if (!el) return;
    el.focus();
    if (el instanceof HTMLInputElement && el.type !== 'date') el.select();
  }

  private activeRowIndex(): number {
    const tr = (document.activeElement as HTMLElement | null)?.closest('tbody tr');
    const rows = Array.from(this.host.nativeElement.querySelectorAll('tbody tr'));
    return tr ? rows.indexOf(tr) : -1;
  }

  private focusRowProduct(index: number): void {
    setTimeout(() => {
      const rows = this.host.nativeElement.querySelectorAll('tbody tr');
      const row = rows[Math.max(0, Math.min(index, rows.length - 1))];
      const target = row?.querySelector<HTMLElement>(
        'app-searchable-select input, app-searchable-select button, app-searchable-select [tabindex]'
      );
      this.focusEl(target);
    });
  }

  private focusRowField(group: FormGroup, field: string): void {
    const idx = this.items.controls.indexOf(group);
    if (idx < 0) return;
    const row = this.host.nativeElement.querySelectorAll('tbody tr')[idx];
    this.focusEl(row?.querySelector<HTMLElement>(`[formControlName="${field}"]`));
  }

  // ───────────────────────── Submit / Cancel ─────────────────────────

  submit(): void {
    if (this.saving()) return;

    this.removeEmptyRows(); // ignore the empty trailing row

    if (this.form.invalid || this.items.length === 0) {
      this.form.markAllAsTouched();
      if (this.supplierIdControl.invalid) {
        this.notify.warning('Supplier is required.');
      } else if (this.items.controls.some((r) => !r.get('productId')?.value)) {
        this.notify.warning('Every item needs a product selected.');
      } else {
        this.notify.warning('Please check the highlighted fields.');
      }
      this.ensureTrailingRow();
      return;
    }

    const v = this.form.getRawValue();

    // Prevent submission if money is entered but no payment method is selected
    if (v.paidAmount! > 0 && !v.paymentMethodId) {
      this.notify.warning('Please select a Payment Method to record this payment.');
      this.ensureTrailingRow();
      return;
    }

    // Paid amount can't be more than the grand total
    if (v.paidAmount! - this.grandTotal > 0.005) {
      this.notify.warning('Paid amount cannot be greater than the Grand Total.');
      this.ensureTrailingRow();
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
          total: this.calcRowTotal(this.items.at(i))
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
      error: (err: any) => {
        this.saving.set(false);
        this.ensureTrailingRow(); // bring the empty row back so the user can keep editing
        const msg = this.extractErrorMessage(err, 'Could not save this purchase.');
        this.errorMessage.set(msg);
        this.notify.danger(msg);
      }
    });
  }

  async cancel(): Promise<void> {
    if (this.form.dirty) {
      this.confirming = true;
      const confirmed = await this.alert.confirm('Discard changes?', 'You have unsaved changes. Are you sure you want to leave without saving?');
      this.confirming = false;
      if (!confirmed) return;
    }
    this.router.navigate(['/purchases']);
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