import { Component, OnInit, AfterViewInit, ElementRef, ViewChild, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { Client, CreatePaymentMethodDto, UpdatePaymentMethodDto } from '../../../core/api/api-client';
import { NotificationService } from '../../../shared/notification/notification.service';
import { AlertService } from '../../../shared/alert/alert.service';
import { PageHeader } from '../../../shared/page-header/page-header';

const NAME_MAX_LENGTH = 50;

@Component({
  selector: 'app-payment-method-form',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, PageHeader],
  templateUrl: './payment-method-form.html',
  styleUrl: './payment-method-form.css'
})
export class PaymentMethodForm implements OnInit, AfterViewInit {
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
  private methodId: number | null = null;

  readonly nameMaxLength = NAME_MAX_LENGTH;

  form = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(NAME_MAX_LENGTH)]]
  });

  get nameControl() { return this.form.controls.name; }

  get breadcrumbSegments(): string[] {
    return ['Purchasing', this.isEditMode() ? 'Edit Payment Method' : 'Create Payment Method'];
  }

  ngOnInit(): void {
    const idParam = this.route.snapshot.paramMap.get('id');
    if (idParam) {
      this.methodId = Number(idParam);
      this.isEditMode.set(true);
      this.loading.set(true);

      this.client.paymentMethodsGET(this.methodId).subscribe({
        next: (method) => {
          this.form.patchValue({ name: method.name });
          this.form.markAsPristine();
          this.loading.set(false);
        },
        error: () => {
          this.errorMessage.set('Could not load this payment method.');
          this.notify.danger('Could not load this payment method.');
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
    this.form.patchValue({ name: trimmedName }, { emitEvent: false });

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.nameInput?.nativeElement.focus();

      if (this.nameControl.hasError('required')) {
        this.notify.warning('Name is required.');
      } else if (this.nameControl.hasError('maxlength')) {
        this.notify.warning(`Name cannot exceed ${this.nameMaxLength} characters.`);
      }
      return;
    }

    this.errorMessage.set(null);
    this.saving.set(true);

    const request$ = this.isEditMode()
      ? this.client.paymentMethodsPUT(this.methodId!, new UpdatePaymentMethodDto({ id: this.methodId!, name: trimmedName }))
      : this.client.paymentMethodsPOST(new CreatePaymentMethodDto({ name: trimmedName }));

    request$.subscribe({
      next: () => {
        this.saving.set(false);
        this.form.markAsPristine();
        this.notify.success(this.isEditMode() ? 'Payment method updated successfully.' : 'Payment method created successfully.');
        this.router.navigate(['/payment-methods']);
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        const message = typeof err.error === 'string' ? err.error : err.error?.message ?? 'Could not save this payment method.';
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
    this.router.navigate(['/payment-methods']);
  }
}