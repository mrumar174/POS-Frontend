import { Component, ElementRef, HostListener, OnInit, inject, signal, computed } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, FormArray, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { catchError, of, switchMap } from 'rxjs';
import { Client, CreatePurchaseReturnDto, CreatePurchaseReturnDetailDto, SupplierDto, PurchaseDto, ProductDto } from '../../../core/api/api-client';
import { NotificationService } from '../../../shared/notification/notification.service';
import { AlertService } from '../../../shared/alert/alert.service';
import { SearchableSelect, SearchableOption } from '../../../shared/searchable-select/searchable-select';
import { PageHeader } from '../../../shared/page-header/page-header';
import { DecimalPipe } from '@angular/common';

@Component({
  selector: 'app-purchase-return-form',
  standalone: true,
  imports: [ReactiveFormsModule, SearchableSelect, PageHeader, DecimalPipe],
  templateUrl: './purchase-return-form.html',
  styleUrl: './purchase-return-form.css'
})
export class PurchaseReturnForm implements OnInit {
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
  readonly existingReturnNo = signal<string | null>(null);
  private returnId: number | null = null;

  readonly allSuppliers = signal<SupplierDto[]>([]);
  readonly allProducts = signal<ProductDto[]>([]);
  readonly supplierPurchases = signal<PurchaseDto[]>([]);
  readonly selectedPurchase = signal<PurchaseDto | null>(null);
  readonly loadingPurchases = signal(false);

  readonly purchaseOptions = computed<SearchableOption[]>(() =>
    this.supplierPurchases().map((p) => ({
      id: p.id!,
      label: p.invoiceNo!,
      sublabel: `Total: ${(p.grandTotal ?? 0).toFixed(2)}`
    }))
  );

  // With an invoice selected: only that invoice's products. Without one: every product.
  readonly productOptions = computed<SearchableOption[]>(() => {
    const purchase = this.selectedPurchase();
    if (purchase) {
      return (purchase.items ?? []).map((i) => ({
        id: i.productId!,
        label: i.productName!,
        sublabel: `Purchased: ${i.quantity}`
      }));
    }
    return this.allProducts().map((p) => ({ id: p.id!, label: p.name!, sublabel: p.productCode }));
  });

  form = this.fb.group({
    supplierId: [null as number | null, Validators.required],
    purchaseId: [null as number | null],
    returnDate: [this.today(), Validators.required],
    discount: [0, [Validators.min(0)]],
    tax: [0, [Validators.min(0)]],
    remarks: [''],
    items: this.fb.array<FormGroup>([])
  });

  get supplierIdControl() { return this.form.controls.supplierId; }
  get items(): FormArray<FormGroup> { return this.form.get('items') as FormArray<FormGroup>; }

  get breadcrumbSegments(): string[] {
    return ['Purchasing', this.isEditMode() ? 'Edit Purchase Return' : 'New Purchase Return'];
  }

  // ───────────────────────── Calculations (pure, no side effects) ─────────────────────────

  private num(control: { value: any } | null | undefined): number {
    return Number(control?.value) || 0;
  }

  private calcRowDiscount(row: FormGroup): number {
    const base = this.num(row.get('quantity')) * this.num(row.get('purchasePrice'));
    return Math.min(this.num(row.get('discount')), base); // a discount can never exceed the line amount
  }

  private calcRowTotal(row: FormGroup): number {
    const base = this.num(row.get('quantity')) * this.num(row.get('purchasePrice'));
    return Math.max(0, base - this.calcRowDiscount(row) + this.num(row.get('tax')));
  }

  rowTotal(index: number): number {
    return this.calcRowTotal(this.items.at(index));
  }

  // Number of rows that actually have a product selected
  get filledCount(): number {
    return this.items.controls.filter((r) => !!r.get('productId')?.value).length;
  }

  // Max returnable for a row when an invoice is selected: the originally purchased quantity.
  // The backend re-validates this (including earlier returns); this is a client-side ceiling.
  maxQuantity(index: number): number | null {
    const purchase = this.selectedPurchase();
    if (!purchase) return null;
    const productId = this.items.at(index).get('productId')?.value;
    const line = purchase.items?.find((i) => i.productId === productId);
    return line ? line.quantity ?? null : null;
  }

