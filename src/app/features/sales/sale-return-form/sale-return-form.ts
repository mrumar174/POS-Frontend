import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, FormArray, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Client, CreateSaleReturnDto, CreateSaleReturnDetailDto, ProductDto, SaleDto } from '../../../core/api/api-client';
import { NotificationService } from '../../../shared/notification/notification.service';
import { SearchableSelect, SearchableOption } from '../../../shared/searchable-select/searchable-select';
import { AlertService } from '../../../shared/alert/alert.service';
import { PageHeader } from '../../../shared/page-header/page-header';
import { DecimalPipe } from '@angular/common';

@Component({
  selector: 'app-sale-return-form',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, DecimalPipe, SearchableSelect, PageHeader],
  templateUrl: './sale-return-form.html',
  styleUrl: './sale-return-form.css'
})
export class SaleReturnForm implements OnInit {
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

  readonly allSales = signal<SaleDto[]>([]);
  readonly allProducts = signal<ProductDto[]>([]);

  readonly saleOptions = computed<SearchableOption[]>(() =>
    this.allSales().map((s) => ({ id: s.id!, label: s.invoiceNo!, sublabel: `${s.customerName || 'Walk-in'} - ${new Date(s.saleDate!).toLocaleDateString()}` }))
  );
  readonly productOptions = computed<SearchableOption[]>(() =>
    this.allProducts().map((p) => ({ id: p.id!, label: p.name!, sublabel: p.productCode }))
  );

  form = this.fb.group({
    saleId: [null as number | null],
    returnDate: [this.today(), Validators.required],
    discount: [0, [Validators.min(0)]],
    tax: [0, [Validators.min(0)]],
    remarks: [''],
    items: this.fb.array<FormGroup>([])
  });

  get items(): FormArray<FormGroup> { return this.form.get('items') as FormArray<FormGroup>; }
  get breadcrumbSegments(): string[] { return ['Sales', this.isEditMode() ? 'Edit Sale Return' : 'New Sale Return']; }

  rowTotal(index: number): number {
    const row = this.items.at(index);
    const qty = Number(row.get('quantity')?.value) || 0;
    const price = Number(row.get('salePrice')?.value) || 0;
    const disc = Number(row.get('discount')?.value) || 0;
    const tax = Number(row.get('tax')?.value) || 0;
    const total = (qty * price) - disc + tax;
    row.get('total')?.setValue(Math.max(0, total), { emitEvent: false });
    return Math.max(0, total);
  }

  get subTotal(): number { return this.items.controls.reduce((sum, _, i) => sum + this.rowTotal(i), 0); }
  get grandTotal(): number {
    const d = Number(this.form.get('discount')?.value) || 0;
    const t = Number(this.form.get('tax')?.value) || 0;
    return Math.max(0, this.subTotal - d + t);
  }

  private today(): string { return new Date().toISOString().slice(0, 10); }

  ngOnInit(): void {
    this.client.productsAll().subscribe({ next: (d) => this.allProducts.set(d) });
    this.client.salesAll().subscribe({ next: (s) => this.allSales.set(s) });

    // Listen for Sale Invoice Selection
    this.form.get('saleId')?.valueChanges.subscribe(saleId => {
      if (saleId && !this.isEditMode()) {
        this.populateFromSale(saleId);
      }
    });

    const idParam = this.route.snapshot.paramMap.get('id');
    if (idParam) {
      this.returnId = Number(idParam);
      this.isEditMode.set(true);
      this.loading.set(true);

      this.client.saleReturnsGET(this.returnId).subscribe({
        next: (ret) => {
          this.existingReturnNo.set(ret.returnNo ?? null);
          this.form.patchValue({
            saleId: ret.saleId ?? null,
            returnDate: ret.returnDate ? new Date(ret.returnDate).toISOString().slice(0, 10) : this.today(),
            discount: ret.discount,
            tax: ret.tax,
            remarks: ret.remarks ?? ''
          });
          for (const item of ret.items ?? []) {
            this.items.push(this.buildRow(item.productId ?? null, item.quantity ?? 0, item.salePrice ?? 0, item.discount ?? 0, item.tax ?? 0, item.total ?? 0));
          }
          this.form.markAsPristine();
          this.loading.set(false);
        },
        error: () => {
          this.errorMessage.set('Could not load this return.');
          this.notify.danger('Could not load this return.');
          this.loading.set(false);
        }
      });
    } else {
      this.addRow();
    }
  }

