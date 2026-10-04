import { Component, OnInit, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Client, UpdateCompanySettingsDto } from '../../../core/api/api-client';
import { NotificationService } from '../../../shared/notification/notification.service';
import { PageHeader } from '../../../shared/page-header/page-header';

@Component({
  selector: 'app-company-settings',
  standalone: true,
  imports: [ReactiveFormsModule, PageHeader],
  templateUrl: './company-settings.html',
  styleUrl: './company-settings.css'
})
export class CompanySettingsComponent implements OnInit {
  private fb = inject(FormBuilder);
  private client = inject(Client);
  private notify = inject(NotificationService);

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly errorMessage = signal<string | null>(null);

  form = this.fb.group({
    companyName: ['', Validators.required],
    address: [''],
    contactNo: [''],
    email: ['', Validators.email],
    taxNumber: [''],
    currency: ['PKR', Validators.required],
    receiptHeader: [''],
    receiptFooter: [''],
    logoPath: ['']
  });

  ngOnInit(): void {
    // Generated method names might be companySettingsGET / companySettingsPUT
    // Update them based on your generated api-client.ts
    this.client.companySettingsGET().subscribe({
      next: (settings) => {
        this.form.patchValue({
          companyName: settings.companyName ?? '',
          address: settings.address ?? '',
          contactNo: settings.contactNo ?? '',
          email: settings.email ?? '',
          taxNumber: settings.taxNumber ?? '',
          currency: settings.currency ?? 'PKR',
          receiptHeader: settings.receiptHeader ?? '',
          receiptFooter: settings.receiptFooter ?? '',
          logoPath: settings.logoPath ?? ''
        });
        this.form.markAsPristine();
        this.loading.set(false);
      },
      error: (err: any) => {
        this.errorMessage.set('Could not load company settings.');
        this.notify.danger('Could not load company settings.');
        this.loading.set(false);
      }
    });
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.errorMessage.set(null);

    const val = this.form.getRawValue();
    const dto = new UpdateCompanySettingsDto({
      companyName: val.companyName!,
      address: val.address || undefined,
      contactNo: val.contactNo || undefined,
      email: val.email || undefined,
      taxNumber: val.taxNumber || undefined,
      currency: val.currency!,
      receiptHeader: val.receiptHeader || undefined,
      receiptFooter: val.receiptFooter || undefined,
      logoPath: val.logoPath || undefined
    });

    this.client.companySettingsPUT(dto).subscribe({
      next: () => {
        this.saving.set(false);
        this.form.markAsPristine();
        this.notify.success('Company settings updated successfully.');
      },
      error: (err: any) => {
        this.saving.set(false);
        this.errorMessage.set('Could not save company settings.');
        this.notify.danger('Could not save company settings.');
      }
    });
  }
}