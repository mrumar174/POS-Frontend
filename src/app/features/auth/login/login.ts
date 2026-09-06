import { Component, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '../../../core/services/auth.service';
import { LoginDto } from '../../../core/api/api-client';
import { NotificationService } from '../../../shared/notification/notification.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './login.html'
})
export class Login {
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);
  private router = inject(Router);
  private notify = inject(NotificationService);

  readonly errorMessage = signal<string | null>(null);
  readonly loading = signal(false);

  form = this.fb.group({
    tenantId: [1, [Validators.required, Validators.min(1)]],
    userName: ['', Validators.required],
    password: ['', Validators.required],
    shopId: [null as number | null]
  });

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.errorMessage.set(null);
    this.loading.set(true);
    const value = this.form.getRawValue();

    const dto = new LoginDto({
      tenantId: value.tenantId!,
      userName: value.userName!,
      password: value.password!,
      shopId: value.shopId ?? undefined
    });

    this.auth.login(dto).subscribe({
      next: () => {
        this.loading.set(false);
        this.notify.success('Logged in successfully.');
        this.router.navigate(['/categories']);
      },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        const message = typeof err.error === 'string' ? err.error : 'Login failed. Check your details and try again.';
        this.errorMessage.set(message);
        this.notify.danger(message);
      }
    });
  }
}