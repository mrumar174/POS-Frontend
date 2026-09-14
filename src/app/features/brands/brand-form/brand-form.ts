import { Component, OnInit, AfterViewInit, ElementRef, ViewChild, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { Client, CreateBrandDto, UpdateBrandDto } from '../../../core/api/api-client';
import { NotificationService } from '../../../shared/notification/notification.service';
import { AlertService } from '../../../shared/alert/alert.service';
import { PageHeader } from '../../../shared/page-header/page-header';

const NAME_MAX_LENGTH = 100;
const DESCRIPTION_MAX_LENGTH = 500;

@Component({
  selector: 'app-brand-form',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, PageHeader],
  templateUrl: './brand-form.html',
  styleUrl: './brand-form.css'
})
export class BrandForm implements OnInit, AfterViewInit {
  private fb = inject(FormBuilder);
  private client = inject(Client);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private notify = inject(NotificationService);
  private alert = inject(AlertService);

  @ViewChild('nameInput') nameInput?: ElementRef<HTMLInputElement>;

  readonly loading = signal(false);   // initial load in edit mode
  readonly saving = signal(false);    // submit in progress
  readonly errorMessage = signal<string | null>(null);
  readonly isEditMode = signal(false);
  private brandId: number | null = null;

  readonly nameMaxLength = NAME_MAX_LENGTH;
  readonly descriptionMaxLength = DESCRIPTION_MAX_LENGTH;

  form = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(NAME_MAX_LENGTH)]],
    description: ['', [Validators.maxLength(DESCRIPTION_MAX_LENGTH)]]
  });

  get breadcrumbSegments(): string[] {
    return ['Catalog', this.isEditMode() ? 'Edit Brand' : 'Create Brand'];
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
      this.brandId = Number(idParam);
      this.isEditMode.set(true);
      this.loading.set(true);

      this.client.brandsGET(this.brandId).subscribe({
        next: (brand) => {
          this.form.patchValue({ name: brand.name, description: brand.description ?? '' });
          this.form.markAsPristine();
          this.loading.set(false);
        },
        error: () => {
          this.errorMessage.set('Could not load this brand.');
          this.notify.danger('Could not load this brand.');
          this.loading.set(false);
        }
      });
    }
  }

  ngAfterViewInit(): void {
    if (!this.isEditMode()) {
      this.nameInput?.nativeElement.focus();
    }
  }

  submit(): void {
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
      ? this.client.brandsPUT(
          this.brandId!,
          new UpdateBrandDto({ id: this.brandId!, name: trimmedName, description: trimmedDescription || undefined })
        )
      : this.client.brandsPOST(new CreateBrandDto({ name: trimmedName, description: trimmedDescription || undefined }));

    request$.subscribe({
      next: () => {
        this.saving.set(false);
        this.form.markAsPristine();
        this.notify.success(this.isEditMode() ? 'Brand updated successfully.' : 'Brand created successfully.');
        this.router.navigate(['/brands']);
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        const message =
          typeof err.error === 'string'
            ? err.error
            : err.error?.message ?? 'Could not save this brand. Please check your input.';
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
    this.router.navigate(['/brands']);
  }
}