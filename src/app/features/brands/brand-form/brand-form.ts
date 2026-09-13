import { Component, OnInit, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Client, CreateBrandDto, UpdateBrandDto } from '../../../core/api/api-client';
import { NotificationService } from '../../../shared/notification/notification.service';
import { PageHeader } from '../../../shared/page-header/page-header';

@Component({
  selector: 'app-brand-form',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, PageHeader],
  templateUrl: './brand-form.html'
})
export class BrandForm implements OnInit {
  private fb = inject(FormBuilder);
  private client = inject(Client);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private notify = inject(NotificationService);

  readonly loading = signal(false);
  readonly isEditMode = signal(false);
  private brandId: number | null = null;

  form = this.fb.group({
    name: ['', Validators.required],
    description: ['']
  });

  get breadcrumbSegments(): string[] {
    return ['Catalog', this.isEditMode() ? 'Edit Brand' : 'Create Brand'];
  }

  ngOnInit(): void {
    const idParam = this.route.snapshot.paramMap.get('id');
    if (idParam) {
      this.brandId = Number(idParam);
      this.isEditMode.set(true);
      this.loading.set(true);
      this.client.brandsGET(this.brandId).subscribe({
        next: (brand) => {
          this.form.patchValue({ name: brand.name, description: brand.description ?? '' });
          this.loading.set(false);
        },
        error: () => { this.notify.danger('Could not load this brand.'); this.loading.set(false); }
      });
    }
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      if (this.form.controls.name.hasError('required')) this.notify.warning('Name is required.');
      return;
    }

    this.loading.set(true);
    const v = this.form.getRawValue();

    const request$ = this.isEditMode()
      ? this.client.brandsPUT(this.brandId!, new UpdateBrandDto({ id: this.brandId!, name: v.name!, description: v.description || undefined }))
      : this.client.brandsPOST(new CreateBrandDto({ name: v.name!, description: v.description || undefined }));

    request$.subscribe({
      next: () => {
        this.loading.set(false);
        this.notify.success(this.isEditMode() ? 'Brand updated successfully.' : 'Brand created successfully.');
        this.router.navigate(['/brands']);
      },
      error: (err) => { this.loading.set(false); this.notify.danger(err.error?.message ?? 'Could not save this brand.'); }
    });
  }
}