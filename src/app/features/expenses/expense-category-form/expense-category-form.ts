import { Component, OnInit, AfterViewInit, ElementRef, ViewChild, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Client, CreateExpenseCategoryDto, UpdateExpenseCategoryDto } from '../../../core/api/api-client';
import { NotificationService } from '../../../shared/notification/notification.service';
import { AlertService } from '../../../shared/alert/alert.service';
import { PageHeader } from '../../../shared/page-header/page-header';
import { extractErrorMessage } from '../../../shared/utils/api-error';

const NAME_MAX_LENGTH = 100;
const DESCRIPTION_MAX_LENGTH = 300;

@Component({
  selector: 'app-expense-category-form',
  standalone: true,
  imports: [ReactiveFormsModule, PageHeader],
  templateUrl: './expense-category-form.html',
  styleUrl: './expense-category-form.css'
})
export class ExpenseCategoryForm implements OnInit, AfterViewInit {
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
  private categoryId: number | null = null;

  readonly nameMaxLength = NAME_MAX_LENGTH;
  readonly descriptionMaxLength = DESCRIPTION_MAX_LENGTH;

  form = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(NAME_MAX_LENGTH)]],
    description: ['', [Validators.maxLength(DESCRIPTION_MAX_LENGTH)]]
  });

  get breadcrumbSegments(): string[] {
    return ['Finance', 'Expense Categories', this.isEditMode() ? 'Edit Category' : 'New Category'];
  }
  get nameControl() { return this.form.controls.name; }
  get descriptionControl() { return this.form.controls.description; }

  ngOnInit(): void {
    const idParam = this.route.snapshot.paramMap.get('id');
    if (!idParam) return;

    this.categoryId = Number(idParam);
    this.isEditMode.set(true);
    this.loading.set(true);

    this.client.expenseCategoriesGET(this.categoryId).subscribe({
      next: (c) => {
        this.form.patchValue({ name: c.name, description: c.description ?? '' });
        this.form.markAsPristine();
        this.loading.set(false);
      },
      error: (err: any) => {
        const msg = extractErrorMessage(err, 'Could not load this category.');
        this.errorMessage.set(msg);
        this.notify.danger(msg);
        this.loading.set(false);
      }
    });
  }

  ngAfterViewInit(): void {
    if (!this.isEditMode()) this.nameInput?.nativeElement.focus();
  }

  submit(): void {
    const name = (this.nameControl.value ?? '').trim();
    const description = (this.descriptionControl.value ?? '').trim();
    this.form.patchValue({ name, description }, { emitEvent: false });

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.nameInput?.nativeElement.focus();
      if (this.nameControl.hasError('required')) this.notify.warning('Name is required.');
      else if (this.nameControl.hasError('maxlength')) this.notify.warning(`Name cannot exceed ${NAME_MAX_LENGTH} characters.`);
      else if (this.descriptionControl.hasError('maxlength')) this.notify.warning(`Description cannot exceed ${DESCRIPTION_MAX_LENGTH} characters.`);
      return;
    }

    this.errorMessage.set(null);
    this.saving.set(true);

    const request$ = this.isEditMode()
      ? this.client.expenseCategoriesPUT(this.categoryId!, new UpdateExpenseCategoryDto({ id: this.categoryId!, name, description: description || undefined }))
      : this.client.expenseCategoriesPOST(new CreateExpenseCategoryDto({ name, description: description || undefined }));

    request$.subscribe({
      next: () => {
        this.saving.set(false);
        this.form.markAsPristine();
        this.notify.success(this.isEditMode() ? 'Category updated successfully.' : 'Category created successfully.');
        this.router.navigate(['/expense-categories']);
      },
      error: (err: any) => {
        this.saving.set(false);
        const msg = extractErrorMessage(err, 'Could not save this category.');
        this.errorMessage.set(msg);
        this.notify.danger(msg);
      }
    });
  }

  async cancel(): Promise<void> {
    if (this.form.dirty) {
      const confirmed = await this.alert.confirm('Discard changes?', 'You have unsaved changes. Are you sure you want to leave without saving?');
      if (!confirmed) return;
    }
    this.router.navigate(['/expense-categories']);
  }
}