  isOverMax(index: number): boolean {
    const max = this.maxQuantity(index);
    return max !== null && this.num(this.items.at(index).get('quantity')) > max;
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

  private get headerDiscountAmount(): number {
    return Math.min(this.num(this.form.get('discount')), this.itemsNetTotal);
  }

  // Row-level discounts + overall discount
  get totalDiscountAmount(): number {
    const rowDiscounts = this.items.controls.reduce((sum, r) => sum + this.calcRowDiscount(r), 0);
    return rowDiscounts + this.headerDiscountAmount;
  }

  // Row-level taxes + overall tax
  get totalTaxAmount(): number {
    const rowTaxes = this.items.controls.reduce((sum, r) => sum + this.num(r.get('tax')), 0);
    return rowTaxes + this.num(this.form.get('tax'));
  }

  get grandTotal(): number {
    return Math.max(0, this.itemsNetTotal - this.headerDiscountAmount + this.num(this.form.get('tax')));
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
    this.client.productsAll().subscribe({ next: (d) => this.allProducts.set(d) });

    const idParam = this.route.snapshot.paramMap.get('id');
    if (idParam) {
      this.returnId = Number(idParam);
      this.isEditMode.set(true);
      this.loading.set(true);

      this.client.purchaseReturnsGET(this.returnId).subscribe({
        next: (purchaseReturn) => {
          this.existingReturnNo.set(purchaseReturn.returnNo ?? null);
          // emitEvent:false so the supplier/invoice change handlers below don't fire while loading
          this.form.patchValue(
            {
              supplierId: purchaseReturn.supplierId,
              purchaseId: purchaseReturn.purchaseId ?? null,
              returnDate: purchaseReturn.returnDate ? this.toDateInput(new Date(purchaseReturn.returnDate)) : this.today(),
              discount: purchaseReturn.discount,
              tax: purchaseReturn.tax,
              remarks: purchaseReturn.remarks ?? ''
            },
            { emitEvent: false }
          );
          for (const item of purchaseReturn.items ?? []) {
            this.items.push(this.buildRow(item.productId!, item.quantity!, item.purchasePrice!, item.discount!, item.tax!, item.total!));
          }
          this.ensureTrailingRow(); // keep one empty row at the end for adding more items
          if (purchaseReturn.supplierId) {
            this.loadSupplierPurchases(purchaseReturn.supplierId, purchaseReturn.purchaseId ?? undefined);
          }
          this.form.markAsPristine();
          this.loading.set(false);
        },
        error: (err: any) => {
          const msg = this.extractErrorMessage(err, 'Could not load this purchase return.');
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

    // Supplier changed by the user: the old invoice no longer applies
    this.supplierIdControl.valueChanges.subscribe((supplierId) => {
      this.form.controls.purchaseId.setValue(null, { emitEvent: false });
      this.selectedPurchase.set(null);
      if (supplierId) {
        this.loadSupplierPurchases(supplierId);
      } else {
        this.supplierPurchases.set([]);
      }
    });

    // Invoice changed by the user: load its items (switchMap drops stale requests)
    this.form.controls.purchaseId.valueChanges
      .pipe(
        switchMap((purchaseId) => {
          if (!purchaseId) return of(null);
          return this.client.purchaseItems(purchaseId).pipe(
            catchError(() => {
              this.notify.danger('Could not load the items of this invoice.');
              return of(null);
            })
          );
        })
      )
      .subscribe((purchase) => {
        this.selectedPurchase.set(purchase);
        if (purchase) this.dropRowsNotOnInvoice(purchase);
      });
  }

  private loadSupplierPurchases(supplierId: number, selectAfterLoad?: number): void {
    this.loadingPurchases.set(true);
    this.client.purchasesBySupplier(supplierId).subscribe({
      next: (data) => {
        this.supplierPurchases.set(data);
        this.loadingPurchases.set(false);
        if (selectAfterLoad) {
          this.client.purchaseItems(selectAfterLoad).subscribe({ next: (p) => this.selectedPurchase.set(p) });
        }
      },
      error: () => {
        this.notify.danger('Could not load purchases for this supplier.');
        this.loadingPurchases.set(false);
      }
    });
  }

  // ───────────────────────── Rows ─────────────────────────

  private buildRow(productId: number | null, quantity: number, purchasePrice: number, discount: number, tax: number, total: number): FormGroup {
    const group = this.fb.group({
      productId: [productId, Validators.required],
      quantity: [quantity, [Validators.required, Validators.min(0.001)]],
      purchasePrice: [purchasePrice, [Validators.required, Validators.min(0)]],
      discount: [discount, [Validators.min(0)]],
      tax: [tax, [Validators.min(0)]],
      total: [total]
    });

    group.get('productId')?.valueChanges.subscribe((id: number | null) => {
      if (id === null) return;

      const line = this.selectedPurchase()?.items?.find((i) => i.productId === id);
      if (line) {
        // Invoice selected: fill the row from the original purchase line
        group.patchValue({
          quantity: line.quantity,
          purchasePrice: line.purchasePrice,
          discount: line.discount ?? 0,
          tax: line.tax ?? 0
        });
      } else {
        const product = this.allProducts().find((p) => p.id === id);
        if (product) group.get('purchasePrice')?.setValue(product.purchasePrice ?? 0);
      }

      // Auto-add a new empty row when a product is picked in the last row
      if (this.items.at(this.items.length - 1) === group) {
        this.items.push(this.buildRow(null, 1, 0, 0, 0, 0));
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
      this.items.push(this.buildRow(null, 1, 0, 0, 0, 0));
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

  // When a different invoice is chosen, rows whose product isn't on it are removed
  private dropRowsNotOnInvoice(purchase: PurchaseDto): void {
    const ids = new Set((purchase.items ?? []).map((i) => i.productId));
    let removed = 0;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const productId = this.items.at(i).get('productId')?.value;
      if (productId && !ids.has(productId)) {
        this.items.removeAt(i);
        removed++;
      }
    }
    if (removed > 0) {
      this.notify.warning(`${removed} item(s) removed because they are not on invoice ${purchase.invoiceNo}.`);
      this.form.markAsDirty();
    }
    this.ensureTrailingRow();
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

  private productLabel(id: number | null): string {
    const fromInvoice = this.selectedPurchase()?.items?.find((i) => i.productId === id)?.productName;
    return fromInvoice ?? this.allProducts().find((p) => p.id === id)?.name ?? 'This product';
  }

  // ───────────────────────── Keyboard: Enter + shortcuts ─────────────────────────

  // Enter moves to the next field (like Tab) instead of submitting the form.
  // It is left alone in the remarks box, on buttons, and inside the searchable dropdowns.
  onEnter(event: Event): void {
    const el = event.target as HTMLElement | null;
    if (!el) return;
    const tag = el.tagName;
    if (tag === 'TEXTAREA' || tag === 'BUTTON' || tag === 'A') return;

    event.preventDefault();
    if (el.closest('app-searchable-select')) return;

    const list = this.tabbables();
    this.focusEl(list[list.indexOf(el) + 1]);
  }

  /*
   * Shortcuts
   *   Ctrl+S  Save / Record return
   *   Alt+N   Go to the empty item row (add next item)
   *   Alt+D   Delete the row you are currently in
   *   Alt+S   Supplier
   *   Alt+I   Original invoice
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
      case 'KeyI':
        e.preventDefault();
        this.focusEl(
          this.host.nativeElement.querySelector<HTMLElement>(
            '.invoice-field app-searchable-select input, .invoice-field app-searchable-select button, .invoice-field app-searchable-select [tabindex]'
          )
        );
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

  // Returns an error message if the rows break the invoice's limits, otherwise null
  private invoiceLimitError(): string | null {
    const purchase = this.selectedPurchase();
    if (!purchase) return null;

    const returned = new Map<number, number>();
    for (const r of this.items.controls) {
      const id = r.get('productId')?.value as number;
      returned.set(id, (returned.get(id) ?? 0) + this.num(r.get('quantity')));
    }

    for (const [id, qty] of returned) {
      const line = purchase.items?.find((i) => i.productId === id);
      if (!line) return `${this.productLabel(id)} is not on invoice ${purchase.invoiceNo}.`;
      if (qty > (line.quantity ?? 0)) {
        return `${this.productLabel(id)}: return quantity (${qty}) cannot exceed the purchased quantity (${line.quantity}).`;
      }
    }
    return null;
  }

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

    const limitError = this.invoiceLimitError();
    if (limitError) {
      this.notify.warning(limitError);
      this.ensureTrailingRow();
      return;
    }

    this.errorMessage.set(null);
    this.saving.set(true);
    const v = this.form.getRawValue();

    const items = v.items!.map(
      (r: any, i: number) =>
        new CreatePurchaseReturnDetailDto({
          productId: r.productId,
          quantity: r.quantity,
          purchasePrice: r.purchasePrice,
          discount: r.discount || 0,
          tax: r.tax || 0,
          total: this.calcRowTotal(this.items.at(i))
        })
    );

    const dto = new CreatePurchaseReturnDto({
      supplierId: v.supplierId!,
      purchaseId: v.purchaseId ?? undefined,
      returnDate: new Date(v.returnDate!) as any,
      discount: v.discount || 0,
      tax: v.tax || 0,
      remarks: v.remarks?.trim() || undefined,
      items
    });

    const request$ = this.isEditMode()
      ? this.client.purchaseReturnsPUT(this.returnId!, dto)
      : this.client.purchaseReturnsPOST(dto);

    request$.subscribe({
      next: () => {
        this.saving.set(false);
        this.form.markAsPristine();
        this.notify.success(this.isEditMode() ? 'Purchase return updated successfully.' : 'Purchase return recorded successfully.');
        this.router.navigate(['/purchase-returns']);
      },
      error: (err: any) => {
        this.saving.set(false);
        this.ensureTrailingRow(); // bring the empty row back so the user can keep editing
        const msg = this.extractErrorMessage(err, 'Could not save this purchase return.');
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
    this.router.navigate(['/purchase-returns']);
  }

  // Works with both the generated API client's exceptions and Angular's HttpErrorResponse
  private extractErrorMessage(err: any, defaultMessage: string): string {
    if (err?.response) {
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

    if (err?.error) {
      if (typeof err.error === 'string') return err.error;
      if (err.error.message) return err.error.message;
      if (err.error.detail) return err.error.detail;
      if (err.error.title) return err.error.title;
    }

    return err?.message || defaultMessage;
  }
}