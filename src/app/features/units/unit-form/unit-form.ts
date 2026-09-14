import { Component, OnInit, AfterViewInit, ElementRef, ViewChild, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { Client, CreateUnitDto, UpdateUnitDto } from '../../../core/api/api-client';
import { NotificationService } from '../../../shared/notification/notification.service';
import { AlertService } from '../../../shared/alert/alert.service';
import { PageHeader } from '../../../shared/page-header/page-header';

const NAME_MAX_LENGTH = 50;
const SHORT_NAME_MAX_LENGTH = 10;

@Component({
  selector: 'app-unit-form',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, PageHeader],
  templateUrl: './unit-form.html',
  styleUrl: './unit-form.css'
})
export class UnitForm implements OnInit, AfterViewInit {
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
  private unitId: number | null = null;

  readonly nameMaxLength = NAME_MAX_LENGTH;
  readonly shortNameMaxLength = SHORT_NAME_MAX_LENGTH;

  form = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(NAME_MAX_LENGTH)]],
    shortName: ['', [Validators.required, Validators.maxLength(SHORT_NAME_MAX_LENGTH)]]
  });

  get breadcrumbSegments(): string[] {
    return ['Catalog', this.isEditMode() ? 'Edit Unit' : 'Create Unit'];
  }

  get nameControl() {
    return this.form.controls.name;
  }

  get shortNameControl() {
    return this.form.controls.shortName;
  }

  ngOnInit(): void {
    const idParam = this.route.snapshot.paramMap.get('id');
    if (idParam) {
      this.unitId = Number(idParam);
      this.isEditMode.set(true);
      this.loading.set(true);

      this.client.unitsGET(this.unitId).subscribe({
        next: (unit) => {
          this.form.patchValue({ name: unit.name, shortName: unit.shortName });
          this.form.markAsPristine();
          this.loading.set(false);
        },
        error: () => {
          this.errorMessage.set('Could not load this unit.');
          this.notify.danger('Could not load this unit.');
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
    const trimmedShortName = (this.shortNameControl.value ?? '').trim();
    this.form.patchValue({ name: trimmedName, shortName: trimmedShortName }, { emitEvent: false });

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.nameInput?.nativeElement.focus();

      if (this.nameControl.hasError('required')) {
        this.notify.warning('Name is required.');
      } else if (this.nameControl.hasError('maxlength')) {
        this.notify.warning(`Name cannot exceed ${this.nameMaxLength} characters.`);
      } else if (this.shortNameControl.hasError('required')) {
        this.notify.warning('Short name is required.');
      } else if (this.shortNameControl.hasError('maxlength')) {
        this.notify.warning(`Short name cannot exceed ${this.shortNameMaxLength} characters.`);
      }
      return;
    }

    this.errorMessage.set(null);
    this.saving.set(true);

    const request$ = this.isEditMode()
      ? this.client.unitsPUT(this.unitId!, new UpdateUnitDto({ id: this.unitId!, name: trimmedName, shortName: trimmedShortName }))
      : this.client.unitsPOST(new CreateUnitDto({ name: trimmedName, shortName: trimmedShortName }));

    request$.subscribe({
      next: () => {
        this.saving.set(false);
        this.form.markAsPristine();
        this.notify.success(this.isEditMode() ? 'Unit updated successfully.' : 'Unit created successfully.');
        this.router.navigate(['/units']);
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        const message =
          typeof err.error === 'string'
            ? err.error
            : err.error?.message ?? 'Could not save this unit. Please check your input.';
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
    this.router.navigate(['/units']);
  }
}