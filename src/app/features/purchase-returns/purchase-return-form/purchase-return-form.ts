import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, FormArray, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { Client, CreatePurchaseReturnDto, CreatePurchaseReturnDetailDto, SupplierDto, PurchaseDto } from '../../../core/api/api-client';
import { NotificationService } from '../../../shared/notification/notification.service';
import { AlertService } from '../../../shared/alert/alert.service';
import { SearchableSelect, SearchableOption } from '../../../shared/searchable-select/searchable-select';
import { PageHeader } from '../../../shared/page-header/page-header';
import { DecimalPipe } from '@angular/common';

@Component({
  selector: 'app-purchase-return-form',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, SearchableSelect, PageHeader, DecimalPipe],
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

  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly isEditMode = signal(false);
  readonly existingReturnNo = signal<string | null>(null);
  private returnId: number | null = null;

  readonly allSuppliers = signal<SupplierDto[]>([]);
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

  // Max returnable for a row when a purchase is selected — the originally
  // purchased quantity for that product. The backend re-validates this
  // authoritatively (accounting for prior returns); this is a client-side
  // sanity ceiling, not the final word.
  maxQuantity(index: number): number | null {
    const purchase = this.selectedPurchase();
    if (!purchase) return null;
    const productId = this.items.at(index).get('productId')?.value;
    const line = purchase.items?.find((i) => i.productId === productId);
    return line ? line.quantity ?? null : null;
  }

  get subTotal(): number {
    return this.items.controls.reduce((sum, _, i) => sum + this.rowTotal(i), 0);
  }

  get grandTotal(): number {
    const discount = Number(this.form.get('discount')?.value) || 0;
    const tax = Number(this.form.get('tax')?.value) || 0;
    return Math.max(0, this.subTotal - discount + tax);
  }

  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }

  ngOnInit(): void {
    this.client.suppliersAll().subscribe({ next: (d) => this.allSuppliers.set(d) });

    const idParam = this.route.snapshot.paramMap.get('id');
    if (idParam) {
      this.returnId = Number(idParam);
      this.isEditMode.set(true);
      this.loading.set(true);

      this.client.purchaseReturnsGET(this.returnId).subscribe({
        next: (purchaseReturn) => {
          this.existingReturnNo.set(purchaseReturn.returnNo ?? null);
          this.form.patchValue({
            supplierId: purchaseReturn.supplierId,
            purchaseId: purchaseReturn.purchaseId ?? null,
            returnDate: purchaseReturn.returnDate ? new Date(purchaseReturn.returnDate).toISOString().slice(0, 10) : this.today(),
            discount: purchaseReturn.discount,
            tax: purchaseReturn.tax,
            remarks: purchaseReturn.remarks ?? ''
          });
          for (const item of purchaseReturn.items ?? []) {
            this.items.push(this.buildRow(item.productId!, item.quantity!, item.purchasePrice!, item.discount!, item.tax!, item.total!));
          }
          if (purchaseReturn.supplierId) {
            this.loadSupplierPurchases(purchaseReturn.supplierId, purchaseReturn.purchaseId ?? undefined);
          }
          this.form.markAsPristine();
          this.loading.set(false);
        },
        error: () => {
          this.errorMessage.set('Could not load this purchase return.');
          this.notify.danger('Could not load this purchase return.');
          this.loading.set(false);
        }
      });
    } else {
      this.addRow();
      this.loading.set(false);
    }

    this.supplierIdControl.valueChanges.subscribe((supplierId) => {
      this.form.get('purchaseId')?.setValue(null, { emitEvent: false });
      this.selectedPurchase.set(null);
      if (supplierId) {
        this.loadSupplierPurchases(supplierId);
      } else {
        this.supplierPurchases.set([]);
      }
    });

    this.form.get('purchaseId')?.valueChanges.subscribe((purchaseId) => {
      if (!purchaseId) {
        this.selectedPurchase.set(null);
        return;
      }
      this.client.purchaseItems(purchaseId).subscribe({
        next: (purchase) => this.selectedPurchase.set(purchase)
      });
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

  private buildRow(productId: number | null, quantity: number, purchasePrice: number, discount: number, tax: number, total: number): FormGroup {
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
    this.items.push(this.buildRow(null, 1, 0, 0, 0, 0));
    this.form.markAsDirty();
  }

  async removeRow(index: number): Promise<void> {
    if (this.items.length <= 1) {
      this.notify.warning('A purchase return must have at least one item.');
      return;
    }
    this.items.removeAt(index);
    this.form.markAsDirty();
  }

  // Called when a purchase-item row is picked from the "prefill from
  // purchase" list — fills quantity/price/discount/tax from the original line.
  fillRowFromPurchaseItem(index: number, productId: number): void {
    const purchase = this.selectedPurchase();
    const line = purchase?.items?.find((i) => i.productId === productId);
    if (!line) return;

    this.items.at(index).patchValue({
      productId: line.productId,
      quantity: line.quantity,
      purchasePrice: line.purchasePrice,
      discount: line.discount ?? 0,
      tax: line.tax ?? 0
    });
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
          total: this.rowTotal(i)
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
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        const message = typeof err.error === 'string' ? err.error : err.error?.message ?? 'Could not save this purchase return.';
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
    this.router.navigate(['/purchase-returns']);
  }
}