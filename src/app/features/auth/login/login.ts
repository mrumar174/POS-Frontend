import { Component, AfterViewInit, ElementRef, ViewChild, inject, signal } from '@angular/core';
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
  templateUrl: './login.html',
  styleUrl: './login.css'
})
export class Login implements AfterViewInit {
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);
  private router = inject(Router);
  private notify = inject(NotificationService);

  @ViewChild('userNameInput') userNameInput?: ElementRef<HTMLInputElement>;

  readonly errorMessage = signal<string | null>(null);
  readonly loading = signal(false);
  readonly showPassword = signal(false);
  readonly showAdvanced = signal(false); // Tenant ID / Shop ID are edge-case fields

  form = this.fb.group({
    tenantId: [1, [Validators.required, Validators.min(1)]],
    userName: ['', Validators.required],
    password: ['', Validators.required],
    shopId: [null as number | null]
  });

  get userNameControl() {
    return this.form.controls.userName;
  }

  get passwordControl() {
    return this.form.controls.password;
  }

  get tenantIdControl() {
    return this.form.controls.tenantId;
  }

  ngAfterViewInit(): void {
    this.userNameInput?.nativeElement.focus();
  }

  togglePasswordVisibility(): void {
    this.showPassword.update((v) => !v);
  }

  toggleAdvanced(): void {
    this.showAdvanced.update((v) => !v);
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      if (this.userNameControl.hasError('required')) {
        this.notify.warning('Username is required.');
      } else if (this.passwordControl.hasError('required')) {
        this.notify.warning('Password is required.');
      } else if (this.tenantIdControl.hasError('required') || this.tenantIdControl.hasError('min')) {
        this.notify.warning('A valid Tenant ID is required.');
      }
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
        const message =
          typeof err.error === 'string' ? err.error : err.error?.message ?? 'Login failed. Check your details and try again.';
        this.errorMessage.set(message);
        this.notify.danger(message);
      }
    });
  }
}