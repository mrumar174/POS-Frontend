import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, FormArray, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Client, CreateStockAdjustmentDto, CreateStockAdjustmentDetailDto, ProductDto } from '../../../core/api/api-client';
import { NotificationService } from '../../../shared/notification/notification.service';
import { SearchableSelect, SearchableOption } from '../../../shared/searchable-select/searchable-select';
import { AlertService } from '../../../shared/alert/alert.service';
import { PageHeader } from '../../../shared/page-header/page-header';
import { DecimalPipe } from '@angular/common';

@Component({
  selector: 'app-stock-adjustment-form',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, DecimalPipe, SearchableSelect, PageHeader],
  templateUrl: './stock-adjustment-form.html',
  styleUrl: './stock-adjustment-form.css'
})
export class StockAdjustmentForm implements OnInit {
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
  readonly existingAdjustmentNo = signal<string | null>(null);
  private adjustmentId: number | null = null;

  readonly allProducts = signal<ProductDto[]>([]);
  readonly productOptions = computed<SearchableOption[]>(() =>
    this.allProducts().map((p) => ({ id: p.id!, label: p.name!, sublabel: p.productCode }))
  );

  form = this.fb.group({
    adjustmentDate: [this.today(), Validators.required],
    reason: [''],
    remarks: [''],
    items: this.fb.array<FormGroup>([])
  });

  get items(): FormArray<FormGroup> { return this.form.get('items') as FormArray<FormGroup>; }
  get breadcrumbSegments(): string[] { return ['Inventory', this.isEditMode() ? 'Edit Adjustment' : 'New Adjustment']; }

  private today(): string { return new Date().toISOString().slice(0, 10); }

  ngOnInit(): void {
    this.client.productsAll().subscribe({ next: (d) => this.allProducts.set(d) });

    const idParam = this.route.snapshot.paramMap.get('id');
    if (idParam) {
      this.adjustmentId = Number(idParam);
      this.isEditMode.set(true);
      this.loading.set(true);

      this.client.adjustmentsGET(this.adjustmentId).subscribe({
        next: (adj) => {
          this.existingAdjustmentNo.set(adj.adjustmentNo ?? null);
          this.form.patchValue({
            adjustmentDate: adj.adjustmentDate ? new Date(adj.adjustmentDate).toISOString().slice(0, 10) : this.today(),
            reason: adj.reason ?? '',
            remarks: adj.remarks ?? ''
          });
          for (const item of adj.items ?? []) {
            this.items.push(this.buildRow(item.productId!, item.systemQuantity!, item.physicalQuantity!));
          }
          this.form.markAsPristine();
          this.loading.set(false);
        },
        error: (err: any) => {
          this.errorMessage.set('Could not load this adjustment.');
          this.notify.danger('Could not load this adjustment.');
          this.loading.set(false);
        }
      });
    } else {
      this.addRow();
      this.loading.set(false);
    }
  }

  private buildRow(productId: number | null, systemQty: number, physicalQty: number): FormGroup {    
    const group = this.fb.group({
      productId: [productId, Validators.required],
      systemQuantity: [{ value: systemQty, disabled: true }],
      physicalQuantity: [physicalQty, [Validators.required, Validators.min(0)]],
      differenceQuantity: [{ value: physicalQty - systemQty, disabled: true }]
    });

    group.get('productId')?.valueChanges.subscribe((id: number | null) => {
      if (id === null) {
        group.patchValue({ systemQuantity: 0, physicalQuantity: 0, differenceQuantity: 0 });
        return; 
      }
      
      this.client.balance(id).subscribe({
        next: (bal: number) => {
          group.get('systemQuantity')?.setValue(bal);
          this.updateDifference(group);
        }
      });
    });

    group.get('physicalQuantity')?.valueChanges.subscribe(() => this.updateDifference(group));

    return group;
  }

  private updateDifference(group: FormGroup): void {
    const sys = Number(group.get('systemQuantity')?.value) || 0;
    const phys = Number(group.get('physicalQuantity')?.value) || 0;
    group.get('differenceQuantity')?.setValue(phys - sys);
  }

  addRow(): void {
    this.items.push(this.buildRow(null, 0, 0));
    this.form.markAsDirty();
  }

  async removeRow(index: number): Promise<void> {
    if (this.items.length <= 1) {
      this.notify.warning('An adjustment must have at least one item.');
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
    
    const productIds = v.items!.map((i: any) => i.productId);
    if (new Set(productIds).size !== productIds.length) {
      this.notify.warning('Duplicate products are not allowed in the same adjustment.');
      return;
    }

    this.errorMessage.set(null);
    this.saving.set(true);
    
    const items = v.items!.map((r: any) => new CreateStockAdjustmentDetailDto({
        productId: r.productId,
        physicalQuantity: r.physicalQuantity
    }));

    const dto = new CreateStockAdjustmentDto({
      adjustmentDate: new Date(v.adjustmentDate!) as any,
      reason: v.reason?.trim() || undefined,
      remarks: v.remarks?.trim() || undefined,
      items
    });

    const request$ = this.isEditMode()
      ? this.client.adjustmentsPUT(this.adjustmentId!, dto)
      : this.client.adjustmentsPOST(dto);

    request$.subscribe({
      next: () => {
        this.saving.set(false);
        this.form.markAsPristine();
        this.notify.success(this.isEditMode() ? 'Adjustment updated.' : 'Adjustment created.');
        this.router.navigate(['/stock-adjustments']);
      },
      error: (err: any) => {
        this.saving.set(false);
        this.errorMessage.set('Could not save adjustment.');
        this.notify.danger('Could not save adjustment.');
      }
    });
  }

  async cancel(): Promise<void> {
    if (this.form.dirty) {
      const confirmed = await this.alert.confirm('Discard changes?', 'You have unsaved changes.');
      if (!confirmed) return;
    }
    this.router.navigate(['/stock-adjustments']);
  }
}