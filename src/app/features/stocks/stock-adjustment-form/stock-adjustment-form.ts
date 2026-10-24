import { Component, ElementRef, HostListener, OnInit, inject, signal, computed } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, FormArray, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { catchError, map, of, switchMap } from 'rxjs';
import { Client, CreateStockAdjustmentDto, CreateStockAdjustmentDetailDto, ProductDto } from '../../../core/api/api-client';
import { NotificationService } from '../../../shared/notification/notification.service';
import { SearchableSelect, SearchableOption } from '../../../shared/searchable-select/searchable-select';
import { AlertService } from '../../../shared/alert/alert.service';
import { PageHeader } from '../../../shared/page-header/page-header';
import { DecimalPipe } from '@angular/common';

@Component({
  selector: 'app-stock-adjustment-form',
  standalone: true,
  imports: [ReactiveFormsModule, DecimalPipe, SearchableSelect, PageHeader],
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
  private host = inject<ElementRef<HTMLElement>>(ElementRef);
  private confirming = false; // true while the 'discard changes' dialog is open

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

  // Number of rows that actually have a product selected
  get filledCount(): number {
    return this.items.controls.filter((r) => !!r.get('productId')?.value).length;
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
            adjustmentDate: adj.adjustmentDate ? this.toDateInput(new Date(adj.adjustmentDate)) : this.today(),
            reason: adj.reason ?? '',
            remarks: adj.remarks ?? ''
          });
          for (const item of adj.items ?? []) {
            this.items.push(this.buildRow(item.productId!, item.systemQuantity!, item.physicalQuantity!));
          }
          this.ensureTrailingRow(); // keep one empty row at the end for adding more products
          this.form.markAsPristine();
          this.loading.set(false);
        },
        error: (err: any) => {
          const msg = this.extractErrorMessage(err, 'Could not load this adjustment.');
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

  private buildRow(productId: number | null, systemQty: number, physicalQty: number): FormGroup {
    const group = this.fb.group({
      productId: [productId, Validators.required],
      systemQuantity: [{ value: systemQty, disabled: true }],
      physicalQuantity: [physicalQty, [Validators.required, Validators.min(0)]],
      differenceQuantity: [{ value: physicalQty - systemQty, disabled: true }]
    });

    const productControl = group.get('productId')!;

    // Auto-add a new empty row when a product is picked in the last row
    productControl.valueChanges.subscribe((id: number | null) => {
      if (id === null) return;
      if (this.items.at(this.items.length - 1) === group) {
        this.items.push(this.buildRow(null, 0, 0));
        this.form.markAsDirty();
      }
    });

    // Load the current stock balance for the chosen product.
    // switchMap drops the older request if the product is changed quickly.
    productControl.valueChanges
      .pipe(
        switchMap((id: number | null) => {
          if (id === null) return of({ id, balance: 0 });
          return this.client.balance(id).pipe(
            map((balance: number) => ({ id, balance })),
            catchError(() => {
              this.notify.danger('Could not load the stock balance for this product.');
              return of({ id, balance: 0 });
            })
          );
        })
      )
      .subscribe(({ id, balance }) => {
        group.get('systemQuantity')?.setValue(balance);
        if (id === null) {
          group.get('physicalQuantity')?.reset(0);
          return;
        }
        // Start the count at the system quantity (difference 0) so an untouched row never zeroes the stock
        group.get('physicalQuantity')?.setValue(balance);
        // Keyboard flow: jump straight to the Physical Qty of this row
        setTimeout(() => this.focusRowField(group, 'physicalQuantity'));
      });

    group.get('physicalQuantity')?.valueChanges.subscribe(() => this.updateDifference(group));

    return group;
  }

  private updateDifference(group: FormGroup): void {
    const sys = Number(group.get('systemQuantity')?.value) || 0;
    const phys = Number(group.get('physicalQuantity')?.value) || 0;
    group.get('differenceQuantity')?.setValue(phys - sys);
  }

  // Makes sure the last row is an empty one (does not mark the form dirty)
  private ensureTrailingRow(): void {
    const last = this.items.length ? this.items.at(this.items.length - 1) : null;
    if (!last || last.get('productId')?.value) {
      this.items.push(this.buildRow(null, 0, 0));
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

  private productLabel(id: number | null): string {
    return this.allProducts().find((p) => p.id === id)?.name ?? 'This product';
  }

  // ───────────────────────── Keyboard: Enter + shortcuts ─────────────────────────

  // Enter moves to the next field (like Tab) instead of submitting the form.
  // It is left alone on buttons and inside the product dropdown.
  onEnter(event: Event): void {
    const el = event.target as HTMLElement | null;
    if (!el) return;
    const tag = el.tagName;
    if (tag === 'TEXTAREA' || tag === 'BUTTON' || tag === 'A') return;

    event.preventDefault();
    if (el.closest('app-searchable-select')) return;

    const list = this.tabbables();
    const next = list[list.indexOf(el) + 1];
    // After the last field, land on Save (not Cancel) so a second Enter saves
    if (next?.tagName === 'BUTTON') {
      this.focusEl(this.host.nativeElement.querySelector<HTMLElement>('.btn-save'));
    } else {
      this.focusEl(next);
    }
  }

  /*
   * Shortcuts
   *   Ctrl+S  Save / Record adjustment
   *   Alt+N   Go to the empty product row (add next product)
   *   Alt+D   Delete the row you are currently in
   *   Alt+R   Reason
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
      case 'KeyR':
        e.preventDefault();
        this.focusEl(this.host.nativeElement.querySelector<HTMLElement>('#reason'));
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
      if (this.items.controls.some((r) => !r.get('productId')?.value)) {
        this.notify.warning('Select at least one product.');
      } else {
        this.notify.warning('Please check the highlighted fields.');
      }
      this.ensureTrailingRow();
      return;
    }

    const v = this.form.getRawValue();

    // Duplicate products
    const seen = new Set<number>();
    for (const r of v.items! as any[]) {
      if (seen.has(r.productId)) {
        this.notify.warning(`${this.productLabel(r.productId)} is added more than once. Duplicate products are not allowed in the same adjustment.`);
        this.ensureTrailingRow();
        return;
      }
      seen.add(r.productId);
    }

    // Nothing to adjust
    if ((v.items! as any[]).every((r) => (Number(r.physicalQuantity) || 0) === (Number(r.systemQuantity) || 0))) {
      this.notify.warning('All physical quantities match the system quantities, so there is nothing to adjust.');
      this.ensureTrailingRow();
      return;
    }

    this.errorMessage.set(null);
    this.saving.set(true);

    const items = v.items!.map(
      (r: any) =>
        new CreateStockAdjustmentDetailDto({
          productId: r.productId,
          physicalQuantity: r.physicalQuantity
        })
    );

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
        this.ensureTrailingRow(); // bring the empty row back so the user can keep editing
        const msg = this.extractErrorMessage(err, 'Could not save adjustment.');
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
    this.router.navigate(['/stock-adjustments']);
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