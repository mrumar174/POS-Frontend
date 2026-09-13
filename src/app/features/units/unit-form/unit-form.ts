import { Component, OnInit, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Client, CreateUnitDto, UpdateUnitDto } from '../../../core/api/api-client';
import { NotificationService } from '../../../shared/notification/notification.service';
import { PageHeader } from '../../../shared/page-header/page-header';

@Component({
  selector: 'app-unit-form',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, PageHeader],
  templateUrl: './unit-form.html'
})
export class UnitForm implements OnInit {
  private fb = inject(FormBuilder);
  private client = inject(Client);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private notify = inject(NotificationService);

  readonly loading = signal(false);
  readonly isEditMode = signal(false);
  private unitId: number | null = null;

  form = this.fb.group({
    name: ['', Validators.required],
    shortName: ['', Validators.required]
  });

  get breadcrumbSegments(): string[] {
    return ['Catalog', this.isEditMode() ? 'Edit Unit' : 'Create Unit'];
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
          this.loading.set(false);
        },
        error: () => { this.notify.danger('Could not load this unit.'); this.loading.set(false); }
      });
    }
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      if (this.form.controls.name.hasError('required')) this.notify.warning('Name is required.');
      else if (this.form.controls.shortName.hasError('required')) this.notify.warning('Short name is required.');
      return;
    }

    this.loading.set(true);
    const v = this.form.getRawValue();

    const request$ = this.isEditMode()
      ? this.client.unitsPUT(this.unitId!, new UpdateUnitDto({ id: this.unitId!, name: v.name!, shortName: v.shortName! }))
      : this.client.unitsPOST(new CreateUnitDto({ name: v.name!, shortName: v.shortName! }));

    request$.subscribe({
      next: () => {
        this.loading.set(false);
        this.notify.success(this.isEditMode() ? 'Unit updated successfully.' : 'Unit created successfully.');
        this.router.navigate(['/units']);
      },
      error: (err) => { this.loading.set(false); this.notify.danger(err.error?.message ?? 'Could not save this unit.'); }
    });
  }
}