import { Component, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '../../../core/services/auth.service';
import { TenantSignupDto } from '../../../core/api/api-client';

@Component({
  selector: 'app-signup',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './signup.html'
})
export class Signup {
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);
  private router = inject(Router);

  readonly errorMessage = signal<string | null>(null);
  readonly loading = signal(false);

  form = this.fb.group({
    businessName: ['', Validators.required],
    ownerName: ['', Validators.required],
    contactNo: ['', Validators.required],
    email: [''],
    address: [''],
    city: [''],
    mainShopName: ['Main Branch', Validators.required],
    adminUserName: ['', Validators.required],
    adminFullName: ['', Validators.required],
    adminPassword: ['', [Validators.required, Validators.minLength(6)]]
  });

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.errorMessage.set(null);
    this.loading.set(true);

    const dto = new TenantSignupDto(this.form.getRawValue() as any);

    this.auth.signup(dto).subscribe({
      next: () => {
        this.loading.set(false);
        this.router.navigate(['/categories']);
      },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        this.errorMessage.set(
          typeof err.error === 'string' ? err.error : 'Signup failed. Please check your details.'
        );
      }
    });
  }
}