  // Updated to include loading states and error handling
  private populateFromSale(saleId: number): void {
    this.loading.set(true); // Trigger UI skeleton loader
    
    this.client.salesGET(saleId).subscribe({
      next: (sale) => {
        this.form.patchValue({
          discount: sale.discount || 0,
          tax: sale.tax || 0
        }, { emitEvent: false });

        this.items.clear();
        
        if (sale.items && sale.items.length > 0) {
          for (const item of sale.items) {
            this.items.push(this.buildRow(
              item.productId ?? null, 
              item.quantity ?? 0, 
              item.salePrice ?? 0, 
              item.discount ?? 0, 
              item.tax ?? 0, 
              item.total ?? 0,
              true // Tell buildRow this is pre-filled data
            ));
          }
        } else {
          this.addRow();
          this.notify.warning('The selected invoice has no items.');
        }

        this.form.markAsDirty();
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.notify.danger('Failed to load details for the selected invoice.');
      }
    });
  }

  private buildRow(productId: number | null, quantity: number, salePrice: number, discount: number, tax: number, total: number, isPrefill = false): FormGroup {    
    const group = this.fb.group({
      productId: [productId, Validators.required],
      quantity: [quantity, [Validators.required, Validators.min(0)]],
      salePrice: [salePrice, [Validators.required, Validators.min(0)]],
      discount: [discount, [Validators.min(0)]],
      tax: [tax, [Validators.min(0)]],
      total: [{ value: total, disabled: true }]
    });

    group.get('productId')?.valueChanges.subscribe((id: number | null) => {
      // Only auto-update the price if the user is manually picking a product, 
      // NOT when we are pre-filling from a historical invoice!
      if (id !== null && !isPrefill) {
        const p = this.allProducts().find(x => x.id === id);
        if (p) group.get('salePrice')?.setValue(p.salePrice ?? 0);
      }
      isPrefill = false; // Reset flag after initial load
    });

    return group;
  }

  addRow(): void {
    this.items.push(this.buildRow(null, 0, 0, 0, 0, 0));
    this.form.markAsDirty();
  }

  removeRow(index: number): void {
    if (this.items.length <= 1) {
      this.notify.warning('A return must have at least one item.');
      return;
    }
    this.items.removeAt(index);
    this.form.markAsDirty();
  }

  submit(): void {
    if (this.form.invalid || this.items.length === 0) {
      this.form.markAllAsTouched();
      this.notify.warning('Please check the highlighted fields.');
      return;
    }

    const v = this.form.getRawValue();
    const validItems = v.items!.filter((i: any) => i.quantity > 0);
    
    if (validItems.length === 0) {
      this.notify.warning('Please enter a return quantity greater than 0 for at least one item.');
      return;
    }

    this.errorMessage.set(null);
    this.saving.set(true);
    
    const dtoItems = validItems.map(
      (r: any, i: number) => new CreateSaleReturnDetailDto({
          productId: r.productId,
          quantity: r.quantity,
          salePrice: r.salePrice,
          discount: r.discount || 0,
          tax: r.tax || 0,
          total: this.rowTotal(i)
        })
    );

    const dto = new CreateSaleReturnDto({
      saleId: v.saleId ?? undefined,
      returnDate: new Date(v.returnDate!) as any,
      discount: v.discount || 0,
      tax: v.tax || 0,
      remarks: v.remarks?.trim() || undefined,
      items: dtoItems
    });

    const request$ = this.isEditMode()
      ? this.client.saleReturnsPUT(this.returnId!, dto)
      : this.client.saleReturnsPOST(dto);

    request$.subscribe({
      next: () => {
        this.saving.set(false);
        this.notify.success(this.isEditMode() ? 'Return updated successfully.' : 'Return recorded successfully.');
        this.router.navigate(['/sale-returns']);
      },
      error: (err: any) => {
        this.saving.set(false);
        const msg = err.response ? JSON.parse(err.response).message : 'Could not save return.';
        this.errorMessage.set(msg);
        this.notify.danger(msg);
      }
    });
  }

  async cancel(): Promise<void> {
    if (this.form.dirty) {
      const confirmed = await this.alert.confirm('Discard changes?', 'Are you sure you want to leave without saving?');
      if (!confirmed) return;
    }
    this.router.navigate(['/sale-returns']);
  }
}