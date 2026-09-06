import { Component, OnInit, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { Client, CreateCategoryDto, UpdateCategoryDto } from '../../../core/api/api-client';
import { NotificationService } from '../../../shared/notification/notification.service';

@Component({
  selector: 'app-category-form',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './category-form.html'
})
export class CategoryForm implements OnInit {
  private fb = inject(FormBuilder);
  private client = inject(Client);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private notify = inject(NotificationService);

  readonly loading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly isEditMode = signal(false);
  private categoryId: number | null = null;

  form = this.fb.group({
    name: ['', Validators.required],
    description: ['']
  });

  ngOnInit(): void {
    const idParam = this.route.snapshot.paramMap.get('id');
    if (idParam) {
      this.categoryId = Number(idParam);
      this.isEditMode.set(true);
      this.loading.set(true);
      this.client.categoriesGET(this.categoryId).subscribe({
        next: (category) => {
          this.form.patchValue({ name: category.name, description: category.description ?? '' });
          this.loading.set(false);
        },
        error: () => {
          this.errorMessage.set('Could not load this category.');
          this.notify.danger('Could not load this category.');
          this.loading.set(false);
        }
      });
    }
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();

      if (this.form.controls.name.hasError('required')) {
        this.notify.warning('Name is required.');
      }
      return;
    }

    this.errorMessage.set(null);
    this.loading.set(true);
    const value = this.form.getRawValue();

    const request$ = this.isEditMode()
      ? this.client.categoriesPUT(this.categoryId!, new UpdateCategoryDto({ id: this.categoryId!, name: value.name!, description: value.description ?? undefined }))
      : this.client.categoriesPOST(new CreateCategoryDto({ name: value.name!, description: value.description ?? undefined }));

    request$.subscribe({
      next: () => {
        this.loading.set(false);
        this.notify.success(this.isEditMode() ? 'Category updated successfully.' : 'Category created successfully.');
        this.router.navigate(['/categories']);
      },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        const message = typeof err.error === 'string' ? err.error : 'Could not save this category. Please check your input.';
        this.errorMessage.set(message);
        this.notify.danger(message);
      }
    });
  }
}