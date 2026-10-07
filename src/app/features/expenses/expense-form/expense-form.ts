import { Component, OnInit, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Client, CreateExpenseDto, ExpenseCategoryDto, PaymentMethodDto } from '../../../core/api/api-client';
import { NotificationService } from '../../../shared/notification/notification.service';
import { AlertService } from '../../../shared/alert/alert.service';
import { PageHeader } from '../../../shared/page-header/page-header';
import { extractErrorMessage } from '../../../shared/utils/api-error';

const DESCRIPTION_MAX_LENGTH = 500;

@Component({
  selector: 'app-expense-form',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, PageHeader],
  templateUrl: './expense-form.html',
  styleUrl: './expense-form.css'
})
export class ExpenseForm implements OnInit {
  private fb = inject(FormBuilder);
  private client = inject(Client);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private notify = inject(NotificationService);
  private alert = inject(AlertService);

  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly isEditMode = signal(false);
  readonly existingExpenseNo = signal<string | null>(null);
  private expenseId: number | null = null;

  readonly categories = signal<ExpenseCategoryDto[]>([]);
  readonly paymentMethods = signal<PaymentMethodDto[]>([]);
  readonly descriptionMaxLength = DESCRIPTION_MAX_LENGTH;

  form = this.fb.group({
    expenseCategoryId: [null as number | null, Validators.required],
    expenseDate: [this.today(), Validators.required],
    amount: [null as number | null, [Validators.required, Validators.min(0.01)]],
    paymentMethodId: [null as number | null, Validators.required],
    description: ['', [Validators.maxLength(DESCRIPTION_MAX_LENGTH)]]
  });

  get breadcrumbSegments(): string[] {
    return ['Finance', 'Expenses', this.isEditMode() ? 'Edit Expense' : 'New Expense'];
  }
  get c() { return this.form.controls; }

  private today(): string { return new Date().toISOString().slice(0, 10); }

  ngOnInit(): void {
    this.client.expenseCategoriesAll().subscribe({
      next: (d) => this.categories.set(d),
      error: (err: any) => this.notify.danger(extractErrorMessage(err, 'Could not load categories.'))
    });

    this.client.paymentMethodsAll().subscribe({
      next: (d) => {
        this.paymentMethods.set(d);
        if (!this.isEditMode() && d.length > 0 && !this.c.paymentMethodId.value) {
          const cash = d.find((m) => m.name?.toLowerCase().includes('cash')) || d[0];
          this.c.paymentMethodId.setValue(cash.id!);
        }
      }
    });

    const idParam = this.route.snapshot.paramMap.get('id');
    if (!idParam) return;

    this.expenseId = Number(idParam);
    this.isEditMode.set(true);
    this.loading.set(true);

    this.client.expensesGET2(this.expenseId).subscribe({
      next: (e) => {
        this.existingExpenseNo.set(e.expenseNo ?? null);
        this.form.patchValue({
          expenseCategoryId: e.expenseCategoryId ?? null,
          expenseDate: e.expenseDate ? new Date(e.expenseDate).toISOString().slice(0, 10) : this.today(),
          amount: e.amount ?? null,
          paymentMethodId: e.paymentMethodId ?? null,
          description: e.description ?? ''
        });
        this.form.markAsPristine();
        this.loading.set(false);
      },
      error: (err: any) => {
        const msg = extractErrorMessage(err, 'Could not load this expense.');
        this.errorMessage.set(msg);
        this.notify.danger(msg);
        this.loading.set(false);
      }
    });
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      if (this.c.expenseCategoryId.invalid) this.notify.warning('Please select a category.');
      else if (this.c.amount.invalid) this.notify.warning('Amount must be greater than zero.');
      else if (this.c.paymentMethodId.invalid) this.notify.warning('Please select a payment method.');
      else this.notify.warning('Please complete all required fields.');
      return;
    }

    const v = this.form.getRawValue();
    this.errorMessage.set(null);
    this.saving.set(true);

    const dto = new CreateExpenseDto({
      expenseCategoryId: v.expenseCategoryId!,
      expenseDate: new Date(v.expenseDate!) as any,
      amount: Number(v.amount),
      paymentMethodId: v.paymentMethodId!,
      description: v.description?.trim() || undefined
    });

    const request$ = this.isEditMode()
      ? this.client.expensesPUT(this.expenseId!, dto)
      : this.client.expensesPOST(dto);

    request$.subscribe({
      next: (res) => {
        this.saving.set(false);
        this.form.markAsPristine();
        this.notify.success(this.isEditMode() ? 'Expense updated successfully.' : `Expense recorded: ${res.expenseNo}`);
        this.router.navigate(['/expenses']);
      },
      error: (err: any) => {
        this.saving.set(false);
        const msg = extractErrorMessage(err, 'Could not save this expense.');
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
    this.router.navigate(['/expenses']);
  }
}