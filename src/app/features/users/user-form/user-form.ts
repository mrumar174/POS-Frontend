import { Component, OnInit, AfterViewInit, ElementRef, ViewChild, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { Client, CreateUserDto, UpdateUserDto, RoleDto, ShopDto } from '../../../core/api/api-client';
import { NotificationService } from '../../../shared/notification/notification.service';
import { AlertService } from '../../../shared/alert/alert.service';
import { PageHeader } from '../../../shared/page-header/page-header';

@Component({
  selector: 'app-user-form',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, PageHeader],
  templateUrl: './user-form.html',
  styleUrl: './user-form.css'
})
export class UserForm implements OnInit, AfterViewInit {
  private fb = inject(FormBuilder);
  private client = inject(Client);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private notify = inject(NotificationService);
  private alert = inject(AlertService);

  @ViewChild('userNameInput') userNameInput?: ElementRef<HTMLInputElement>;

  readonly loading = signal(false);   // initial load (edit mode + roles/shops fetch)
  readonly saving = signal(false);    // submit in progress
  readonly errorMessage = signal<string | null>(null);
  readonly isEditMode = signal(false);
  readonly showPassword = signal(false);

  readonly allRoles = signal<RoleDto[]>([]);
  readonly allShops = signal<ShopDto[]>([]);
  readonly selectedRoleIds = signal<Set<number>>(new Set());
  readonly selectedShopIds = signal<Set<number>>(new Set());

  private userId: number | null = null;

  form = this.fb.group({
    userName: ['', Validators.required],
    fullName: ['', Validators.required],
    password: [''],
    contactNo: [''],
    address: ['']
  });

  get breadcrumbSegments(): string[] {
    return ['Identity & Access', this.isEditMode() ? 'Edit User' : 'Create User'];
  }

  get userNameControl() {
    return this.form.controls.userName;
  }

  get fullNameControl() {
    return this.form.controls.fullName;
  }

  get passwordControl() {
    return this.form.controls.password;
  }

  ngOnInit(): void {
    this.loading.set(true);

    this.client.rolesAll().subscribe({
      next: (data) => this.allRoles.set(data),
      error: () => this.notify.danger('Could not load the role list.')
    });
    this.client.shopsAll().subscribe({
      next: (data) => this.allShops.set(data),
      error: () => this.notify.danger('Could not load the shop list.')
    });

    const idParam = this.route.snapshot.paramMap.get('id');
    if (idParam) {
      this.userId = Number(idParam);
      this.isEditMode.set(true);
      this.passwordControl.clearValidators();

      this.client.usersGET(this.userId).subscribe({
        next: (user) => {
          this.form.patchValue({
            userName: user.userName,
            fullName: user.fullName,
            contactNo: user.contactNo ?? '',
            address: user.address ?? ''
          });
          this.selectedShopIds.set(new Set(user.shopIds ?? []));

          const names = new Set(user.roles ?? []);
          const trySelectRoles = () => {
            const matchedIds = this.allRoles().filter((r) => names.has(r.name!)).map((r) => r.id!);
            this.selectedRoleIds.set(new Set(matchedIds));
          };
          if (this.allRoles().length) trySelectRoles();
          else setTimeout(trySelectRoles, 300);

          this.form.markAsPristine();
          this.loading.set(false);
        },
        error: () => {
          this.errorMessage.set('Could not load this user.');
          this.notify.danger('Could not load this user.');
          this.loading.set(false);
        }
      });
    } else {
      this.passwordControl.addValidators([Validators.required, Validators.minLength(6)]);
      this.loading.set(false);
    }
  }

  ngAfterViewInit(): void {
    if (!this.isEditMode()) {
      this.userNameInput?.nativeElement.focus();
    }
  }

  togglePasswordVisibility(): void {
    this.showPassword.update((v) => !v);
  }

  toggleRole(id: number, checked: boolean): void {
    this.selectedRoleIds.update((set) => {
      const next = new Set(set);
      checked ? next.add(id) : next.delete(id);
      return next;
    });
    this.form.markAsDirty();
  }

  toggleShop(id: number, checked: boolean): void {
    this.selectedShopIds.update((set) => {
      const next = new Set(set);
      checked ? next.add(id) : next.delete(id);
      return next;
    });
    this.form.markAsDirty();
  }

  isRoleChecked(id: number): boolean {
    return this.selectedRoleIds().has(id);
  }

  isShopChecked(id: number): boolean {
    return this.selectedShopIds().has(id);
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.userNameInput?.nativeElement.focus();

      if (this.userNameControl.hasError('required')) {
        this.notify.warning('Username is required.');
      } else if (this.fullNameControl.hasError('required')) {
        this.notify.warning('Full name is required.');
      } else if (this.passwordControl.hasError('required')) {
        this.notify.warning('Password is required.');
      } else if (this.passwordControl.hasError('minlength')) {
        this.notify.warning('Password must be at least 6 characters.');
      }
      return;
    }

    this.errorMessage.set(null);
    this.saving.set(true);
    const v = this.form.getRawValue();
    const roleIds = Array.from(this.selectedRoleIds());
    const shopIds = Array.from(this.selectedShopIds());

    const request$ = this.isEditMode()
      ? this.client.usersPUT(this.userId!, new UpdateUserDto({
          id: this.userId!,
          userName: v.userName!,
          fullName: v.fullName!,
          contactNo: v.contactNo || undefined,
          address: v.address || undefined,
          roleIds,
          shopIds
        }))
      : this.client.usersPOST(new CreateUserDto({
          userName: v.userName!,
          fullName: v.fullName!,
          password: v.password!,
          contactNo: v.contactNo || undefined,
          address: v.address || undefined,
          roleIds,
          shopIds
        }));

    request$.subscribe({
      next: () => {
        this.saving.set(false);
        this.form.markAsPristine();
        this.notify.success(this.isEditMode() ? 'User updated successfully.' : 'User created successfully.');
        this.router.navigate(['/users']);
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        const message = typeof err.error === 'string' ? err.error : err.error?.message ?? 'Could not save this user.';
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
    this.router.navigate(['/users']);
  }
}