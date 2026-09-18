import { Component, OnInit, AfterViewInit, ElementRef, ViewChild, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, FormArray, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { Client, CreateProductDto, UpdateProductDto, CategoryDto, BrandDto, UnitDto } from '../../../core/api/api-client';
import { NotificationService } from '../../../shared/notification/notification.service';
import { AlertService } from '../../../shared/alert/alert.service';
import { PageHeader } from '../../../shared/page-header/page-header';

const NAME_MAX_LENGTH = 150;
const CODE_MAX_LENGTH = 30;

@Component({
  selector: 'app-product-form',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, PageHeader],
  templateUrl: './product-form.html',
  styleUrl: './product-form.css'
})
export class ProductForm implements OnInit, AfterViewInit {
  readonly productCode = signal<string | null>(null);
  private fb = inject(FormBuilder);
  private client = inject(Client);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private notify = inject(NotificationService);
  private alert = inject(AlertService);

  @ViewChild('nameInput') nameInput?: ElementRef<HTMLInputElement>;

  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly isEditMode = signal(false);
  private productId: number | null = null;

  readonly allCategories = signal<CategoryDto[]>([]);
  readonly allBrands = signal<BrandDto[]>([]);
  readonly allUnits = signal<UnitDto[]>([]);

  readonly nameMaxLength = NAME_MAX_LENGTH;
  readonly codeMaxLength = CODE_MAX_LENGTH;

  form = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(NAME_MAX_LENGTH)]],
    categoryId: [null as number | null, Validators.required],
    brandId: [null as number | null],
    unitId: [null as number | null, Validators.required],
    purchasePrice: [0, [Validators.required, Validators.min(0)]],
    salePrice: [0, [Validators.required, Validators.min(0)]],
    minimumStock: [0, [Validators.required, Validators.min(0)]],
    description: [''],
    barcodes: this.fb.array<string>([])
  });

  get nameControl() { return this.form.controls.name; }
  get categoryIdControl() { return this.form.controls.categoryId; }
  get unitIdControl() { return this.form.controls.unitId; }
  get purchasePriceControl() { return this.form.controls.purchasePrice; }
  get salePriceControl() { return this.form.controls.salePrice; }

  get barcodes(): FormArray {
    return this.form.get('barcodes') as FormArray;
  }

  get breadcrumbSegments(): string[] {
    return ['Catalog', this.isEditMode() ? 'Edit Product' : 'Create Product'];
  }

  ngOnInit(): void {
    this.client.categoriesAll().subscribe({ next: (d) => this.allCategories.set(d) });
    this.client.brandsAll().subscribe({ next: (d) => this.allBrands.set(d) });
    this.client.unitsAll().subscribe({ next: (d) => this.allUnits.set(d) });

    const idParam = this.route.snapshot.paramMap.get('id');

    if (idParam) {
      this.productId = Number(idParam);
      this.isEditMode.set(true);
      this.loading.set(true);

      this.client.productsGET(this.productId).subscribe({
        next: (product) => {
          this.productCode.set(product.productCode ?? null);

          this.form.patchValue({
            name: product.name,
            categoryId: product.categoryId,
            brandId: product.brandId ?? null,
            unitId: product.unitId,
            purchasePrice: product.purchasePrice,
            salePrice: product.salePrice,
            minimumStock: product.minimumStock,
            description: product.description ?? ''
          });

          for (const b of product.barcodes ?? []) {
            this.barcodes.push(this.fb.control(b, Validators.required));
          }

          this.form.markAsPristine();
          this.loading.set(false);
        },
        error: () => {
          this.errorMessage.set('Could not load this product.');
          this.notify.danger('Could not load this product.');
          this.loading.set(false);
        }
      });
    } else {
      this.loading.set(false);
    }
  }

  ngAfterViewInit(): void {
    if (!this.isEditMode()) {
      this.nameInput?.nativeElement.focus();
    }
  }

  addBarcode(): void {
    this.barcodes.push(this.fb.control('', Validators.required));
    this.form.markAsDirty();
  }

  removeBarcode(index: number): void {
    this.barcodes.removeAt(index);
    this.form.markAsDirty();
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.nameInput?.nativeElement.focus();

      if (this.nameControl.invalid) {
        this.notify.warning('Name is required.');
      } else if (this.categoryIdControl.invalid) {
        this.notify.warning('Category is required.');
      } else if (this.unitIdControl.invalid) {
        this.notify.warning('Unit is required.');
      } else if (this.purchasePriceControl.invalid || this.salePriceControl.invalid) {
        this.notify.warning('Prices must be zero or greater.');
      } else {
        this.notify.warning('Please check the highlighted fields.');
      }

      return;
    }

    this.errorMessage.set(null);
    this.saving.set(true);

    const v = this.form.getRawValue();

    const cleanedBarcodes = (v.barcodes as string[])
      .map((b) => b.trim())
      .filter((b) => b.length > 0);

    const payload = {
      productCode: this.isEditMode() ? this.productCode() ?? '' : '',
      name: v.name!.trim(),
      categoryId: v.categoryId!,
      brandId: v.brandId ?? undefined,
      unitId: v.unitId!,
      purchasePrice: v.purchasePrice!,
      salePrice: v.salePrice!,
      minimumStock: v.minimumStock!,
      description: v.description?.trim() || undefined,
      barcodes: cleanedBarcodes
    };

    const request$ = this.isEditMode()
      ? this.client.productsPUT(
          this.productId!,
          new UpdateProductDto({
            id: this.productId!,
            ...payload
          })
        )
      : this.client.productsPOST(
          new CreateProductDto(payload)
        );

    request$.subscribe({
      next: () => {
        this.saving.set(false);
        this.form.markAsPristine();

        this.notify.success(
          this.isEditMode()
            ? 'Product updated successfully.'
            : 'Product created successfully.'
        );

        this.router.navigate(['/products']);
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);

        const message =
          typeof err.error === 'string'
            ? err.error
            : err.error?.message ?? 'Could not save this product.';

        this.errorMessage.set(message);
        this.notify.danger(message);
      }
    });
  }

  async cancel(): Promise<void> {
    if (this.form.dirty) {
      const confirmed = await this.alert.confirm(
        'Discard changes?',
        'You have unsaved changes. Are you sure you want to leave without saving?'
      );

      if (!confirmed) return;
    }

    this.router.navigate(['/products']);
  }
}