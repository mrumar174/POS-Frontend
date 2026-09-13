import { Component, OnInit, inject, signal, ElementRef, ViewChild, AfterViewInit } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { Client, CreateCategoryDto, UpdateCategoryDto } from '../../../core/api/api-client';
import { NotificationService } from '../../../shared/notification/notification.service';
import { AlertService } from '../../../shared/alert/alert.service';
import { PageHeader } from '../../../shared/page-header/page-header';

const NAME_MAX_LENGTH = 100;
const DESCRIPTION_MAX_LENGTH = 500;

@Component({
  selector: 'app-category-form',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, PageHeader],
  templateUrl: './category-form.html',
  styleUrl: './category-form.css'
})
export class CategoryForm implements OnInit, AfterViewInit {
  private fb = inject(FormBuilder);
  private client = inject(Client);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private notify = inject(NotificationService);
  private alert = inject(AlertService);

  @ViewChild('nameInput') nameInput?: ElementRef<HTMLInputElement>;

  readonly loading = signal(false);      // initial load in edit mode
  readonly saving = signal(false);       // submit in progress
  readonly errorMessage = signal<string | null>(null);
  readonly isEditMode = signal(false);
  private categoryId: number | null = null;

  readonly nameMaxLength = NAME_MAX_LENGTH;
  readonly descriptionMaxLength = DESCRIPTION_MAX_LENGTH;

  form = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(NAME_MAX_LENGTH)]],
    description: ['', [Validators.maxLength(DESCRIPTION_MAX_LENGTH)]]
  });

  get breadcrumbSegments(): string[] {
    return ['Catalog', this.isEditMode() ? 'Edit Category' : 'Create Category'];
  }

  get nameControl() {
    return this.form.controls.name;
  }

  get descriptionControl() {
    return this.form.controls.description;
  }

  ngOnInit(): void {
    const idParam = this.route.snapshot.paramMap.get('id');
    if (idParam) {
      this.categoryId = Number(idParam);
      this.isEditMode.set(true);
      this.loading.set(true);

      this.client.categoriesGET(this.categoryId).subscribe({
        next: (category) => {
          this.form.patchValue({ name: category.name, description: category.description ?? '' });
          this.form.markAsPristine(); // freshly loaded data isn't a user edit yet
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

  ngAfterViewInit(): void {
    // Auto-focus the name field for a faster "create" flow — skip in edit
    // mode since the field is being populated asynchronously right after.
    if (!this.isEditMode()) {
      this.nameInput?.nativeElement.focus();
    }
  }

  submit(): void {
    // Trim before validating so "   " doesn't pass required and isn't saved
    // with stray whitespace.
    const trimmedName = (this.nameControl.value ?? '').trim();
    const trimmedDescription = (this.descriptionControl.value ?? '').trim();
    this.form.patchValue({ name: trimmedName, description: trimmedDescription }, { emitEvent: false });

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.nameInput?.nativeElement.focus();

      if (this.nameControl.hasError('required')) {
        this.notify.warning('Name is required.');
      } else if (this.nameControl.hasError('maxlength')) {
        this.notify.warning(`Name cannot exceed ${this.nameMaxLength} characters.`);
      } else if (this.descriptionControl.hasError('maxlength')) {
        this.notify.warning(`Description cannot exceed ${this.descriptionMaxLength} characters.`);
      }
      return;
    }

    this.errorMessage.set(null);
    this.saving.set(true);

    const request$ = this.isEditMode()
      ? this.client.categoriesPUT(
          this.categoryId!,
          new UpdateCategoryDto({ id: this.categoryId!, name: trimmedName, description: trimmedDescription || undefined })
        )
      : this.client.categoriesPOST(new CreateCategoryDto({ name: trimmedName, description: trimmedDescription || undefined }));

    request$.subscribe({
      next: () => {
        this.saving.set(false);
        this.form.markAsPristine();
        this.notify.success(this.isEditMode() ? 'Category updated successfully.' : 'Category created successfully.');
        this.router.navigate(['/categories']);
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        const message =
          typeof err.error === 'string'
            ? err.error
            : err.error?.message ?? 'Could not save this category. Please check your input.';
        this.errorMessage.set(message);
        this.notify.danger(message);
      }
    });
  }

  async cancel(): Promise<void> {
    // Don't silently discard unsaved edits — confirm first if the form
    // actually changed since load.
    if (this.form.dirty) {
      const confirmed = await this.alert.confirm(
        'Discard changes?',
        'You have unsaved changes. Are you sure you want to leave without saving?'
      );
      if (!confirmed) return;
    }
    this.router.navigate(['/categories']);
  }
}